/**
 * Validation des numéros de Bill of Lading (BL) selon les standards maritimes
 * Chaque compagnie a son propre format de numérotation
 */

export interface BLValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
  detectedFormat?: string;
}

/**
 * Formats de BL par compagnie maritime
 * Sources : Standards SCAC (Standard Carrier Alpha Code)
 */
const BL_FORMATS: Record<string, {
  pattern: RegExp;
  description: string;
  example: string;
}> = {
  'Maersk': {
    pattern: /^[A-Z]{4}\d{7,10}$/,
    description: '4 lettres + 7-10 chiffres',
    example: 'MEDU1234567'
  },
  'CMA CGM': {
    pattern: /^(CMA|CCG)[A-Z0-9]{9,12}$/,
    description: 'Préfixe CMA/CCG + 9-12 caractères alphanumériques',
    example: 'CMAU1234567890'
  },
  'MSC': {
    pattern: /^MSC[A-Z0-9]{9,12}$/,
    description: 'Préfixe MSC + 9-12 caractères alphanumériques',
    example: 'MSCU1234567890'
  },
  'Hapag-Lloyd': {
    pattern: /^HLCU\d{9,11}$/,
    description: 'Préfixe HLCU + 9-11 chiffres',
    example: 'HLCU123456789'
  },
  'Grimaldi': {
    pattern: /^(GRI|GRML)[A-Z0-9]{8,12}$/,
    description: 'Préfixe GRI/GRML + 8-12 caractères',
    example: 'GRML12345678'
  },
  'COSCO': {
    pattern: /^(COSU|COSCO)\d{9,11}$/,
    description: 'Préfixe COSU/COSCO + 9-11 chiffres',
    example: 'COSU123456789'
  },
  'Evergreen': {
    pattern: /^(EGLV|EVGR)[A-Z0-9]{8,12}$/,
    description: 'Préfixe EGLV/EVGR + 8-12 caractères',
    example: 'EGLV12345678'
  },
  'ONE (Ocean Network Express)': {
    pattern: /^ONE[A-Z0-9]{9,12}$/,
    description: 'Préfixe ONE + 9-12 caractères',
    example: 'ONEU123456789'
  },
  'Generic': {
    pattern: /^[A-Z0-9]{8,20}$/,
    description: '8-20 caractères alphanumériques (format générique)',
    example: 'ABC12345678'
  }
};

/**
 * Normalise un numéro BL (uppercase, trim, enlève espaces/tirets)
 * 
 * SÉCURITÉ : Limite à 50 caractères pour éviter ReDoS/DoS
 * Note : BL normalisés doivent être sanitizés (DOMPurify) avant affichage UI
 * 
 * @param bl - Numéro BL brut
 * @returns BL normalisé
 */
export const normalizeBL = (bl: string): string => {
  if (!bl || typeof bl !== 'string') {
    return '';
  }
  
  // Limite longueur pour éviter DoS
  const truncated = bl.substring(0, 50);
  
  return truncated
    .toUpperCase()
    .trim()
    .replace(/[\s\-_]/g, ''); // Enlever espaces, tirets, underscores
};

/**
 * Normalise le nom d'une compagnie maritime
 * 
 * @param line - Nom de la compagnie (format libre)
 * @returns Nom normalisé standardisé ou 'Generic'
 * 
 * @example
 * normalizeShippingLine('maersk') // Returns: 'Maersk'
 * normalizeShippingLine('cma cgm') // Returns: 'CMA CGM'
 * normalizeShippingLine('hapag lloyd') // Returns: 'Hapag-Lloyd'
 */
export const normalizeShippingLine = (line: string): string => {
  if (!line || typeof line !== 'string') {
    return 'Generic';
  }
  
  const normalized = line.toLowerCase().trim();
  
  const mappings: Record<string, string> = {
    'maersk': 'Maersk',
    'mærsk': 'Maersk',
    'cma cgm': 'CMA CGM',
    'cma': 'CMA CGM',
    'cmacgm': 'CMA CGM',
    'cma-cgm': 'CMA CGM',
    'msc': 'MSC',
    'mediterranean shipping company': 'MSC',
    'hapag lloyd': 'Hapag-Lloyd',
    'hapag-lloyd': 'Hapag-Lloyd',
    'hapag': 'Hapag-Lloyd',
    'grimaldi': 'Grimaldi',
    'grimaldi lines': 'Grimaldi',
    'cosco': 'COSCO',
    'evergreen': 'Evergreen',
    'evergreen line': 'Evergreen',
    'one': 'ONE (Ocean Network Express)',
    'ocean network express': 'ONE (Ocean Network Express)'
  };
  
  return mappings[normalized] || 'Generic';
};

// Préfixes optimisés en Map pour performance O(1)
const PREFIX_TO_COMPANY = new Map<string, string>([
  ['MEDU', 'Maersk'],
  ['MAEU', 'Maersk'],
  ['MSKU', 'Maersk'],
  ['CMA', 'CMA CGM'],
  ['CCG', 'CMA CGM'],
  ['MSC', 'MSC'],
  ['HLCU', 'Hapag-Lloyd'],
  ['GRML', 'Grimaldi'],
  ['GRI', 'Grimaldi'],
  ['COSU', 'COSCO'],
  ['COSCO', 'COSCO'],
  ['EGLV', 'Evergreen'],
  ['EVGR', 'Evergreen'],
  ['ONE', 'ONE (Ocean Network Express)']
]);

/**
 * Détecte automatiquement la compagnie maritime depuis le BL
 * Optimisé avec Map pour performance O(1)
 * 
 * @param bl - Numéro BL
 * @returns Nom de la compagnie détectée ou null
 */
export const detectShippingLine = (bl: string): string | null => {
  const normalized = normalizeBL(bl);
  
  // Détection par préfixes connus (lookup O(1))
  for (const [prefix, company] of PREFIX_TO_COMPANY.entries()) {
    if (normalized.startsWith(prefix)) {
      return company;
    }
  }

  return null;
};

/**
 * Valide un numéro BL selon le format de la compagnie
 * 
 * @param bl - Numéro BL à valider
 * @param shippingLine - Compagnie maritime (optionnel, sera auto-détectée)
 * @returns Résultat de validation détaillé
 * 
 * @example
 * validateBLNumber('medu1234567', 'Maersk')
 * // Returns: { isValid: true, normalized: 'MEDU1234567', detectedFormat: 'Maersk' }
 * 
 * validateBLNumber('invalid-bl', 'Maersk')
 * // Returns: { isValid: false, error: 'Format BL invalide...', ... }
 */
export const validateBLNumber = (
  bl: string,
  shippingLine?: string
): BLValidationResult => {
  
  // Validation basique
  if (!bl || typeof bl !== 'string') {
    return {
      isValid: false,
      error: 'Numéro BL manquant'
    };
  }

  const normalized = normalizeBL(bl);

  if (normalized.length < 8) {
    return {
      isValid: false,
      error: 'Numéro BL trop court (min 8 caractères)',
      normalized
    };
  }

  if (normalized.length > 20) {
    return {
      isValid: false,
      error: 'Numéro BL trop long (max 20 caractères)',
      normalized
    };
  }

  // Auto-détection si compagnie non fournie
  let targetCompany = shippingLine;
  const detectedCompany = detectShippingLine(normalized);
  
  if (!targetCompany && detectedCompany) {
    targetCompany = detectedCompany;
  }

  // Validation selon format compagnie
  if (targetCompany && BL_FORMATS[targetCompany]) {
    const format = BL_FORMATS[targetCompany];
    
    if (!format.pattern.test(normalized)) {
      return {
        isValid: false,
        error: `Format BL invalide pour ${targetCompany}. Attendu : ${format.description}`,
        normalized,
        detectedFormat: targetCompany
      };
    }

    return {
      isValid: true,
      normalized,
      detectedFormat: targetCompany
    };
  }

  // Fallback : validation générique
  const genericFormat = BL_FORMATS['Generic'];
  if (!genericFormat.pattern.test(normalized)) {
    return {
      isValid: false,
      error: 'Format BL invalide. Doit contenir 8-20 caractères alphanumériques majuscules.',
      normalized
    };
  }

  return {
    isValid: true,
    normalized,
    detectedFormat: 'Generic'
  };
};

/**
 * Obtient les informations de format pour une compagnie
 * Utile pour afficher des exemples à l'utilisateur
 * 
 * @param shippingLine - Nom de la compagnie
 * @returns Informations de format ou null
 */
export const getBLFormatInfo = (shippingLine: string): {
  description: string;
  example: string;
} | null => {
  return BL_FORMATS[shippingLine] || null;
};

/**
 * Liste toutes les compagnies supportées
 * 
 * @returns Array des noms de compagnies
 */
export const getSupportedShippingLines = (): string[] => {
  return Object.keys(BL_FORMATS).filter(key => key !== 'Generic');
};

/**
 * Suggère des corrections pour un BL invalide
 * 
 * @param bl - BL invalide
 * @param shippingLine - Compagnie
 * @returns Suggestions de correction
 */
export const suggestBLCorrections = (
  bl: string,
  shippingLine?: string
): string[] => {
  const suggestions: string[] = [];
  const normalized = normalizeBL(bl);

  // Si trop court, suggérer d'ajouter des zéros
  if (normalized.length < 8) {
    const padded = normalized.padEnd(8, '0');
    suggestions.push(`Ajouter des zéros : ${padded}`);
  }

  // Si contient minuscules, suggérer majuscules
  if (bl !== normalized) {
    suggestions.push(`Convertir en majuscules : ${normalized}`);
  }

  // Si compagnie détectable, suggérer format
  const detected = detectShippingLine(normalized);
  if (detected && detected !== shippingLine) {
    suggestions.push(`Compagnie détectée : ${detected}`);
  }

  // Suggérer format attendu
  if (shippingLine && BL_FORMATS[shippingLine]) {
    const format = BL_FORMATS[shippingLine];
    suggestions.push(`Format attendu : ${format.example}`);
  }

  return suggestions;
};

/**
 * Tests unitaires - Déplacés vers blValidators.test.ts
 * 
 * @deprecated Utiliser les tests vitest dans __tests__/blValidators.test.ts
 * Cette fonction est conservée pour compatibilité mais ne devrait plus être utilisée
 */
export const runBLValidationTests = (): void => {
  console.warn('runBLValidationTests() est obsolète. Utiliser vitest : npm test blValidators');
};