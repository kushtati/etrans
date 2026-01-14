/**
 * 🤖 Service Gemini avec Gestion d'Erreurs Robuste
 * 
 * Features :
 * - Retry automatique avec backoff exponentiel
 * - Distinction types d'erreurs (400/401/429/500)
 * - Validation schéma réponses
 * - Logging détaillé
 * - Timeout configurable
 */

import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { logger, logError } from '../config/logger';
import { 
  AnalysisTextInputSchema,
  AnalysisImageInputSchema,
  AssistantQuestionSchema,
  validateInput,
  estimateTokenCost,
  sanitizeText
} from '../utils/validation.js';
import {
  buildAnalysisPrompt,
  buildAssistantPrompt,
  IMAGE_ANALYSIS_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  GEMINI_CONFIGS,
  validateAnalysisResponse
} from '../prompts/gemini.js';
import {
  getOrCreateChatSession,
  addMessageToSession,
  getConversationHistory
} from './chatService.js';

// Types
export interface TransitAnalysisResult {
  detectedType: string;
  summary: string;
  potentialHsCodes: string[];
  riskAnalysis: string;
  extractedFields: {
    shipmentDescription?: string;
    origin?: string;
    weight?: string;
    containerInfo?: string;
    estimatedArrival?: string;
  };
}

export interface CustomsAssistantResult {
  answer: string;
  confidence?: number;
}

export interface GeminiConfig {
  maxRetries: number;
  baseDelay: number;
  timeout: number;
  model: string;
}

// Configuration par défaut
const DEFAULT_CONFIG: GeminiConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  timeout: 30000,
  model: 'gemini-1.5-flash'
};

// Erreurs custom
export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiConfigError';
  }
}

export class GeminiRateLimitError extends Error {
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'GeminiRateLimitError';
  }
}

export class GeminiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiValidationError';
  }
}

export class GeminiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiTimeoutError';
  }
}

/**
 * Pause avec Promise
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Classe principale service Gemini
 */
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private config: GeminiConfig;

  constructor(apiKey: string, config: Partial<GeminiConfig> = {}) {
    if (!apiKey) {
      throw new GeminiConfigError('API Key manquante');
    }
    
    // En développement : accepter placeholders (désactive Gemini)
    const isPlaceholder = apiKey.includes('YOUR_GEMINI') || 
                          apiKey.includes('CHANGE_ME') || 
                          apiKey.includes('OPTIONNEL') ||
                          apiKey === 'test-key-dev';
    
    if (process.env.NODE_ENV !== 'production' && isPlaceholder) {
      logger.warn('Gemini API Key placeholder détectée - AI désactivé');
      this.ai = null; // Pas d'init client en dev avec placeholder
      this.config = { ...DEFAULT_CONFIG, ...config };
      return;
    }
    
    // Validation format API key Google (AIzaSy* OU AIza* OU gen-lang-client-* - min 20 chars)
    const isValidFormat = (
      apiKey.startsWith('AIzaSy') || 
      apiKey.startsWith('AIza') || 
      apiKey.startsWith('gen-lang-client-')
    ) && apiKey.length >= 20;
    
    if (!isValidFormat) {
      throw new GeminiConfigError(`Format API key invalide: doit commencer par AIza* ou gen-lang-client-* (longueur: ${apiKey.length})`);
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyse document de transit avec retry
   */
  async analyzeTransitInfo(
    input: string,
    mimeType?: string
  ): Promise<TransitAnalysisResult> {
    const startTime = Date.now();
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        logger.info('Gemini analyzeTransitInfo attempt', { 
          attempt, 
          maxRetries: this.config.maxRetries 
        });

        // 🛡️ Validation basique input
        if (!input || input.length === 0) {
          throw new GeminiValidationError('Input vide');
        }

        // 🛡️ Déterminer type input et valider avec Zod
        const isImageData = mimeType && 
          (mimeType.startsWith('image/') || mimeType === 'application/pdf') && 
          input.startsWith('data:');

        if (isImageData) {
          // Validation image base64
          const validation = validateInput(
            AnalysisImageInputSchema,
            { data: input, mimeType },
            'analyzeTransitInfo:image'
          );

          if (!validation.success) {
            throw new GeminiValidationError((validation as { error: string }).error);
          }
        } else {
          // Validation texte avec détection injection
          const validation = validateInput(
            AnalysisTextInputSchema,
            { text: input },
            'analyzeTransitInfo:text'
          );

          if (!validation.success) {
            throw new GeminiValidationError((validation as { error: string }).error);
          }

          // Sanitization + estimation coût
          input = sanitizeText(validation.data.text);
          const { estimatedTokens, estimatedCostUSD } = estimateTokenCost(input);
          
          logger.info('Gemini input validated', { 
            inputLength: input.length, 
            estimatedTokens, 
            estimatedCostUSD: estimatedCostUSD.toFixed(6) 
          });
        }

        // Construire contents pour Gemini
        let contents: any;

        if (isImageData) {
          const base64Data = input.split(',')[1];
          if (!base64Data) {
            throw new GeminiValidationError('Image base64 invalide');
          }
          
          contents = [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: base64Data,
                  }
                },
                {
                  text: IMAGE_ANALYSIS_PROMPT // 🎯 Prompt optimisé avec contexte Guinée
                }
              ]
            }
          ];
        } else {
          contents = buildAnalysisPrompt(input); // 🎯 Prompt optimisé avec few-shot examples
        }

        // Appel Gemini avec timeout
        const responsePromise = this.ai!.models.generateContent({
          model: this.config.model,
          contents: isImageData 
            ? contents
            : contents, // Prompt déjà construit
          config: {
            ...GEMINI_CONFIGS.analysis, // 🎯 Température optimale (0.1) pour précision
            responseMimeType: "application/json",
            responseSchema: ANALYSIS_RESPONSE_SCHEMA // 🎯 Schéma enrichi avec riskFlags, confidence, etc.
          }
        });

        // Timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new GeminiTimeoutError(
              `Timeout après ${this.config.timeout}ms`
            ));
          }, this.config.timeout);
        });

        const response = await Promise.race([
          responsePromise,
          timeoutPromise
        ]) as GenerateContentResponse;

        // Validation réponse
        if (!response.text) {
          throw new GeminiValidationError('Réponse vide de Gemini');
        }

        let parsed: TransitAnalysisResult;
        try {
          parsed = JSON.parse(response.text);
        } catch (e) {
          throw new GeminiValidationError(
            `JSON invalide: ${response.text.substring(0, 100)}`
          );
        }

        // Validation schéma
        if (!parsed.detectedType || !parsed.summary) {
          throw new GeminiValidationError(
            'Réponse manque champs requis (detectedType, summary)'
          );
        }

        // 🎯 Validation cohérence (formats BL, conteneur, codes HS)
        const validation = validateAnalysisResponse(parsed);
        if (!validation.valid) {
          logger.warn('Gemini validation warnings', { 
            errors: validation.errors,
            detectedType: parsed.detectedType 
          });
          // Continuer quand même mais logger les warnings
        }

        const duration = Date.now() - startTime;
        logger.info('Gemini analysis success', { 
          durationMs: duration,
          detectedType: parsed.detectedType 
        });

        return parsed;

      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        logError('Gemini analysis attempt failed', error, {
          attempt,
          durationMs: duration,
          errorName: error.name,
          errorStatus: error.status
        });

        // Erreurs de configuration (non retryable)
        if (error instanceof GeminiConfigError) {
          throw error;
        }

        // Erreurs 400/401/403 (non retryable)
        if (error.status === 400 || error.status === 401 || error.status === 403) {
          throw new GeminiConfigError(
            'Service temporairement indisponible. Vérifiez la configuration.'
          );
        }

        // Rate limit 429
        if (error.status === 429) {
          if (attempt < this.config.maxRetries) {
            const delay = this.config.baseDelay * Math.pow(2, attempt - 1);
            logger.info('Gemini rate limit retry', { delayMs: delay, attempt });
            await sleep(delay);
            continue;
          }
          throw new GeminiRateLimitError(
            'Service temporairement saturé. Réessayez dans quelques minutes.'
          );
        }

        // Timeout
        if (error instanceof GeminiTimeoutError) {
          if (attempt < this.config.maxRetries) {
            const delay = this.config.baseDelay * Math.pow(2, attempt - 1);
            logger.info('Gemini timeout retry', { delayMs: delay, attempt });
            await sleep(delay);
            continue;
          }
          throw error;
        }

        // Validation errors (non retryable)
        if (error instanceof GeminiValidationError) {
          throw error;
        }

        // Network/500 errors (retryable)
        if (attempt < this.config.maxRetries) {
          const delay = this.config.baseDelay * Math.pow(2, attempt - 1);
          logger.info('Gemini temporary error retry', { delayMs: delay, attempt });
          await sleep(delay);
          continue;
        }

        // Dernier essai échoué
        throw new Error(
          `Analyse échouée après ${this.config.maxRetries} tentatives: ${error.message}`
        );
      }
    }

    throw new Error('Max retries atteint');
  }

  /**
   * Assistant douanes conversationnel avec mémoire
   */
  async askCustomsAssistant(
    question: string,
    userId: string,
    sessionId?: string | null
  ): Promise<{ sessionId: string; answer: string; confidence?: number }> {
    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        logger.info('Gemini assistant attempt', { 
          attempt, 
          maxRetries: this.config.maxRetries,
          userId 
        });

        // 🛡️ Validation Zod avec détection injection
        const validation = validateInput(
          AssistantQuestionSchema,
          { question },
          'askCustomsAssistant'
        );

        if (!validation.success) {
          throw new GeminiValidationError((validation as { error: string }).error);
        }

        // Sanitization
        question = sanitizeText(validation.data.question);
        
        const { estimatedTokens, estimatedCostUSD } = estimateTokenCost(question);
        logger.info('Gemini question validated', { 
          questionLength: question.length, 
          estimatedTokens, 
          estimatedCostUSD: estimatedCostUSD.toFixed(6),
          userId 
        });

        // 💬 Récupérer ou créer session de chat
        const session = getOrCreateChatSession(sessionId || null, userId);
        
        // Ajouter question utilisateur à l'historique
        addMessageToSession(session.id, 'user', question);
        
        // Récupérer historique conversationnel
        const conversationHistory = getConversationHistory(session.id);
        
        // 🎯 Construire prompt avec historique
        const promptWithHistory = conversationHistory
          ? `${buildAssistantPrompt(question)}\n\nHISTORIQUE CONVERSATION:\n${conversationHistory}`
          : buildAssistantPrompt(question);
        
        logger.info('Gemini session context', { 
          sessionId: session.id, 
          messageCount: session.messages.length,
          userId 
        });

        // Appel Gemini avec timeout
        const responsePromise = this.ai!.models.generateContent({
          model: this.config.model,
          contents: promptWithHistory, // 🎯 Prompt avec contexte conversationnel
          config: GEMINI_CONFIGS.assistant // 🎯 Température 0.7 pour conversation naturelle
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new GeminiTimeoutError(
              `Timeout après ${this.config.timeout}ms`
            ));
          }, this.config.timeout);
        });

        const response = await Promise.race([
          responsePromise,
          timeoutPromise
        ]) as GenerateContentResponse;

        if (!response.text) {
          throw new GeminiValidationError('Réponse vide de Gemini');
        }

        const answer = response.text;
        
        // 💬 Sauvegarder réponse dans historique
        addMessageToSession(session.id, 'assistant', answer);

        const duration = Date.now() - startTime;
        logger.info('Gemini assistant success', { 
          durationMs: duration,
          sessionId: session.id,
          userId 
        });

        // Extraire confidence du response
        const confidence = response.candidates?.[0]?.finishReason === 'STOP' ? 0.9 : 0.7;

        return {
          sessionId: session.id,
          answer,
          confidence
        };

      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        logError('Gemini assistant attempt failed', error, {
          attempt,
          durationMs: duration,
          userId,
          errorName: error.name
        });

        // Mêmes règles retry que analyzeTransitInfo
        if (error instanceof GeminiConfigError || 
            error instanceof GeminiValidationError) {
          throw error;
        }

        if (error.status === 429 || error instanceof GeminiTimeoutError) {
          if (attempt < this.config.maxRetries) {
            const delay = this.config.baseDelay * Math.pow(2, attempt - 1);
            await sleep(delay);
            continue;
          }
          throw error;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.baseDelay * Math.pow(2, attempt - 1);
          await sleep(delay);
          continue;
        }

        throw new Error(
          `Assistant échoué après ${this.config.maxRetries} tentatives: ${error.message}`
        );
      }
    }

    throw new Error('Max retries atteint');
  }
}

/**
 * Factory avec instance singleton (thread-safe)
 * Initialisation immédiate au chargement du module
 */
const initializeGeminiService = (): GeminiService => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError('GEMINI_API_KEY manquante dans environnement');
  }

  return new GeminiService(apiKey, {
    maxRetries: 3,
    baseDelay: 1000,
    timeout: 15000, // 15s pour meilleure UX
    model: 'gemini-1.5-flash'
  });
};

// Initialisation immédiate (évite race conditions)
const geminiServiceInstance: GeminiService = initializeGeminiService();

export const getGeminiService = (): GeminiService => {
  return geminiServiceInstance;
};
