/**
 * 🧪 Tests Prompts Gemini
 * 
 * Vérifie :
 * - Construction prompts corrects
 * - Contexte Guinée présent
 * - Validation réponses
 * - Calcul droits de douane
 */

import { describe, it, expect } from 'vitest';
import {
  buildAnalysisPrompt,
  buildAssistantPrompt,
  IMAGE_ANALYSIS_PROMPT,
  GUINEA_CONTEXT,
  FEW_SHOT_EXAMPLES,
  validateAnalysisResponse,
  calculateEstimatedDuties
} from '../server/prompts/gemini';

describe('buildAnalysisPrompt', () => {
  it('inclut contexte Guinée', () => {
    const prompt = buildAnalysisPrompt('Facture test');
    
    expect(prompt).toContain('CONTEXTE GUINÉE');
    expect(prompt).toContain('Port de Conakry');
    expect(prompt).toContain('DD (Droit de Douane) : 20%');
  });

  it('inclut exemples few-shot', () => {
    const prompt = buildAnalysisPrompt('Facture test');
    
    expect(prompt).toContain('EXEMPLES D\'ANALYSE');
    expect(prompt).toContain('Exemple 1');
    expect(prompt).toContain('MSKU8765432');
  });

  it('inclut le document à analyser', () => {
    const docText = 'BL MAEU1234567 pour conteneur de riz';
    const prompt = buildAnalysisPrompt(docText);
    
    expect(prompt).toContain(docText);
    expect(prompt).toContain('DOCUMENT À ANALYSER');
  });

  it('inclut règles strictes', () => {
    const prompt = buildAnalysisPrompt('Test');
    
    expect(prompt).toContain('RÈGLES STRICTES');
    expect(prompt).toContain('NE PAS inventer');
    expect(prompt).toContain('null pour champs manquants');
  });

  it('demande réponse JSON uniquement', () => {
    const prompt = buildAnalysisPrompt('Test');
    
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('schéma fourni');
  });
});

describe('buildAssistantPrompt', () => {
  it('inclut contexte Guinée', () => {
    const prompt = buildAssistantPrompt('Question test');
    
    expect(prompt).toContain('CONTEXTE GUINÉE');
    expect(prompt).toContain('SYDONIA++');
  });

  it('définit expertise', () => {
    const prompt = buildAssistantPrompt('Test');
    
    expect(prompt).toContain('EXPERTISE');
    expect(prompt).toContain('Procédures de dédouanement');
    expect(prompt).toContain('Classification tarifaire');
  });

  it('inclut la question utilisateur', () => {
    const question = 'Quels documents pour importer du riz?';
    const prompt = buildAssistantPrompt(question);
    
    expect(prompt).toContain(question);
    expect(prompt).toContain('QUESTION DE L\'UTILISATEUR');
  });

  it('définit règles de réponse', () => {
    const prompt = buildAssistantPrompt('Test');
    
    expect(prompt).toContain('RÈGLES DE RÉPONSE');
    expect(prompt).toContain('EN FRANÇAIS');
    expect(prompt).toContain('PRÉCIS et CONCRET');
    expect(prompt).toContain('ne pas inventer');
  });
});

describe('IMAGE_ANALYSIS_PROMPT', () => {
  it('contient instructions OCR', () => {
    expect(IMAGE_ANALYSIS_PROMPT).toContain('OCR');
    expect(IMAGE_ANALYSIS_PROMPT).toContain('Extrait TOUTES les informations');
  });

  it('contient contexte Guinée', () => {
    expect(IMAGE_ANALYSIS_PROMPT).toContain('CONTEXTE GUINÉE');
  });

  it('demande transcription exacte', () => {
    expect(IMAGE_ANALYSIS_PROMPT).toContain('EXACTEMENT ce que tu vois');
    expect(IMAGE_ANALYSIS_PROMPT).toContain('[ILLISIBLE]');
  });
});

describe('validateAnalysisResponse', () => {
  it('accepte réponse valide complète', () => {
    const response = {
      detectedType: 'Facture',
      summary: 'Facture commerciale pour marchandises',
      confidence: 0.85,
      potentialHsCodes: [
        { code: '8703.23.90', description: 'Véhicules', confidence: 0.9 }
      ],
      blNumber: 'MSKU12345678',
      containerNumber: 'MSCU9876543',
      extractedFields: {},
      estimatedDuties: 1500000,
      riskFlags: []
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejette detectedType manquant', () => {
    const response = {
      summary: 'Test',
      confidence: 0.8,
      potentialHsCodes: [],
      extractedFields: {},
      riskFlags: []
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('detectedType manquant');
  });

  it('rejette summary trop court', () => {
    const response = {
      detectedType: 'BL',
      summary: 'Court',
      confidence: 0.8,
      potentialHsCodes: [],
      extractedFields: {},
      riskFlags: []
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('summary'))).toBe(true);
  });

  it('rejette confidence invalide', () => {
    const response = {
      detectedType: 'Facture',
      summary: 'Facture commerciale test',
      confidence: 1.5, // > 1
      potentialHsCodes: [],
      extractedFields: {},
      riskFlags: []
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
  });

  it('valide format code HS correct', () => {
    const response = {
      detectedType: 'Facture',
      summary: 'Facture test valide',
      confidence: 0.8,
      potentialHsCodes: [
        { code: '8703.23.90', description: 'Test', confidence: 0.9 },
        { code: '3920.10', description: 'Test2', confidence: 0.85 }
      ],
      extractedFields: {},
      riskFlags: [],
      blNumber: null,
      containerNumber: null,
      estimatedDuties: null
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(true);
  });

  it('rejette format code HS invalide', () => {
    const response = {
      detectedType: 'Facture',
      summary: 'Facture test invalide',
      confidence: 0.8,
      potentialHsCodes: [
        { code: 'ABC123', description: 'Test', confidence: 0.9 } // Format invalide
      ],
      extractedFields: {},
      riskFlags: []
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Code HS'))).toBe(true);
  });

  it('valide format BL correct', () => {
    const response = {
      detectedType: 'BL',
      summary: 'Connaissement maritime',
      confidence: 0.9,
      blNumber: 'MSKU12345678', // BL valide 8 chiffres
      potentialHsCodes: [],
      extractedFields: {},
      riskFlags: [],
      containerNumber: null,
      estimatedDuties: null
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(true);
  });

  it('rejette format BL invalide', () => {
    const response = {
      detectedType: 'BL',
      summary: 'Connaissement maritime',
      confidence: 0.9,
      blNumber: '123ABC', // Format invalide
      potentialHsCodes: [],
      extractedFields: {},
      riskFlags: []
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('BL invalide'))).toBe(true);
  });

  it('valide format conteneur correct', () => {
    const response = {
      detectedType: 'BL',
      summary: 'Document avec conteneur',
      confidence: 0.9,
      containerNumber: 'MSCU1234567', // Format ISO standard 7 chiffres
      potentialHsCodes: [],
      extractedFields: {},
      riskFlags: [],
      blNumber: null,
      estimatedDuties: null
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(true);
  });

  it('rejette format conteneur invalide', () => {
    const response = {
      detectedType: 'BL',
      summary: 'Document avec conteneur',
      confidence: 0.9,
      containerNumber: 'ABC123', // Format invalide
      potentialHsCodes: [],
      extractedFields: {},
      riskFlags: []
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('conteneur invalide'))).toBe(true);
  });

  it('accepte null pour champs optionnels', () => {
    const response = {
      detectedType: 'Facture',
      summary: 'Facture sans BL ni conteneur',
      confidence: 0.8,
      blNumber: null,
      containerNumber: null,
      estimatedDuties: null,
      potentialHsCodes: [],
      extractedFields: {},
      riskFlags: []
    };
    
    const result = validateAnalysisResponse(response);
    
    expect(result.valid).toBe(true);
  });
});

describe('calculateEstimatedDuties', () => {
  it('calcule droits pour 10,000 USD', () => {
    const valueCIF = 10000; // USD
    const duties = calculateEstimatedDuties(valueCIF);
    
    // Approximation : DD 20% + RTL 2% + RDL 1.5% + TVS 18% (sur valeur+DD) + CEDEAO 0.5%
    // = 2000 + 200 + 150 + (10000*1.2)*0.18 + 50 = 2000 + 200 + 150 + 2160 + 50 = 4560
    expect(duties).toBeGreaterThan(4000);
    expect(duties).toBeLessThan(5000);
  });

  it('calcule droits pour 50,000 USD', () => {
    const valueCIF = 50000;
    const duties = calculateEstimatedDuties(valueCIF);
    
    expect(duties).toBeGreaterThan(20000);
    expect(duties).toBeLessThan(25000);
  });

  it('retourne 0 pour valeur 0', () => {
    const duties = calculateEstimatedDuties(0);
    expect(duties).toBe(0);
  });

  it('arrondit résultat', () => {
    const duties = calculateEstimatedDuties(1234.56);
    expect(Number.isInteger(duties)).toBe(true);
  });

  it('formule cohérente avec taux Guinée', () => {
    const valueCIF = 10000;
    const duties = calculateEstimatedDuties(valueCIF);
    
    // Taux total ≈ 43.6% (selon doc GUINEA_CONTEXT)
    const expectedApprox = valueCIF * 0.436;
    
    // Tolérance ±5% car formule exacte inclut TVS sur (valeur+DD)
    expect(duties).toBeGreaterThan(expectedApprox * 0.95);
    expect(duties).toBeLessThan(expectedApprox * 1.05);
  });
});

describe('GUINEA_CONTEXT', () => {
  it('contient régimes douaniers', () => {
    expect(GUINEA_CONTEXT).toContain('IM4');
    expect(GUINEA_CONTEXT).toContain('IT');
    expect(GUINEA_CONTEXT).toContain('AT');
  });

  it('contient taux de taxes', () => {
    expect(GUINEA_CONTEXT).toContain('DD');
    expect(GUINEA_CONTEXT).toContain('20%');
    expect(GUINEA_CONTEXT).toContain('TVS');
    expect(GUINEA_CONTEXT).toContain('18%');
  });

  it('contient compagnies maritimes', () => {
    expect(GUINEA_CONTEXT).toContain('Maersk');
    expect(GUINEA_CONTEXT).toContain('CMA CGM');
    expect(GUINEA_CONTEXT).toContain('MSC');
  });

  it('contient code port Conakry', () => {
    expect(GUINEA_CONTEXT).toContain('GNCKY');
  });

  it('contient formats standards', () => {
    expect(GUINEA_CONTEXT).toContain('MSKU1234567');
    expect(GUINEA_CONTEXT).toContain('MSCU1234567');
  });
});

describe('FEW_SHOT_EXAMPLES', () => {
  it('contient au moins 3 exemples', () => {
    const exampleCount = (FEW_SHOT_EXAMPLES.match(/Exemple \d+/g) || []).length;
    expect(exampleCount).toBeGreaterThanOrEqual(3);
  });

  it('exemples ont structure JSON', () => {
    expect(FEW_SHOT_EXAMPLES).toContain('"detectedType"');
    expect(FEW_SHOT_EXAMPLES).toContain('"summary"');
    expect(FEW_SHOT_EXAMPLES).toContain('"confidence"');
  });

  it('exemples montrent différents types documents', () => {
    expect(FEW_SHOT_EXAMPLES).toContain('Facture');
    expect(FEW_SHOT_EXAMPLES).toContain('BL');
  });

  it('exemples incluent cas incomplet', () => {
    expect(FEW_SHOT_EXAMPLES).toContain('incomplet');
    expect(FEW_SHOT_EXAMPLES).toContain('riskFlags');
  });
});
