/**
 * 🛡️ Schémas de Validation avec Zod
 * 
 * Sécurité :
 * - Validation tailles input (coûts API)
 * - Détection prompt injection
 * - Sanitization basique
 * - Rate limiting par taille
 */

import { z } from 'zod';

// 🚨 Patterns d'injection de prompts communs
const PROMPT_INJECTION_PATTERNS = [
  /IGNORE\s+(PREVIOUS|ALL|ABOVE)\s+INSTRUCTIONS?/i,
  /SYSTEM\s*:\s*YOU\s+ARE/i,
  /FORGET\s+EVERYTHING/i,
  /NEW\s+INSTRUCTIONS?:/i,
  /DISREGARD\s+(PREVIOUS|ALL)/i,
  /OVERRIDE\s+SYSTEM/i,
  /ACT\s+AS\s+(A\s+)?DAN/i, // "Do Anything Now" jailbreak
  /<\|im_start\|>/i, // Injection de tokens spéciaux
  /<\|im_end\|>/i,
  /\[SYSTEM\]/i,
  /\[ASSISTANT\]/i,
  /```system/i
];

/**
 * Détecte les tentatives d'injection de prompt
 */
const detectPromptInjection = (text: string): boolean => {
  return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(text));
};

/**
 * Détecte les caractères suspects (contrôle, unicode invisibles)
 */
const detectSuspiciousCharacters = (text: string): boolean => {
  // Caractères de contrôle (sauf \n, \r, \t)
  const controlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/;
  
  // Zero-width characters (invisibles)
  const zeroWidth = /[\u200B-\u200D\uFEFF]/;
  
  return controlChars.test(text) || zeroWidth.test(text);
};

/**
 * Schéma validation texte d'analyse
 */
export const AnalysisTextInputSchema = z.object({
  text: z.string()
    .min(10, 'Texte trop court (minimum 10 caractères)')
    .max(10000, 'Texte trop long (maximum 10,000 caractères)')
    .refine(
      (text) => !detectPromptInjection(text),
      'Contenu suspect détecté (possible injection de prompt)'
    )
    .refine(
      (text) => !detectSuspiciousCharacters(text),
      'Caractères invalides détectés'
    )
    .transform(text => text.trim())
});

/**
 * Schéma validation image/document base64
 */
export const AnalysisImageInputSchema = z.object({
  data: z.string()
    .startsWith('data:', 'Format base64 invalide')
    .max(
      (parseInt(process.env.MAX_IMAGE_SIZE_MB || '5') * 1024 * 1024),
      `Image trop volumineuse (max ${process.env.MAX_IMAGE_SIZE_MB || '5'}MB)`
    )
    .refine(
      (data) => {
        const mimeMatch = data.match(/^data:([^;]+);base64,/);
        if (!mimeMatch) return false;
        
        const validMimes = [
          'image/jpeg', 'image/jpg', 'image/png', 
          'image/webp', 'image/gif',
          'application/pdf'
        ];
        
        return validMimes.includes(mimeMatch[1]);
      },
      'Type MIME non supporté (JPEG, PNG, WEBP, GIF, PDF uniquement)'
    ),
  mimeType: z.string().optional()
});

/**
 * Schéma validation question assistant
 */
export const AssistantQuestionSchema = z.object({
  question: z.string()
    .min(3, 'Question trop courte (minimum 3 caractères)')
    .max(500, 'Question trop longue (maximum 500 caractères)')
    .refine(
      (text) => !detectPromptInjection(text),
      'Contenu suspect détecté'
    )
    .refine(
      (text) => !detectSuspiciousCharacters(text),
      'Caractères invalides détectés'
    )
    .transform(text => text.trim())
});

/**
 * Types TypeScript générés depuis schémas Zod
 */
export type AnalysisTextInput = z.infer<typeof AnalysisTextInputSchema>;
export type AnalysisImageInput = z.infer<typeof AnalysisImageInputSchema>;
export type AssistantQuestion = z.infer<typeof AssistantQuestionSchema>;

/**
 * Utilitaire validation avec logging
 */
export const validateInput = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): { success: true; data: T } | { success: false; error: string } => {
  try {
    const result = schema.safeParse(data);
    
    if (!result.success) {
      const firstError = result.error.errors[0];
      console.warn(`[Validation Failed] ${context}:`, {
        path: firstError.path.join('.'),
        message: firstError.message
      });
      
      return {
        success: false,
        error: firstError.message
      };
    }
    
    return {
      success: true,
      data: result.data
    };
  } catch (error: any) {
    console.error(`[Validation Error] ${context}:`, error);
    return {
      success: false,
      error: 'Erreur de validation'
    };
  }
};

/**
 * Calcul coût estimé basé sur taille input
 */
export const estimateTokenCost = (text: string): {
  estimatedTokens: number;
  estimatedCostUSD: number;
} => {
  // Approximation : 1 token ≈ 4 caractères
  const estimatedTokens = Math.ceil(text.length / 4);
  
  // gemini-1.5-flash : $0.075 per 1M input tokens
  const estimatedCostUSD = (estimatedTokens / 1_000_000) * 0.075;
  
  return { estimatedTokens, estimatedCostUSD };
};

/**
 * Sanitization basique (optionnel)
 */
export const sanitizeText = (text: string): string => {
  return text
    .trim()
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Supprimer contrôle
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Supprimer zero-width
    .replace(/\s{3,}/g, '  '); // Normaliser espaces multiples
};
