/**
 * ROUTES WEBAUTHN - AUTHENTIFICATION BIOMÉTRIQUE
 * Face ID / Touch ID / Windows Hello
 */

import express, { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticateJWT } from '../middleware/auth';
import { redis } from '../config/redis';
import { logger, logError, logSecurity } from '../config/logger';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const router = express.Router();

// Rate limiter pour routes biométriques
const webauthnLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives/15min
  message: 'Trop de tentatives biométriques. Réessayez plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // ✅ Désactiver validation proxy stricte
});

// Whitelist domaines autorisés
const ALLOWED_RP_IDS = ['localhost', 'transit.guinee.gn', 'www.transit.guinee.gn'];

// Helper pour obtenir le rpId correct
const getRpId = (hostname: string): string => {
  // En dev, toujours utiliser 'localhost'
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('localhost')) {
    return 'localhost';
  }
  
  // Vérifier whitelist
  if (ALLOWED_RP_IDS.includes(hostname)) {
    return hostname;
  }
  
  throw new Error(`Invalid RP ID: ${hostname}`);
};

/**
 * 🔐 ENREGISTREMENT BIOMÉTRIQUE
 * Génère les options pour créer une nouvelle credential
 */
router.post('/register-options', authenticateJWT, webauthnLimiter, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }

    const user = await prisma.user.findUnique({
      where: { email: req.user.email }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    // Générer un challenge aléatoire
    const challenge = crypto.randomBytes(32).toString('base64url');

    // Stocker le challenge en Redis avec TTL 5min
    await redis.set(`webauthn:challenge:${user.id}`, challenge, 300);

    // Options WebAuthn pour navigator.credentials.create()
    const options = {
      challenge,
      rp: {
        name: 'TransitGuinée',
        id: getRpId(req.hostname)
      },
      user: {
        id: Buffer.from(user.id).toString('base64url'),
        name: user.email,
        displayName: user.name || user.email
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },  // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Force biométrie intégrée
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'none'
    };

    res.json({ success: true, options });
  } catch (error) {
    logError('WebAuthn register options error', error as Error);
    res.status(500).json({ success: false, message: 'Erreur génération options' });
  }
});

/**
 * ✅ VÉRIFICATION ENREGISTREMENT
 * Vérifie et stocke la credential créée
 */
router.post('/register-verify', authenticateJWT, webauthnLimiter, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }

    const { credentialId, publicKey, counter, deviceName } = req.body;

    // Validation inputs
    if (!credentialId || typeof credentialId !== 'string' || credentialId.length > 500) {
      return res.status(400).json({ success: false, message: 'CredentialId invalide' });
    }
    
    if (!publicKey || typeof publicKey !== 'string' || publicKey.length > 2000) {
      return res.status(400).json({ success: false, message: 'PublicKey invalide' });
    }

    // Stocker la credential en base
    await prisma.webAuthnCredential.create({
      data: {
        userId: req.user.id,
        credentialId,
        publicKey,
        counter: counter || 0,
        deviceName: deviceName || 'Appareil inconnu'
      }
    });
    
    logSecurity('BIOMETRIC_REGISTERED', { userId: req.user.id, deviceName });

    res.json({ 
      success: true, 
      message: 'Biométrie configurée avec succès' 
    });
  } catch (error) {
    logError('WebAuthn register verify error', error as Error);
    res.status(500).json({ success: false, message: 'Erreur enregistrement' });
  }
});

/**
 * 🔓 OPTIONS DÉVERROUILLAGE
 * Génère les options pour authentification rapide
 * Route accessible SANS JWT (utilisateur verrouillé)
 */
router.post('/unlock-options', webauthnLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Validation email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Email requis' });
    }

    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    // Récupérer les credentials de l'utilisateur
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
      select: { credentialId: true }
    });

    if (credentials.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Aucune biométrie configurée' 
      });
    }

    // Générer challenge et stocker dans Redis
    const challenge = crypto.randomBytes(32).toString('base64url');
    await redis.set(`webauthn:challenge:${user.id}`, challenge, 300); // 5min TTL

    // Options WebAuthn pour navigator.credentials.get()
    const options = {
      challenge,
      rpId: getRpId(req.hostname),
      allowCredentials: credentials.map(c => ({
        type: 'public-key' as const,
        id: c.credentialId
      })),
      userVerification: 'required' as const,
      timeout: 30000
    };

    res.json({ success: true, options, userId: user.id });
  } catch (error) {
    logError('WebAuthn unlock options error', error as Error);
    res.status(500).json({ success: false, message: 'Erreur génération options' });
  }
});

/**
 * ✅ VÉRIFICATION DÉVERROUILLAGE
 * Vérifie la signature biométrique
 * Route accessible SANS JWT (utilisateur verrouillé)
 */
router.post('/unlock-verify', webauthnLimiter, async (req: Request, res: Response) => {
  try {
    const { credentialId, signature, authenticatorData, clientDataJSON, userId, challenge } = req.body;

    // Validation inputs
    if (!credentialId || typeof credentialId !== 'string') {
      return res.status(400).json({ success: false, message: 'CredentialId manquant' });
    }
    
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ success: false, message: 'Signature manquante' });
    }
    
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, message: 'UserId manquant' });
    }

    // Récupérer la credential en base
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId }
    });

    if (!credential || credential.userId !== userId) {
      logSecurity('WEBAUTHN_INVALID_CREDENTIAL', { userId, credentialId });
      return res.status(401).json({ 
        success: false, 
        message: 'Credential invalide' 
      });
    }

    // Vérifier le challenge depuis Redis
    const storedChallenge = await redis.get(`webauthn:challenge:${userId}`);
    if (!storedChallenge || storedChallenge !== challenge) {
      logSecurity('WEBAUTHN_CHALLENGE_MISMATCH', { userId });
      return res.status(401).json({ 
        success: false, 
        message: 'Challenge invalide ou expiré' 
      });
    }

    // Vérifier le counter (protection replay attacks)
    if (authenticatorData) {
      try {
        const authDataBuffer = Buffer.from(authenticatorData, 'base64');
        if (authDataBuffer.length >= 37) {
          const receivedCounter = authDataBuffer.readUInt32BE(33);
          
          if (receivedCounter <= credential.counter) {
            logSecurity('WEBAUTHN_COUNTER_ANOMALY', { 
              userId, 
              expected: credential.counter, 
              received: receivedCounter 
            });
            return res.status(401).json({ 
              success: false, 
              message: 'Anomalie détectée - counter invalide' 
            });
          }
        }
      } catch (counterError) {
        logger.warn('Counter verification failed', { error: counterError });
      }
    }

    // Vérifier la signature cryptographique
    try {
      const publicKeyBuffer = Buffer.from(credential.publicKey, 'base64');
      const signatureBuffer = Buffer.from(signature, 'base64');
      const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
      const dataBuffer = Buffer.concat([
        Buffer.from(authenticatorData, 'base64'),
        clientDataHash
      ]);

      const isValid = crypto.verify(
        'sha256',
        dataBuffer,
        { key: publicKeyBuffer, format: 'der', type: 'spki' },
        signatureBuffer
      );

      if (!isValid) {
        logSecurity('WEBAUTHN_SIGNATURE_INVALID', { userId, credentialId });
        return res.status(401).json({ 
          success: false, 
          message: 'Signature invalide' 
        });
      }
    } catch (verifyError) {
      logError('WebAuthn signature verification failed', verifyError as Error, { userId });
      return res.status(401).json({ 
        success: false, 
        message: 'Vérification signature échouée' 
      });
    }

    // Supprimer le challenge utilisé
    await redis.del(`webauthn:challenge:${userId}`);

    // Mettre à jour lastUsedAt et counter
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        lastUsedAt: new Date(),
        counter: credential.counter + 1
      }
    });
    
    logSecurity('BIOMETRIC_UNLOCK_SUCCESS', { userId, credentialId });

    res.json({ 
      success: true, 
      message: 'Déverrouillage réussi' 
    });
  } catch (error) {
    logError('WebAuthn unlock verify error', error as Error);
    res.status(500).json({ success: false, message: 'Erreur vérification' });
  }
});

/**
 * 📋 LISTE DES APPAREILS
 */
router.get('/devices', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }

    const devices = await prisma.webAuthnCredential.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        deviceName: true,
        createdAt: true,
        lastUsedAt: true
      },
      orderBy: { lastUsedAt: 'desc' }
    });

    res.json({ success: true, devices });
  } catch (error) {
    logError('WebAuthn list devices error', error as Error);
    res.status(500).json({ success: false, message: 'Erreur récupération' });
  }
});

/**
 * 🗑️ SUPPRIMER UN APPAREIL
 */
router.delete('/devices/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }

    const { id } = req.params;

    const deleted = await prisma.webAuthnCredential.deleteMany({
      where: {
        id,
        userId: req.user.id // Sécurité: ne supprimer que ses propres appareils
      }
    });
    
    if (deleted.count > 0) {
      logSecurity('BIOMETRIC_DEVICE_DELETED', { userId: req.user.id, deviceId: id });
    }

    res.json({ success: true, message: 'Appareil supprimé' });
  } catch (error) {
    logError('WebAuthn delete device error', error as Error);
    res.status(500).json({ success: false, message: 'Erreur suppression' });
  }
});

export default router;
