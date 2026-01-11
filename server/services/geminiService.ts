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
        console.log(`[Gemini] Attempt ${attempt}/${this.config.maxRetries}`);

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
          
          console.log(`[Gemini] Input validated: ${input.length} chars, ~${estimatedTokens} tokens, ~$${estimatedCostUSD.toFixed(6)}`);
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
          console.warn('[Gemini] Validation warnings:', validation.errors);
          // Continuer quand même mais logger les warnings
        }

        const duration = Date.now() - startTime;
        console.log(`[Gemini] ✅ Success in ${duration}ms`);

        return parsed;

      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        console.error(`[Gemini] ❌ Attempt ${attempt} failed after ${duration}ms:`, {
          name: error.name,
          message: error.message,
          status: error.status
        });

        // Erreurs de configuration (non retryable)
        if (error instanceof GeminiConfigError) {
          throw error;
        }

        // Erreurs 400/401/403 (non retryable)
        if (error.status === 400 || error.status === 401 || error.status === 403) {
          throw new GeminiConfigError(
            `Erreur configuration API (${error.status}): ${error.message}`
          );
        }

        // Rate limit 429
        if (error.status === 429) {
          if (attempt < this.config.maxRetries) {
            const delay = this.config.baseDelay * Math.pow(2, attempt - 1);
            console.log(`[Gemini] ⏳ Rate limit, retry dans ${delay}ms`);
            await sleep(delay);
            continue;
          }
          throw new GeminiRateLimitError(
            'Limite de requêtes atteinte. Réessayez plus tard.'
          );
        }

        // Timeout
        if (error instanceof GeminiTimeoutError) {
          if (attempt < this.config.maxRetries) {
            const delay = this.config.baseDelay * attempt;
            console.log(`[Gemini] ⏳ Timeout, retry dans ${delay}ms`);
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
          console.log(`[Gemini] ⏳ Erreur temporaire, retry dans ${delay}ms`);
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
        console.log(`[Gemini] Assistant attempt ${attempt}/${this.config.maxRetries}`);

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
        console.log(`[Gemini] Question validated: ${question.length} chars, ~${estimatedTokens} tokens, ~$${estimatedCostUSD.toFixed(6)}`);

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
        
        console.log(`[Gemini] Session ${session.id}: ${session.messages.length} messages`);

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
        console.log(`[Gemini] ✅ Assistant success in ${duration}ms`);

        return {
          sessionId: session.id,
          answer,
          confidence: 0.9 // TODO: Extraire du response si disponible
        };

      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        console.error(`[Gemini] ❌ Assistant attempt ${attempt} failed:`, {
          name: error.name,
          message: error.message,
          duration
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
          const delay = this.config.baseDelay * attempt;
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
 * Factory avec instance singleton
 */
let geminiServiceInstance: GeminiService | null = null;

export const getGeminiService = (): GeminiService => {
  if (!geminiServiceInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new GeminiConfigError('GEMINI_API_KEY manquante dans environnement');
    }

    geminiServiceInstance = new GeminiService(apiKey, {
      maxRetries: 3,
      baseDelay: 1000,
      timeout: 30000,
      model: 'gemini-1.5-flash'
    });
  }

  return geminiServiceInstance;
};
