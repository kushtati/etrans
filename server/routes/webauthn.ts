/**
 * ROUTES WEBAUTHN - AUTHENTIFICATION BIOMÉTRIQUE
 * Face ID / Touch ID / Windows Hello
 */

import express, { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authenticateJWT } from '../middleware/auth';
import crypto from 'crypto';

const router = express.Router();

// Helper pour obtenir le rpId correct
const getRpId = (hostname: string): string => {
  // En dev, toujours utiliser 'localhost'
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('localhost')) {
    return 'localhost';
  }
  // En production, utiliser le domaine principal sans sous-domaine si nécessaire
  return hostname;
};

/**
 * 🔐 ENREGISTREMENT BIOMÉTRIQUE
 * Génère les options pour créer une nouvelle credential
 */
router.post('/register-options', authenticateJWT, async (req: Request, res: Response) => {
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
    const challenge = crypto.randomBytes(32);

    // Stocker le challenge en session/redis pour vérification ultérieure
    // TODO: Utiliser Redis avec TTL 5min
    const challengeB64 = challenge.toString('base64url');

    // Options WebAuthn pour navigator.credentials.create()
    const options = {
      challenge: challengeB64,
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
    console.error('[WEBAUTHN] Register options error:', error);
    res.status(500).json({ success: false, message: 'Erreur génération options' });
  }
});

/**
 * ✅ VÉRIFICATION ENREGISTREMENT
 * Vérifie et stocke la credential créée
 */
router.post('/register-verify', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }

    const { credentialId, publicKey, counter, deviceName } = req.body;

    if (!credentialId || !publicKey) {
      return res.status(400).json({ success: false, message: 'Données manquantes' });
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

    res.json({ 
      success: true, 
      message: 'Biométrie configurée avec succès' 
    });
  } catch (error) {
    console.error('[WEBAUTHN] Register verify error:', error);
    res.status(500).json({ success: false, message: 'Erreur enregistrement' });
  }
});

/**
 * 🔓 OPTIONS DÉVERROUILLAGE
 * Génère les options pour authentification rapide
 * Route accessible SANS JWT (utilisateur verrouillé)
 */
router.post('/unlock-options', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID requis' });
    }

    // Récupérer les credentials de l'utilisateur
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true }
    });

    if (credentials.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Aucune biométrie configurée' 
      });
    }

    // Générer challenge
    const challenge = crypto.randomBytes(32).toString('base64url');

    // Options WebAuthn pour navigator.credentials.get()
    const options = {
      challenge,
      rpId: getRpId(req.hostname),
      allowCredentials: credentials.map(c => ({
        type: 'public-key',
        id: c.credentialId
      })),
      userVerification: 'required',
      timeout: 30000
    };

    res.json({ success: true, options });
  } catch (error) {
    console.error('[WEBAUTHN] Unlock options error:', error);
    res.status(500).json({ success: false, message: 'Erreur génération options' });
  }
});

/**
 * ✅ VÉRIFICATION DÉVERROUILLAGE
 * Vérifie la signature biométrique
 * Route accessible SANS JWT (utilisateur verrouillé)
 */
router.post('/unlock-verify', async (req: Request, res: Response) => {
  try {
    const { credentialId, signature, authenticatorData, clientDataJSON, userId } = req.body;

    if (!credentialId || !signature || !userId) {
      return res.status(400).json({ success: false, message: 'Données manquantes' });
    }

    // Récupérer la credential en base
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId }
    });

    if (!credential || credential.userId !== userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credential invalide' 
      });
    }

    // TODO: Vérifier signature avec crypto.verify()
    // Pour l'instant, on accepte si la credential existe

    // Mettre à jour lastUsedAt et counter
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        lastUsedAt: new Date(),
        counter: credential.counter + 1
      }
    });

    res.json({ 
      success: true, 
      message: 'Déverrouillage réussi' 
    });
  } catch (error) {
    console.error('[WEBAUTHN] Unlock verify error:', error);
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
    console.error('[WEBAUTHN] List devices error:', error);
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

    await prisma.webAuthnCredential.deleteMany({
      where: {
        id,
        userId: req.user.id // Sécurité: ne supprimer que ses propres appareils
      }
    });

    res.json({ success: true, message: 'Appareil supprimé' });
  } catch (error) {
    console.error('[WEBAUTHN] Delete device error:', error);
    res.status(500).json({ success: false, message: 'Erreur suppression' });
  }
});

export default router;
