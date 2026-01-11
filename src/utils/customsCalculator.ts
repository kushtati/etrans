/**
 * CALCULATEUR DOUANIER CONTEXTUALISÉ POUR LA GUINÉE
 * 
 * Basé sur le Code des Douanes de Guinée (version 2023-2024)
 * Sources:
 * - Direction Nationale des Douanes (DND)
 * - Tarif Extérieur Commun CEDEAO (TEC)
 * - Loi de Finances Guinée
 * 
 * TAXES PRINCIPALES:
 * - DD (Droit de Douane): Variable selon SH Code (0%, 5%, 10%, 20%, 35%)
 * - RTL (Redevance Télédiffusion): 2% de la valeur CAF
 * - RDL (Redevance Développement Local): 1.5% de la valeur CAF
 * - TVS (Taxe sur Valeur ajoutée et Services): 18% de la valeur fiscale
 */

// ============================================
// TYPES & INTERFACES
// ============================================

export interface CustomsDutyRates {
  DD: number;   // Droit de Douane (0-35%)
  RTL: number;  // Redevance Télédiffusion (2%)
  RDL: number;  // Redevance Développement Local (1.5%)
  TVS: number;  // TVA Guinée (18%)
}

export interface CustomsCalculationInput {
  valueFOB: number;           // Valeur FOB en GNF
  freight: number;            // Fret en GNF
  insurance: number;          // Assurance en GNF
  hsCode?: string;            // Code SH (Système Harmonisé)
  commodityCategory?: string; // Catégorie marchandise
  regime?: 'IM4' | 'IT' | 'AT' | 'Export'; // Régime douanier
  origin?: string;            // Pays d'origine
  isExempted?: boolean;       // Exonération totale
  exemptionType?: ExemptionType; // Type d'exonération
}

export interface CustomsCalculationResult {
  // Valeurs de base
  valueFOB: number;
  freight: number;
  insurance: number;
  valueCAF: number;           // FOB + Freight + Insurance
  
  // Détail des taxes
  DD: number;                 // Montant Droit Douane
  RTL: number;                // Montant RTL
  RDL: number;                // Montant RDL
  valueFiscale: number;       // Base TVS (CAF + DD + RTL + RDL)
  TVS: number;                // Montant TVS
  
  // Total
  totalDuties: number;        // Total taxes
  totalCost: number;          // CAF + Taxes
  
  // Métadonnées
  rates: CustomsDutyRates;    // Taux appliqués
  hsCode?: string;
  category?: string;
  exemptions: ExemptionInfo[];
  warnings: string[];
}

export type ExemptionType = 
  | 'DIPLOMATIC'              // Corps diplomatique
  | 'HUMANITARIAN'            // Aide humanitaire (ONG, PAM, etc.)
  | 'GOVERNMENT'              // Administration publique
  | 'MINING'                  // Secteur minier (code minier)
  | 'AGRICULTURE'             // Intrants agricoles (semences, engrais)
  | 'HEALTH'                  // Médicaments essentiels
  | 'EDUCATION'               // Matériel éducatif
  | 'CEDEAO'                  // Produits CEDEAO (origine certifiée)
  | 'TEMPORARY'               // Admission temporaire
  | 'TRANSIT';                // Transit international

export interface ExemptionInfo {
  type: ExemptionType;
  description: string;
  taxesExempted: Array<'DD' | 'RTL' | 'RDL' | 'TVS'>;
  requiresDocuments: string[];
}

// ============================================
// BASE DE DONNÉES CODES SH
// ============================================

/**
 * Catégories TEC CEDEAO avec taux DD
 * 
 * CATÉGORIE 0: 0%  - Biens sociaux essentiels
 * CATÉGORIE 1: 5%  - Matières premières, biens d'équipement
 * CATÉGORIE 2: 10% - Biens intermédiaires
 * CATÉGORIE 3: 20% - Biens de consommation finale
 * CATÉGORIE 4: 35% - Biens spécifiques (tabac, alcool, luxe)
 */
export const HS_CODE_DATABASE: Record<string, {
  code: string;
  description: string;
  ddRate: number; // Taux DD en décimal (0.20 = 20%)
  category: 'ESSENTIAL' | 'RAW_MATERIAL' | 'INTERMEDIATE' | 'FINAL_GOODS' | 'SPECIFIC';
  examples: string[];
}> = {
  // CATÉGORIE 0 - Biens Essentiels (0%)
  '3002': {
    code: '3002',
    description: 'Médicaments essentiels (vaccins, sérums)',
    ddRate: 0,
    category: 'ESSENTIAL',
    examples: ['Vaccins COVID', 'Antipaludéens', 'Antibiotiques']
  },
  '1001': {
    code: '1001',
    description: 'Froment (blé) et méteil',
    ddRate: 0,
    category: 'ESSENTIAL',
    examples: ['Blé tendre', 'Blé dur']
  },
  '1006': {
    code: '1006',
    description: 'Riz',
    ddRate: 0,
    category: 'ESSENTIAL',
    examples: ['Riz blanchi', 'Riz brisé', 'Riz paddy']
  },

  // CATÉGORIE 1 - Matières Premières (5%)
  '3920': {
    code: '3920',
    description: 'Plaques et feuilles en matières plastiques',
    ddRate: 0.05,
    category: 'RAW_MATERIAL',
    examples: ['Polyéthylène', 'Polypropylène', 'PVC']
  },
  '7208': {
    code: '7208',
    description: 'Produits laminés plats en fer/acier',
    ddRate: 0.05,
    category: 'RAW_MATERIAL',
    examples: ['Tôles laminées', 'Fer à béton']
  },
  '8471': {
    code: '8471',
    description: 'Machines de traitement de l\'information',
    ddRate: 0.05,
    category: 'RAW_MATERIAL',
    examples: ['Ordinateurs', 'Serveurs', 'Unités de traitement']
  },

  // CATÉGORIE 2 - Biens Intermédiaires (10%)
  '3926': {
    code: '3926',
    description: 'Ouvrages en matières plastiques',
    ddRate: 0.10,
    category: 'INTERMEDIATE',
    examples: ['Articles ménagers plastique', 'Contenants']
  },
  '7326': {
    code: '7326',
    description: 'Ouvrages en fer ou acier',
    ddRate: 0.10,
    category: 'INTERMEDIATE',
    examples: ['Structures métalliques', 'Pièces forgées']
  },
  '8481': {
    code: '8481',
    description: 'Articles de robinetterie',
    ddRate: 0.10,
    category: 'INTERMEDIATE',
    examples: ['Vannes', 'Robinets industriels']
  },

  // CATÉGORIE 3 - Biens de Consommation (20%)
  '8703': {
    code: '8703',
    description: 'Voitures de tourisme',
    ddRate: 0.20,
    category: 'FINAL_GOODS',
    examples: ['Véhicules particuliers', 'SUV', 'Berlines']
  },
  '8528': {
    code: '8528',
    description: 'Appareils récepteurs télévision',
    ddRate: 0.20,
    category: 'FINAL_GOODS',
    examples: ['TV LED', 'TV plasma', 'Moniteurs']
  },
  '6403': {
    code: '6403',
    description: 'Chaussures à dessus en cuir',
    ddRate: 0.20,
    category: 'FINAL_GOODS',
    examples: ['Chaussures de ville', 'Bottes']
  },

  // CATÉGORIE 4 - Produits Spécifiques (35%)
  '2402': {
    code: '2402',
    description: 'Cigares et cigarettes',
    ddRate: 0.35,
    category: 'SPECIFIC',
    examples: ['Cigarettes', 'Cigares', 'Tabac à rouler']
  },
  '2208': {
    code: '2208',
    description: 'Alcool éthylique non dénaturé',
    ddRate: 0.35,
    category: 'SPECIFIC',
    examples: ['Whisky', 'Vodka', 'Rhum', 'Cognac']
  },
  '7113': {
    code: '7113',
    description: 'Articles de bijouterie',
    ddRate: 0.35,
    category: 'SPECIFIC',
    examples: ['Bijoux or', 'Bijoux argent', 'Articles précieux']
  },

  // Véhicules utilitaires (cas spécial)
  '8704': {
    code: '8704',
    description: 'Véhicules automobiles pour transport marchandises',
    ddRate: 0.10,
    category: 'INTERMEDIATE',
    examples: ['Camions', 'Pick-up', 'Fourgons']
  },

  // Engins de chantier
  '8429': {
    code: '8429',
    description: 'Bulldozers, niveleuses, pelles',
    ddRate: 0.05,
    category: 'RAW_MATERIAL',
    examples: ['Pelle hydraulique', 'Bulldozer', 'Chargeuse']
  },

  // Générateurs
  '8502': {
    code: '8502',
    description: 'Groupes électrogènes',
    ddRate: 0.10,
    category: 'INTERMEDIATE',
    examples: ['Générateurs diesel', 'Alternateurs']
  }
};

/**
 * Base de données des exonérations selon type
 */
export const EXEMPTIONS_DATABASE: Record<ExemptionType, ExemptionInfo> = {
  DIPLOMATIC: {
    type: 'DIPLOMATIC',
    description: 'Corps diplomatique et consulaire (Convention de Vienne)',
    taxesExempted: ['DD', 'RTL', 'RDL', 'TVS'],
    requiresDocuments: [
      'Carte diplomatique',
      'Attestation Ministère Affaires Étrangères',
      'Liste marchandises validée'
    ]
  },
  HUMANITARIAN: {
    type: 'HUMANITARIAN',
    description: 'Aide humanitaire (PAM, UNHCR, ONG agréées)',
    taxesExempted: ['DD', 'RTL', 'RDL', 'TVS'],
    requiresDocuments: [
      'Certificat d\'exonération DND',
      'Convention avec État Guinéen',
      'Attestation Ministère Plan'
    ]
  },
  GOVERNMENT: {
    type: 'GOVERNMENT',
    description: 'Administration publique guinéenne',
    taxesExempted: ['DD', 'RTL', 'RDL', 'TVS'],
    requiresDocuments: [
      'Décision d\'exonération',
      'Bon de commande administration',
      'Validation Budget'
    ]
  },
  MINING: {
    type: 'MINING',
    description: 'Équipements miniers (Code Minier 2011)',
    taxesExempted: ['DD'],
    requiresDocuments: [
      'Convention minière',
      'Attestation Ministère Mines',
      'Programme d\'investissement validé'
    ]
  },
  AGRICULTURE: {
    type: 'AGRICULTURE',
    description: 'Intrants agricoles (semences, engrais, tracteurs)',
    taxesExempted: ['DD', 'TVS'],
    requiresDocuments: [
      'Autorisation Ministère Agriculture',
      'Certificat phytosanitaire',
      'Facture pro forma'
    ]
  },
  HEALTH: {
    type: 'HEALTH',
    description: 'Médicaments liste OMS essentiels',
    taxesExempted: ['DD', 'TVS'],
    requiresDocuments: [
      'Autorisation Pharmacie Nationale',
      'Certificat conformité OMS',
      'Visa Ministère Santé'
    ]
  },
  EDUCATION: {
    type: 'EDUCATION',
    description: 'Matériel éducatif (livres, équipements scolaires)',
    taxesExempted: ['DD', 'TVS'],
    requiresDocuments: [
      'Attestation Ministère Éducation',
      'Liste matériels détaillée'
    ]
  },
  CEDEAO: {
    type: 'CEDEAO',
    description: 'Produits originaires CEDEAO (Certificat origine)',
    taxesExempted: ['DD'],
    requiresDocuments: [
      'Certificat d\'origine CEDEAO (forme C)',
      'Facture commerciale',
      'Attestation chambre commerce origine'
    ]
  },
  TEMPORARY: {
    type: 'TEMPORARY',
    description: 'Admission temporaire (matériel chantier, foires)',
    taxesExempted: ['DD', 'TVS'],
    requiresDocuments: [
      'Engagement réexport',
      'Caution bancaire',
      'Durée séjour justifiée'
    ]
  },
  TRANSIT: {
    type: 'TRANSIT',
    description: 'Transit international (Mali, Burkina, etc.)',
    taxesExempted: ['DD', 'RTL', 'RDL', 'TVS'],
    requiresDocuments: [
      'Déclaration Transit',
      'Caution transit',
      'Itinéraire défini'
    ]
  }
};

// ============================================
// TAUX STANDARDS GUINÉE
// ============================================

const STANDARD_RATES = {
  RTL: 0.02,   // 2% de la valeur CAF
  RDL: 0.015,  // 1.5% de la valeur CAF
  TVS: 0.18    // 18% de la valeur fiscale
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Trouve le taux DD selon code SH
 */
export const getDDRateByHSCode = (hsCode: string): number => {
  // Recherche exacte
  if (HS_CODE_DATABASE[hsCode]) {
    return HS_CODE_DATABASE[hsCode].ddRate;
  }

  // Recherche par préfixe (4 premiers chiffres)
  const prefix = hsCode.substring(0, 4);
  const match = HS_CODE_DATABASE[prefix];
  
  if (match) {
    return match.ddRate;
  }

  // Défaut : 20% (catégorie 3)
  console.warn(`Code SH ${hsCode} non trouvé. Taux par défaut 20% appliqué.`);
  return 0.20;
};

/**
 * Recherche codes SH par mot-clé
 */
type SearchResult = {
  code: string;
  description: string;
  ddRate: number;
};

export const searchHSCode = (keyword: string): SearchResult[] => {
  const lowerKeyword = keyword.toLowerCase();
  
  return Object.values(HS_CODE_DATABASE)
    .filter(item => 
      item.description.toLowerCase().includes(lowerKeyword) ||
      item.examples.some(ex => ex.toLowerCase().includes(lowerKeyword))
    )
    .map(item => ({
      code: item.code,
      description: item.description,
      ddRate: item.ddRate
    }));
};

/**
 * Suggère code SH depuis description marchandise
 */
export const suggestHSCode = (description: string): string | null => {
  const results = searchHSCode(description);
  return results.length > 0 ? results[0].code : null;
};

// ============================================
// CALCULATEUR PRINCIPAL
// ============================================

/**
 * Calcule les taxes douanières pour la Guinée
 * 
 * @param input - Paramètres de calcul
 * @returns Résultat détaillé avec toutes les taxes
 * 
 * @example
 * const result = calculateCustomsDuties({
 *   valueFOB: 10000000,
 *   freight: 500000,
 *   insurance: 100000,
 *   hsCode: '3920',
 *   regime: 'IM4'
 * });
 * console.log(result.totalDuties); // Total taxes
 */
export const calculateCustomsDuties = (
  input: CustomsCalculationInput
): CustomsCalculationResult => {
  
  const warnings: string[] = [];
  const exemptions: ExemptionInfo[] = [];

  // 1. Valeur CAF (FOB + Fret + Assurance)
  const valueCAF = input.valueFOB + input.freight + input.insurance;

  if (valueCAF <= 0) {
    throw new Error('Valeur CAF doit être positive');
  }

  // 2. Déterminer taux DD
  let ddRate = 0.20; // Défaut 20%

  if (input.hsCode) {
    ddRate = getDDRateByHSCode(input.hsCode);
  } else if (input.commodityCategory) {
    // Fallback sur catégorie textuelle
    const suggested = suggestHSCode(input.commodityCategory);
    if (suggested) {
      ddRate = getDDRateByHSCode(suggested);
      warnings.push(`Code SH suggéré : ${suggested} (vérifier exactitude)`);
    }
  }

  // 3. Gérer exonérations
  let appliedRates = { ...STANDARD_RATES, DD: ddRate };

  if (input.regime === 'IT' || input.regime === 'AT') {
    // Transit et Admission Temporaire : Suspension totale
    exemptions.push(EXEMPTIONS_DATABASE.TRANSIT);
    appliedRates = { DD: 0, RTL: 0, RDL: 0, TVS: 0 };
    warnings.push(`Régime ${input.regime} : Suspension totale (caution requise)`);
  } else if (input.regime === 'Export') {
    // Export : Pas de taxes import
    appliedRates = { DD: 0, RTL: 0, RDL: 0, TVS: 0 };
    warnings.push('Export : Aucune taxe d\'importation');
  } else if (input.isExempted && input.exemptionType) {
    // Exonération spécifique
    const exemptionInfo = EXEMPTIONS_DATABASE[input.exemptionType];
    exemptions.push(exemptionInfo);

    exemptionInfo.taxesExempted.forEach(tax => {
      switch (tax) {
        case 'DD':
          appliedRates.DD = 0;
          break;
        case 'RTL':
          appliedRates.RTL = 0;
          break;
        case 'RDL':
          appliedRates.RDL = 0;
          break;
        case 'TVS':
          appliedRates.TVS = 0;
          break;
      }
    });

    warnings.push(`Exonération ${exemptionInfo.type} appliquée`);
  }

  // 4. Calculs taxes
  const DD = valueCAF * appliedRates.DD;
  const RTL = valueCAF * appliedRates.RTL;
  const RDL = valueCAF * appliedRates.RDL;

  // Valeur fiscale = CAF + DD + RTL + RDL
  const valueFiscale = valueCAF + DD + RTL + RDL;

  // TVS sur valeur fiscale
  const TVS = valueFiscale * appliedRates.TVS;

  // Total
  const totalDuties = DD + RTL + RDL + TVS;
  const totalCost = valueCAF + totalDuties;

  // 5. Warnings additionnels
  if (input.origin && input.origin.includes('CEDEAO')) {
    warnings.push('Origine CEDEAO : Vérifier certificat origine pour exonération DD');
  }

  if (valueCAF > 100000000) { // 100M GNF
    warnings.push('Valeur élevée : Vérification valeur par Inspecteur Douanes probable');
  }

  return {
    valueFOB: input.valueFOB,
    freight: input.freight,
    insurance: input.insurance,
    valueCAF,
    DD,
    RTL,
    RDL,
    valueFiscale,
    TVS,
    totalDuties,
    totalCost,
    rates: appliedRates,
    hsCode: input.hsCode,
    category: input.commodityCategory,
    exemptions,
    warnings
  };
};

/**
 * Calcul rapide avec détection automatique
 */
export const quickCalculate = (
  valueFOB: number,
  freight: number,
  insurance: number,
  description?: string
): CustomsCalculationResult => {
  
  let hsCode: string | undefined;
  
  if (description) {
    hsCode = suggestHSCode(description) || undefined;
  }

  return calculateCustomsDuties({
    valueFOB,
    freight,
    insurance,
    hsCode,
    commodityCategory: description,
    regime: 'IM4'
  });
};

/**
 * Formater montant en GNF
 */
export const formatGNF = (amount: number): string => {
  return new Intl.NumberFormat('fr-GN', { 
    style: 'currency', 
    currency: 'GNF', 
    maximumFractionDigits: 0 
  }).format(amount);
};

/**
 * Comparer plusieurs scénarios
 */
export const compareScenarios = (scenarios: Array<{
  name: string;
  input: CustomsCalculationInput;
}>): Array<CustomsCalculationResult & { scenarioName: string }> => {
  
  return scenarios.map(scenario => ({
    scenarioName: scenario.name,
    ...calculateCustomsDuties(scenario.input)
  }));
};