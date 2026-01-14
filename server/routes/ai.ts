/**
 * 🔒 AI Routes - Backend Proxy Sécurisé pour Gemini API
 * 
 * SÉCURITÉ :
 * - Clé API Gemini stockée côté serveur uniquement (GEMINI_API_KEY)
 * - Authentification JWT obligatoire
 * - Rate limiting : 100 requêtes/jour pour /analyze, 50 pour /assistant
 * - Validation des inputs
 * - Audit logs de toutes les requêtes
 * 
 * ENDPOINTS :
 * - POST /api/ai/analyze - Analyse documents (facture, BL, etc.)
 * - POST /api/ai/assistant - Assistant douanes conversationnel
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import { authenticateJWT } from '../middleware/auth';
import { logAIRequest } from '../services/auditService';
import { logger, logError } from '../config/logger';
import { 
  getGeminiService, 
  GeminiConfigError, 
  GeminiRateLimitError, 
  GeminiValidationError,
  GeminiTimeoutError 
} from '../services/geminiService';

const router = express.Router();

// � CONSTANTES DE SÉCURITÉ
const MAX_INPUT_LENGTH = 100 * 1024; // 100KB max pour documents
const MAX_QUESTION_LENGTH = 5 * 1024; // 5KB max pour questions
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];

// 🚦 Rate Limiting : 100 requêtes/jour pour analyse (per-user)
const analyzeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24h
  max: 100,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous', // ✅ Per-user rate limiting
  message: { error: 'Limite de 100 analyses/jour atteinte. Réessayez demain.' },
  standardHeaders: true,
  legacyHeaders: false
});

// 🚦 Rate Limiting : 50 requêtes/jour pour assistant (per-user)
const assistantLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24h
  max: 50,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous', // ✅ Per-user rate limiting
  message: { error: 'Limite de 50 questions/jour atteinte. Réessayez demain.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /api/ai/analyze
 * Analyse un document de transit (image/PDF/text) via Gemini
 */
router.post('/analyze', authenticateJWT, analyzeLimiter, async (req, res) => {
  const startTime = Date.now();
  let outputLength = 0;
  
  try {
    const { input, mimeType } = req.body;
    
    // ✅ Validation stricte input
    if (!input) {
      return res.status(400).json({ error: 'Input manquant' });
    }
    
    if (typeof input !== 'string') {
      return res.status(400).json({ error: 'Input doit être une chaîne' });
    }
    
    // ✅ Protection DoS : limite taille input
    if (input.length > MAX_INPUT_LENGTH) {
      return res.status(413).json({ 
        error: `Input trop volumineux (max ${MAX_INPUT_LENGTH / 1024}KB)` 
      });
    }
    
    // ✅ Validation MIME type (whitelist)
    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({ 
        error: 'Type de fichier non autorisé',
        allowed: ALLOWED_MIME_TYPES
      });
    }
    
    // ✅ Sanitization XSS sur input textuel
    const sanitizedInput = validator.escape(input);
    
    // ✅ Utiliser GeminiService avec retry automatique et gestion d'erreurs avancée
    const geminiService = getGeminiService();
    const result = await geminiService.analyzeTransitInfo(sanitizedInput, mimeType);
    
    outputLength = JSON.stringify(result).length;
    const duration = Date.now() - startTime;
    
    // 📝 Audit log succès
    await logAIRequest({
      userId: req.user!.id,
      endpoint: '/api/ai/analyze',
      model: 'gemini-1.5-flash',
      inputLength: input.length,
      outputLength,
      duration,
      success: true,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json(result);
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMsg = error?.message || 'Erreur inconnue';
    
    // ✅ Gestion d'erreurs spécifiques avec codes HTTP appropriés
    let statusCode = 500;
    let userMessage = 'Analyse impossible';
    
    if (error instanceof GeminiConfigError) {
      statusCode = 500;
      userMessage = 'Erreur configuration serveur';
      logError('AI Config Error', error, { userId: req.user?.id, endpoint: '/analyze' });
    } else if (error instanceof GeminiRateLimitError) {
      statusCode = 429;
      userMessage = 'Limite API atteinte. Veuillez réessayer dans quelques instants.';
      logger.warn('AI Rate Limit reached', { error: errorMsg, userId: req.user?.id });
    } else if (error instanceof GeminiValidationError) {
      statusCode = 400;
      userMessage = 'Données invalides: ' + errorMsg;
      logger.warn('AI Validation error', { error: errorMsg, userId: req.user?.id });
    } else if (error instanceof GeminiTimeoutError) {
      statusCode = 504;
      userMessage = 'Délai d\'attente dépassé. Réessayez avec un document plus petit.';
      logger.warn('AI Timeout', { error: errorMsg, userId: req.user?.id });
    } else {
      logError('AI Unknown Error', error as Error, { userId: req.user?.id });
    }
    
    // 📝 Audit log erreur
    await logAIRequest({
      userId: req.user!.id,
      endpoint: '/api/ai/analyze',
      model: 'gemini-1.5-flash',
      inputLength: req.body.input?.length || 0,
      outputLength: 0,
      duration,
      success: false,
      error: errorMsg,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.status(statusCode).json({ 
      error: userMessage,
      details: process.env.NODE_ENV === 'development' ? errorMsg : undefined
    });
  }
});

/**
 * POST /api/ai/assistant
 * Assistant conversationnel pour réglementation douanes Guinée
 */
router.post('/assistant', authenticateJWT, assistantLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { question, sessionId } = req.body;
    
    // ✅ Validation stricte question
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question invalide' });
    }
    
    // ✅ Protection DoS : limite taille question
    if (question.length > MAX_QUESTION_LENGTH) {
      return res.status(413).json({ 
        error: `Question trop longue (max ${MAX_QUESTION_LENGTH / 1024}KB)` 
      });
    }
    
    // ✅ Validation sessionId (UUID v4)
    if (sessionId && !validator.isUUID(sessionId, 4)) {
      return res.status(400).json({ error: 'SessionId invalide (UUID v4 requis)' });
    }
    
    // ✅ Sanitization XSS
    const sanitizedQuestion = validator.escape(question);
    
    // ✅ Utiliser GeminiService avec support sessions conversationnelles
    const geminiService = getGeminiService();
    const result = await geminiService.askCustomsAssistant(
      sanitizedQuestion,
      req.user!.id,
      sessionId || null // Passer sessionId pour continuer conversation
    );
    
    const duration = Date.now() - startTime;
    
    // 📝 Audit log succès
    await logAIRequest({
      userId: req.user!.id,
      endpoint: '/api/ai/assistant',
      model: 'gemini-1.5-flash',
      inputLength: question.length,
      outputLength: result.answer.length,
      duration,
      success: true,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json(result); // { sessionId, answer, confidence }
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMsg = error?.message || 'Erreur inconnue';
    
    // ✅ Gestion d'erreurs spécifiques
    let statusCode = 500;
    let userMessage = 'Réponse impossible';
    
    if (error instanceof GeminiConfigError) {
      statusCode = 500;
      userMessage = 'Erreur configuration serveur';
      logError('AI Config Error', error, { userId: req.user?.id, endpoint: '/assistant' });
    } else if (error instanceof GeminiRateLimitError) {
      statusCode = 429;
      userMessage = 'Trop de questions. Patientez quelques instants.';
      logger.warn('AI Rate Limit reached', { error: errorMsg, userId: req.user?.id });
    } else if (error instanceof GeminiValidationError) {
      statusCode = 400;
      userMessage = 'Question invalide: ' + errorMsg;
      logger.warn('AI Validation error', { error: errorMsg, userId: req.user?.id });
    } else if (error instanceof GeminiTimeoutError) {
      statusCode = 504;
      userMessage = 'Délai d\'attente dépassé. Réessayez.';
      logger.warn('AI Timeout', { error: errorMsg, userId: req.user?.id });
    } else {
      logError('AI Unknown Error', error as Error, { userId: req.user?.id });
    }
    
    // 📝 Audit log erreur
    await logAIRequest({
      userId: req.user!.id,
      endpoint: '/api/ai/assistant',
      model: 'gemini-1.5-flash',
      inputLength: req.body.question?.length || 0,
      outputLength: 0,
      duration,
      success: false,
      error: errorMsg,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.status(statusCode).json({ 
      error: userMessage,
      details: process.env.NODE_ENV === 'development' ? errorMsg : undefined
    });
  }
});

export default router;

