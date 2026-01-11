/**
 * 🤖 Prompts Gemini Optimisés pour Transit Guinée
 * 
 * Optimisations :
 * - Contexte spécifique Guinée (régimes, taxes, ports)
 * - Few-shot learning (exemples)
 * - Contraintes strictes (pas d'hallucination)
 * - Schémas de réponse enrichis
 */

import { Type } from '@google/genai';

// ========================================
// CONTEXTE GUINÉE CONAKRY
// ========================================

export const GUINEA_CONTEXT = `
CONTEXTE GUINÉE CONAKRY (2026) :

📋 RÉGIMES DOUANIERS :
- IM4 : Import pour consommation (régime définitif)
- IT : Transit international
- AT : Admission temporaire
- EX1 : Exportation définitive
- RE : Réexportation

💰 TAXES DOUANIÈRES :
- DD (Droit de Douane) : 20% (tarif standard)
- RTL (Redevance Transit-Logistique) : 2%
- RDL (Redevance Dédouanement-Logistique) : 1.5%
- TVS (Taxe sur la Valeur ajoutée) : 18%
- Prélèvement Communautaire CEDEAO : 0.5%

🚢 COMPAGNIES MARITIMES PRINCIPALES :
- Maersk Line (MSKU, MAEU)
- CMA CGM (CMAU, CGMU)
- MSC (MSCU, MEDU)
- Hapag-Lloyd (HLCU)
- Evergreen (EISU)

🏢 PORT PRINCIPAL :
- Port de Conakry (Code UN/LOCODE : GNCKY)
- Port de Kamsar (GNKMR)

📦 FORMATS STANDARDS :
- BL (Bill of Lading) : [CARRIER][7-9 chiffres] Ex: MSKU1234567
- Conteneur ISO : [4 lettres][7 chiffres] Ex: MSCU1234567
- Codes HS (Harmonized System) : 6-10 chiffres Ex: 8703.23.90

📄 DOCUMENTS REQUIS :
- Facture commerciale
- Connaissement maritime (BL)
- Liste de colisage
- Certificat d'origine
- BSC (Bordereau de Suivi des Cargaisons) - obligatoire
- Certificat phytosanitaire (produits agricoles)
`;

// ========================================
// EXEMPLES FEW-SHOT
// ========================================

export const FEW_SHOT_EXAMPLES = `
EXEMPLES D'ANALYSE :

Exemple 1 - Facture :
Document : "INVOICE #2024-0156 | Shipper: ACME Corp China | 500 cartons plastic plates | HS: 3924.10.00 | Value: $12,450 USD"
Résultat :
{
  "detectedType": "Facture",
  "summary": "Facture commerciale pour 500 cartons d'assiettes en plastique",
  "potentialHsCodes": [
    { "code": "3924.10.00", "description": "Vaisselle en plastique", "confidence": 0.95 }
  ],
  "extractedFields": {
    "shipmentDescription": "500 cartons plastic plates",
    "origin": "China"
  },
  "blNumber": null,
  "containerNumber": null,
  "estimatedDuties": 15600000,
  "riskFlags": [],
  "confidence": 0.92
}

Exemple 2 - BL :
Document : "B/L MSKU8765432 | 1x40HC MSCU9876543 | Port: Shanghai → Conakry | Goods: Electronics | Weight: 18,500 kg"
Résultat :
{
  "detectedType": "BL",
  "summary": "Connaissement maritime pour conteneur 40HC d'électroniques",
  "potentialHsCodes": [
    { "code": "8517.00", "description": "Appareils électriques de télécommunication", "confidence": 0.75 }
  ],
  "extractedFields": {
    "shipmentDescription": "Electronics",
    "origin": "Shanghai",
    "weight": "18,500 kg",
    "containerInfo": "1x40HC MSCU9876543"
  },
  "blNumber": "MSKU8765432",
  "containerNumber": "MSCU9876543",
  "estimatedDuties": null,
  "riskFlags": ["valeur_non_specifiee"],
  "confidence": 0.88
}

Exemple 3 - Document incomplet :
Document : "Liste: 200 boxes"
Résultat :
{
  "detectedType": "Autre",
  "summary": "Document incomplet mentionnant 200 boîtes sans détails",
  "potentialHsCodes": [],
  "extractedFields": {
    "shipmentDescription": "200 boxes"
  },
  "blNumber": null,
  "containerNumber": null,
  "estimatedDuties": null,
  "riskFlags": ["doc_incomplet", "description_vague", "valeur_manquante"],
  "confidence": 0.35
}
`;

// ========================================
// PROMPT ANALYSE DOCUMENTS
// ========================================

export const buildAnalysisPrompt = (documentText: string): string => {
  return `Tu es un expert en transit international et douanes guinéennes avec 20 ans d'expérience à Conakry.

${GUINEA_CONTEXT}

${FEW_SHOT_EXAMPLES}

RÈGLES STRICTES :
1. NE PAS inventer d'informations manquantes
2. Utiliser "Non spécifié" ou null pour champs manquants
3. Indiquer flags de risque si données suspectes/incomplètes
4. Calculer estimatedDuties UNIQUEMENT si valeur disponible (formule : valeur × 0.436)
5. Confidence < 0.5 si document très incomplet

TÂCHE :
Analyse ce document de transit et extrais toutes les informations structurées.

DOCUMENT À ANALYSER :
"""
${documentText}
"""

Réponds UNIQUEMENT en JSON selon le schéma fourni. Sois précis et factuel.`;
};

/**
 * Schéma de réponse enrichi pour analyse documents
 */
export const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detectedType: {
      type: Type.STRING,
      enum: ['BL', 'Facture', 'DDI', 'BSC', 'Certificat', 'Liste_Colisage', 'Autre'],
      description: "Type exact de document détecté"
    },
    summary: {
      type: Type.STRING,
      description: "Résumé concis du document (2-3 phrases max)"
    },
    blNumber: {
      type: Type.STRING,
      nullable: true,
      description: "Numéro de connaissement maritime si trouvé (format: [CARRIER][CHIFFRES])"
    },
    containerNumber: {
      type: Type.STRING,
      nullable: true,
      description: "Numéro de conteneur ISO si trouvé (format: [4 lettres][7 chiffres])"
    },
    potentialHsCodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING, description: "Code HS 6-10 chiffres" },
          description: { type: Type.STRING, description: "Description marchandise" },
          confidence: { type: Type.NUMBER, description: "Confiance 0-1" }
        }
      },
      description: "Codes HS suggérés avec niveau de confiance"
    },
    extractedFields: {
      type: Type.OBJECT,
      properties: {
        shipmentDescription: { type: Type.STRING, nullable: true },
        origin: { type: Type.STRING, nullable: true },
        destination: { type: Type.STRING, nullable: true },
        weight: { type: Type.STRING, nullable: true },
        value: { type: Type.STRING, nullable: true },
        currency: { type: Type.STRING, nullable: true },
        containerInfo: { type: Type.STRING, nullable: true },
        estimatedArrival: { type: Type.STRING, nullable: true },
        shipper: { type: Type.STRING, nullable: true },
        consignee: { type: Type.STRING, nullable: true }
      },
      description: "Champs extraits du document"
    },
    estimatedDuties: {
      type: Type.NUMBER,
      nullable: true,
      description: "Estimation taxes totales en GNF (si valeur disponible : valeur × 0.436)"
    },
    riskFlags: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        enum: [
          'doc_incomplet',
          'valeur_non_specifiee',
          'valeur_suspecte',
          'description_vague',
          'origine_manquante',
          'poids_manquant',
          'conteneur_invalide',
          'bl_invalide',
          'taxe_hors_norme'
        ]
      },
      description: "Alertes et risques identifiés"
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confiance globale de l'analyse (0-1). <0.5 = données insuffisantes"
    }
  },
  required: ['detectedType', 'summary', 'potentialHsCodes', 'extractedFields', 'riskFlags', 'confidence']
};

// ========================================
// PROMPT ASSISTANT DOUANES
// ========================================

export const buildAssistantPrompt = (question: string): string => {
  return `Tu es un expert certifié en réglementation douanière de Guinée Conakry avec 20 ans d'expérience.

${GUINEA_CONTEXT}

EXPERTISE :
- Procédures de dédouanement (SYDONIA++)
- Calcul des taxes et droits
- Classification tarifaire (codes HS)
- Régimes douaniers (IM4, IT, AT, etc.)
- Documents requis par marchandise
- Interdictions et restrictions
- Procédures BSC (Bordereau de Suivi Cargaison)

RÈGLES DE RÉPONSE :
1. Réponds EN FRANÇAIS uniquement
2. Sois PRÉCIS et CONCRET (pas de généralités)
3. Cite les TEXTES DE LOI si applicable (ex: "Selon le Code Douanier art. 123...")
4. Donne des EXEMPLES CHIFFRÉS quand pertinent
5. Si tu ne sais pas, DIS-LE clairement (ne pas inventer)
6. Reste dans ton domaine (douanes/transit Guinée)

QUESTION DE L'UTILISATEUR :
${question}

Réponds de manière professionnelle et actionnable.`;
};

/**
 * Configuration température par type de tâche
 */
export const GEMINI_CONFIGS = {
  analysis: {
    temperature: 0.1, // Très déterministe pour extraction données
    maxOutputTokens: 1500,
    topP: 0.9,
    topK: 40
  },
  assistant: {
    temperature: 0.7, // Plus créatif pour conversation
    maxOutputTokens: 800,
    topP: 0.95,
    topK: 40
  }
};

// ========================================
// PROMPT IMAGE/PDF ANALYSIS
// ========================================

export const IMAGE_ANALYSIS_PROMPT = `Tu es un expert OCR spécialisé en documents de transit guinéens.

${GUINEA_CONTEXT}

TÂCHE :
Analyse cette image/PDF de document de transit. Extrait TOUTES les informations visibles :
- Numéros (BL, conteneur, facture)
- Textes (descriptions marchandises, noms sociétés)
- Tableaux (quantités, poids, valeurs)
- Dates et lieux
- Codes (HS, régimes douaniers)

IMPORTANT :
- Transcris EXACTEMENT ce que tu vois (pas d'invention)
- Conserve la mise en forme des tableaux
- Signale les parties illisibles avec [ILLISIBLE]
- Identifie le type de document

Réponds selon le schéma JSON fourni.`;

// ========================================
// VALIDATION RÉPONSES
// ========================================

/**
 * Valide la cohérence d'une réponse Gemini
 */
export const validateAnalysisResponse = (response: any): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  // Vérification champs obligatoires
  if (!response.detectedType) {
    errors.push('detectedType manquant');
  }

  if (!response.summary || response.summary.length < 10) {
    errors.push('summary trop court ou manquant');
  }

  if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) {
    errors.push('confidence invalide (doit être 0-1)');
  }

  // Validation codes HS
  if (Array.isArray(response.potentialHsCodes)) {
    response.potentialHsCodes.forEach((hs: any, idx: number) => {
      if (!hs.code || !/^\d{4,10}(\.\d{2}(\.\d{2})?)?$/.test(hs.code)) {
        errors.push(`Code HS ${idx + 1} invalide: ${hs.code}`);
      }
      if (hs.confidence !== undefined && (typeof hs.confidence !== 'number' || hs.confidence < 0 || hs.confidence > 1)) {
        errors.push(`Confidence HS ${idx + 1} invalide`);
      }
    });
  }

  // Validation BL
  if (response.blNumber && !/^[A-Z]{4}\d{7,9}$/.test(response.blNumber)) {
    errors.push(`Format BL invalide: ${response.blNumber} (attendu: [CARRIER][7-9 chiffres])`);
  }

  // Validation conteneur
  if (response.containerNumber && !/^[A-Z]{4}\d{6,7}$/.test(response.containerNumber)) {
    errors.push(`Format conteneur invalide: ${response.containerNumber} (attendu: [4 lettres][6-7 chiffres])`);
  }

  // Validation estimatedDuties
  if (response.estimatedDuties !== null && (typeof response.estimatedDuties !== 'number' || response.estimatedDuties < 0)) {
    errors.push('estimatedDuties doit être un nombre positif ou null');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// ========================================
// UTILITAIRES (EXEMPLES)
// ========================================

/**
 * 💡 EXEMPLE : Calcul estimation droits de douane Guinée
 * 
 * Formule complète : Valeur CIF × (DD 20% + RTL 2% + RDL 1.5% + TVS 18% + CEDEAO 0.5%)
 * TVS s'applique sur (Valeur + DD), donc formule ajustée ci-dessous.
 * 
 * ⚠️ NOTE : Cette fonction n'est pas utilisée actuellement.
 * Le calcul est délégué à Gemini dans le prompt (ligne 151 : "valeur × 0.436")
 * Conservée ici comme référence pour implémentation future côté backend.
 * 
 * @example
 * calculateEstimatedDuties(10000000) // → 4360000 GNF
 */
export const calculateEstimatedDuties = (valueCIF: number): number => {
  const DD = 0.20;   // Droit de Douane
  const RTL = 0.02;  // Redevance Transit-Logistique
  const RDL = 0.015; // Redevance Dédouanement-Logistique
  const TVS = 0.18;  // TVA Guinée
  const CEDEAO = 0.005; // Prélèvement CEDEAO

  const totalRate = DD + RTL + RDL + TVS + CEDEAO; // 0.42
  
  // TVS s'applique sur (Valeur + DD), donc formule ajustée
  const duties = valueCIF * (DD + RTL + RDL + CEDEAO) + (valueCIF * (1 + DD)) * TVS;
  
  return Math.round(duties);
};
