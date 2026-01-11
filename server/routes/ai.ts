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
import { authenticateJWT } from '../middleware/auth';
import { logAIRequest } from '../services/auditService';
import { 
  getGeminiService, 
  GeminiConfigError, 
  GeminiRateLimitError, 
  GeminiValidationError,
  GeminiTimeoutError 
} from '../services/geminiService';

const router = express.Router();

// 🚦 Rate Limiting : 100 requêtes/jour pour analyse
const analyzeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24h
  max: 100,
  message: { error: 'Limite de 100 analyses/jour atteinte. Réessayez demain.' },
  standardHeaders: true,
  legacyHeaders: false
});

// 🚦 Rate Limiting : 50 requêtes/jour pour assistant
const assistantLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24h
  max: 50,
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
    
    // Validation basique
    if (!input) {
      return res.status(400).json({ error: 'Input manquant' });
    }
    
    if (typeof input !== 'string') {
      return res.status(400).json({ error: 'Input doit être une chaîne' });
    }
    
    // ✅ Utiliser GeminiService avec retry automatique et gestion d'erreurs avancée
    const geminiService = getGeminiService();
    const result = await geminiService.analyzeTransitInfo(input, mimeType);
    
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
      console.error('[AI Config Error]:', errorMsg);
    } else if (error instanceof GeminiRateLimitError) {
      statusCode = 429;
      userMessage = 'Limite API atteinte. Veuillez réessayer dans quelques instants.';
      console.warn('[AI Rate Limit]:', errorMsg);
    } else if (error instanceof GeminiValidationError) {
      statusCode = 400;
      userMessage = 'Données invalides: ' + errorMsg;
      console.warn('[AI Validation]:', errorMsg);
    } else if (error instanceof GeminiTimeoutError) {
      statusCode = 504;
      userMessage = 'Délai d\'attente dépassé. Réessayez avec un document plus petit.';
      console.warn('[AI Timeout]:', errorMsg);
    } else {
      console.error('[AI Unknown Error]:', error);
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
    
    // Validation basique
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question invalide' });
    }
    
    // ✅ Utiliser GeminiService avec support sessions conversationnelles
    const geminiService = getGeminiService();
    const result = await geminiService.askCustomsAssistant(
      question,
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
      console.error('[AI Config Error]:', errorMsg);
    } else if (error instanceof GeminiRateLimitError) {
      statusCode = 429;
      userMessage = 'Trop de questions. Patientez quelques instants.';
      console.warn('[AI Rate Limit]:', errorMsg);
    } else if (error instanceof GeminiValidationError) {
      statusCode = 400;
      userMessage = 'Question invalide: ' + errorMsg;
      console.warn('[AI Validation]:', errorMsg);
    } else if (error instanceof GeminiTimeoutError) {
      statusCode = 504;
      userMessage = 'Délai d\'attente dépassé. Réessayez.';
      console.warn('[AI Timeout]:', errorMsg);
    } else {
      console.error('[AI Unknown Error]:', error);
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

