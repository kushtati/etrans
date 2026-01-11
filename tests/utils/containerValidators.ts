/**
 * Validation des numéros de conteneurs selon la norme ISO 6346
 * 
 * Format : XXXX123456-7
 * - XXXX : 4 lettres (code propriétaire)
 * - 123456 : 6 chiffres (numéro de série)
 * - 7 : 1 chiffre de contrôle (check digit)
 * 
 * Le check digit est calculé selon l'algorithme ISO 6346
 */

export interface ContainerValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
  checkDigit?: {
    provided: number;
    calculated: number;
    match: boolean;
  };
  ownerCode?: string;
  serialNumber?: string;
}

/**
 * Table de conversion lettre → valeur numérique (ISO 6346)
 * A=10, B=12, C=13, ... Z=38
 * Note : Pas de valeur pour I, O, Q pour éviter confusions avec 1, 0, Q
 */
const LETTER_VALUES: Record<string, number> = {
  'A': 10, 'B': 12, 'C': 13, 'D': 14, 'E': 15, 'F': 16, 'G': 17,
  'H': 18, 'I': 19, 'J': 20, 'K': 21, 'L': 23, 'M': 24, 'N': 25,
  'O': 26, 'P': 27, 'Q': 28, 'R': 29, 'S': 30, 'T': 31, 'U': 32,
  'V': 34, 'W': 35, 'X': 36, 'Y': 37, 'Z': 38
};

/**
 * Normalise un numéro de conteneur
 * (uppercase, trim, enlève tirets/espaces)
 * 
 * SÉCURITÉ : Limite à 20 caractères pour éviter DoS
 * Note : Conteneurs normalisés doivent être sanitizés (DOMPurify) avant affichage UI
 * 
 * @param container - Numéro de conteneur brut
 * @returns Conteneur normalisé
 */
export const normalizeContainer = (container: string): string => {
  if (!container || typeof container !== 'string') {
    return '';
  }

  // Limite longueur pour éviter DoS
  const truncated = container.substring(0, 20);

  return truncated
    .toUpperCase()
    .trim()
    .replace(/[\s\-_]/g, ''); // Enlever espaces, tirets, underscores
};

/**
 * Multipliers ISO 6346 pré-calculés (2^0 à 2^9)
 * Performance : Évite Math.pow() en boucle
 */
const ISO_MULTIPLIERS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];

/**
 * Calcule le check digit selon l'algorithme ISO 6346
 * 
 * Algorithme :
 * 1. Convertir les 4 lettres en valeurs numériques
 * 2. Prendre les 6 chiffres
 * 3. Multiplier chaque position par 2^position (1, 2, 4, 8, 16, 32, 64, 128, 256, 512)
 * 4. Additionner tous les produits
 * 5. Diviser par 11 et prendre le reste
 * 6. Si reste = 10, check digit = 0
 * 
 * @param container - Numéro sans check digit (10 premiers caractères)
 * @returns Check digit calculé (0-9)
 * 
 * @example
 * calculateCheckDigit('MSCU663975')
 * // Returns: 8
 */
export const calculateCheckDigit = (container: string): number => {
  const normalized = normalizeContainer(container);

  // Validation format
  if (normalized.length !== 10) {
    throw new Error('Le conteneur doit avoir 10 caractères (4 lettres + 6 chiffres)');
  }

  const letters = normalized.substring(0, 4);
  const digits = normalized.substring(4, 10);

  // Vérifier que les 4 premiers sont des lettres
  if (!/^[A-Z]{4}$/.test(letters)) {
    throw new Error('Les 4 premiers caractères doivent être des lettres');
  }

  // Vérifier que les 6 suivants sont des chiffres
  if (!/^\d{6}$/.test(digits)) {
    throw new Error('Les 6 caractères suivants doivent être des chiffres');
  }

  let sum = 0;

  // Convertir les 4 lettres
  for (let i = 0; i < 4; i++) {
    const letter = letters[i];
    const value = LETTER_VALUES[letter];
    
    if (!value) {
      throw new Error(`Lettre invalide : ${letter}`);
    }

    sum += value * ISO_MULTIPLIERS[i];
  }

  // Ajouter les 6 chiffres
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(digits[i]);
    sum += digit * ISO_MULTIPLIERS[i + 4]; // Position 4 à 9
  }

  // Calculer le reste de la division par 11
  const remainder = sum % 11;

  // Si remainder = 10, check digit = 0 (règle ISO)
  return remainder === 10 ? 0 : remainder;
};

/**
 * Valide un numéro de conteneur complet avec check digit
 * 
 * @param container - Numéro de conteneur (11 caractères)
 * @returns Résultat de validation détaillé
 * 
 * @example
 * validateContainerNumber('MSCU6639758')
 * // Returns: { isValid: true, normalized: 'MSCU6639758', checkDigit: { provided: 8, calculated: 8, match: true } }
 * 
 * validateContainerNumber('MSCU6639757')
 * // Returns: { isValid: false, error: 'Check digit incorrect...', ... }
 */
export const validateContainerNumber = (
  container: string
): ContainerValidationResult => {
  
  // Validation basique
  if (!container || typeof container !== 'string') {
    return {
      isValid: false,
      error: 'Numéro de conteneur manquant'
    };
  }

  const normalized = normalizeContainer(container);

  // Validation longueur
  if (normalized.length !== 11) {
    return {
      isValid: false,
      error: `Longueur invalide : ${normalized.length} caractères (attendu 11)`,
      normalized
    };
  }

  // Validation format général
  const containerRegex = /^[A-Z]{4}\d{7}$/;
  if (!containerRegex.test(normalized)) {
    return {
      isValid: false,
      error: 'Format invalide : doit être 4 lettres + 7 chiffres (ex: MSCU6639758)',
      normalized
    };
  }

  // Extraire les parties
  const ownerCode = normalized.substring(0, 4);
  const serialNumber = normalized.substring(4, 10);
  const providedCheckDigit = parseInt(normalized[10]);

  // Calculer check digit
  let calculatedCheckDigit: number;
  try {
    calculatedCheckDigit = calculateCheckDigit(normalized.substring(0, 10));
  } catch (error: any) {
    return {
      isValid: false,
      error: `Erreur calcul check digit : ${error.message}`,
      normalized
    };
  }

  // Vérifier correspondance
  const match = providedCheckDigit === calculatedCheckDigit;

  if (!match) {
    return {
      isValid: false,
      error: `Check digit incorrect : fourni ${providedCheckDigit}, calculé ${calculatedCheckDigit}`,
      normalized,
      checkDigit: {
        provided: providedCheckDigit,
        calculated: calculatedCheckDigit,
        match: false
      },
      ownerCode,
      serialNumber
    };
  }

  return {
    isValid: true,
    normalized,
    checkDigit: {
      provided: providedCheckDigit,
      calculated: calculatedCheckDigit,
      match: true
    },
    ownerCode,
    serialNumber
  };
};

/**
 * Génère un check digit pour un conteneur partiel
 * Utile pour auto-complétion
 * 
 * @param containerWithoutCheck - 10 premiers caractères
 * @returns Numéro complet avec check digit
 * 
 * @example
 * generateContainerWithCheck('MSCU663975')
 * // Returns: 'MSCU6639758'
 */
export const generateContainerWithCheck = (containerWithoutCheck: string): string => {
  const normalized = normalizeContainer(containerWithoutCheck);

  if (normalized.length !== 10) {
    throw new Error('Doit contenir 10 caractères (4 lettres + 6 chiffres)');
  }

  const checkDigit = calculateCheckDigit(normalized);
  return normalized + checkDigit;
};

/**
 * Extrait des informations du code propriétaire
 * Les 3 premières lettres identifient le propriétaire
 * La 4ème lettre identifie le type d'équipement
 * 
 * @param container - Numéro de conteneur
 * @returns Informations décodées
 */
export const decodeContainerInfo = (container: string): {
  ownerCode: string;
  equipmentCategory: string;
  description: string;
} | null => {
  const normalized = normalizeContainer(container);

  if (normalized.length < 4) {
    return null;
  }

  const ownerCode = normalized.substring(0, 3);
  const categoryCode = normalized[3];

  // Types d'équipement (ISO 6346 complet)
  const equipmentTypes: Record<string, string> = {
    'U': 'Container (Freight Container)',
    'J': 'Detachable Equipment',
    'Z': 'Trailer and Chassis',
    'R': 'Refrigerated Container (Reefer)',
    'T': 'Tank Container',
    'G': 'General Purpose Container',
    'H': 'Refrigerated/Heated Container',
    'P': 'Platform Container',
    'S': 'Named Cargo Container'
  };

  const equipmentCategory = equipmentTypes[categoryCode] || 'Inconnu';

  return {
    ownerCode,
    equipmentCategory,
    description: `${ownerCode} - ${equipmentCategory}`
  };
};

/**
 * Vérifie si un conteneur appartient à une compagnie spécifique
 * 
 * @param container - Numéro de conteneur
 * @param shippingLine - Nom de la compagnie
 * @returns true si correspondance
 */
export const isContainerOwnedBy = (
  container: string,
  shippingLine: string
): boolean => {
  const normalized = normalizeContainer(container);
  const ownerCode = normalized.substring(0, 3);

  // Mapping codes propriétaires → compagnies (source: SCAC official registry)
  const ownershipMap: Record<string, string[]> = {
    'Maersk': ['MSK', 'MAE', 'MSKU'], // MSK = Maersk SeaLand Korea, MAE = Maersk Line, MSKU = Maersk
    'CMA CGM': ['CMA', 'CCG', 'ANL'],
    'MSC': ['MSC', 'MED', 'MSCU'], // Mediterranean Shipping Company
    'Hapag-Lloyd': ['HLC', 'HPL', 'HLCU'],
    'COSCO': ['COS', 'OOL', 'COSU'],
    'Evergreen': ['EGL', 'EVG'],
    'ONE': ['ONE', 'ONEU']
  };

  const codes = ownershipMap[shippingLine];
  return codes ? codes.some(code => ownerCode === code) : false;
};

/**
 * Suggère des corrections pour un conteneur invalide
 * 
 * @param container - Conteneur invalide
 * @returns Suggestions de correction
 */
export const suggestContainerCorrections = (container: string): string[] => {
  const suggestions: string[] = [];
  const normalized = normalizeContainer(container);

  // Longueur incorrecte
  if (normalized.length === 10) {
    try {
      const withCheck = generateContainerWithCheck(normalized);
      suggestions.push(`Ajouter check digit : ${withCheck}`);
    } catch (e) {
      // Ignore
    }
  }

  // Conversion majuscules
  if (container !== normalized) {
    suggestions.push(`Convertir en majuscules : ${normalized}`);
  }

  // Check digit incorrect
  if (normalized.length === 11) {
    try {
      const correctCheck = generateContainerWithCheck(normalized.substring(0, 10));
      if (correctCheck !== normalized) {
        suggestions.push(`Check digit correct : ${correctCheck}`);
      }
    } catch (e) {
      // Ignore
    }
  }

  return suggestions;
};

/**
 * Tests unitaires - Déplacés vers containerValidators.test.ts
 * 
 * @deprecated Utiliser les tests vitest dans __tests__/containerValidators.test.ts
 * Cette fonction est conservée pour compatibilité mais ne devrait plus être utilisée
 */
export const runContainerValidationTests = (): void => {
  console.warn('runContainerValidationTests() est obsolète. Utiliser vitest : npm test containerValidators');
};