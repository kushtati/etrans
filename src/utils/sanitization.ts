import DOMPurify from 'isomorphic-dompurify';

/**
 * Configuration de sécurité pour DOMPurify
 * Adapté pour un système de transit où on veut du texte pur uniquement
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [], // Aucun tag HTML autorisé
  ALLOWED_ATTR: [], // Aucun attribut HTML autorisé
  KEEP_CONTENT: true, // Garder le contenu texte
  RETURN_TRUSTED_TYPE: false
};

/**
 * Nettoie une chaîne de caractères de tout code malveillant
 * 
 * @param input - Chaîne à nettoyer
 * @param options - Options de nettoyage personnalisées
 * @returns Chaîne nettoyée et sécurisée
 * 
 * @example
 * sanitizeString('<script>alert("XSS")</script>Hello')
 * // Returns: 'Hello'
 * 
 * sanitizeString('John <b>Doe</b>')
 * // Returns: 'John Doe'
 */
export const sanitizeString = (
  input: string, 
  options?: Partial<typeof PURIFY_CONFIG>
): string => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  const config = { ...PURIFY_CONFIG, ...options };
  
  // Nettoyage avec DOMPurify
  const cleaned = DOMPurify.sanitize(input, config);
  
  // Trim et normalisation des espaces multiples
  return cleaned.trim().replace(/\s+/g, ' ');
};

/**
 * Nettoie un objet entier de manière récursive
 * Utile pour nettoyer les formulaires avant envoi
 * 
 * @param obj - Objet à nettoyer
 * @returns Objet nettoyé
 * 
 * @example
 * sanitizeObject({
 *   name: '<script>alert(1)</script>John',
 *   address: { city: 'Conakry<img src=x>' }
 * })
 * // Returns: { name: 'John', address: { city: 'Conakry' } }
 */
export const sanitizeObject = <T extends Record<string, any>>(obj: T): T => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = { ...obj };

  for (const key in sanitized) {
    const value = sanitized[key];

    if (typeof value === 'string') {
      // Nettoyer les chaînes
      sanitized[key] = sanitizeString(value) as any;
    } else if (typeof value === 'object' && value !== null) {
      // Récursion pour objets imbriqués
      sanitized[key] = sanitizeObject(value) as any;
    }
    // Les nombres, booleans, etc. restent inchangés
  }

  return sanitized;
};

/**
 * Validation stricte des noms (clients, utilisateurs)
 * Rejette tout ce qui n'est pas alphanumérique + espaces/tirets
 * 
 * @param name - Nom à valider
 * @returns true si valide, false sinon
 * 
 * @example
 * isValidName('Jean-Claude KAMARA') // true
 * isValidName('John <script>') // false
 */
export const isValidName = (name: string): boolean => {
  // Autorise : lettres (y compris accents), espaces, tirets, apostrophes
  const nameRegex = /^[a-zA-ZÀ-ÿ\s'-]+$/;
  
  const cleaned = sanitizeString(name);
  
  return (
    cleaned.length >= 2 &&
    cleaned.length <= 100 &&
    nameRegex.test(cleaned)
  );
};

/**
 * Nettoie et valide une adresse email
 * 
 * @param email - Email à nettoyer
 * @returns Email nettoyé et validé
 */
export const sanitizeEmail = (email: string): string => {
  if (!email || typeof email !== 'string') {
    return '';
  }

  // Nettoyer et convertir en minuscules
  const cleaned = sanitizeString(email.toLowerCase());
  
  // Valider format email basique
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(cleaned) ? cleaned : '';
};

/**
 * Détecte les tentatives d'injection SQL dans une chaîne
 * (Protection défensive côté client, backend DOIT aussi valider)
 * 
 * @param input - Chaîne à analyser
 * @returns true si suspect, false sinon
 */
export const containsSQLInjection = (input: string): boolean => {
  const sqlPatterns = [
    /(\bOR\b.*=.*)/i,
    /(\bAND\b.*=.*)/i,
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bDROP\b.*\bTABLE\b)/i,
    /(\bINSERT\b.*\bINTO\b)/i,
    /(\bDELETE\b.*\bFROM\b)/i,
    /(--)/,
    /(;.*DROP)/i
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
};

/**
 * Détecte les tentatives d'injection de prompt (pour IA)
 * 
 * @param input - Texte à analyser
 * @returns true si tentative détectée
 */
export const containsPromptInjection = (input: string): boolean => {
  const suspiciousPatterns = [
    /ignore\s+previous\s+instructions/i,
    /disregard\s+all\s+prior/i,
    /forget\s+everything/i,
    /you\s+are\s+now/i,
    /new\s+system\s+prompt/i,
    /override\s+instructions/i
  ];

  return suspiciousPatterns.some(pattern => pattern.test(input));
};

/**
 * Wrapper sécurisé pour les champs de formulaire
 * Combine sanitization + validation contextuelle
 * 
 * @param value - Valeur du champ
 * @param fieldType - Type de champ
 * @returns Objet avec valeur nettoyée et validité
 */
export const sanitizeFormField = (
  value: string,
  fieldType: 'name' | 'email' | 'text' | 'number' | 'bl' | 'container'
): { cleaned: string; isValid: boolean; error?: string } => {
  
  const cleaned = sanitizeString(value);

  switch (fieldType) {
    case 'name':
      if (!isValidName(cleaned)) {
        return { 
          cleaned, 
          isValid: false, 
          error: 'Nom contient des caractères invalides' 
        };
      }
      break;

    case 'email':
      const cleanedEmail = sanitizeEmail(value);
      if (!cleanedEmail) {
        return { 
          cleaned: cleanedEmail, 
          isValid: false, 
          error: 'Email invalide' 
        };
      }
      return { cleaned: cleanedEmail, isValid: true };

    case 'bl':
      // BL doit être alphanumérique majuscule uniquement
      if (!/^[A-Z0-9]+$/.test(cleaned)) {
        return { 
          cleaned, 
          isValid: false, 
          error: 'BL doit contenir uniquement majuscules et chiffres' 
        };
      }
      break;

    case 'container':
      // Conteneur format ISO (sera validé plus tard avec check digit)
      if (!/^[A-Z]{4}\d{7}$/.test(cleaned)) {
        return { 
          cleaned, 
          isValid: false, 
          error: 'Format conteneur invalide' 
        };
      }
      break;

    case 'text':
      // Vérifier injections SQL/Prompt
      if (containsSQLInjection(cleaned)) {
        return { 
          cleaned, 
          isValid: false, 
          error: 'Contenu suspect détecté' 
        };
      }
      if (containsPromptInjection(cleaned)) {
        return { 
          cleaned, 
          isValid: false, 
          error: 'Contenu suspect détecté' 
        };
      }
      break;
  }

  return { cleaned, isValid: true };
};

/**
 * Test de sécurité : Vérifie si la sanitization fonctionne
 * À utiliser en développement uniquement
 */
export const runSecurityTests = (): void => {
  const tests = [
    {
      input: '<script>alert("XSS")</script>Hello',
      expected: 'Hello',
      name: 'XSS Script Tag'
    },
    {
      input: 'John<img src=x onerror="alert(1)">Doe',
      expected: 'JohnDoe',
      name: 'XSS Image Tag'
    },
    {
      input: 'Test\' OR 1=1 --',
      expected: "Test' OR 1=1 --",
      name: 'SQL Injection (cleaned but detected)'
    },
    {
      input: 'Normal text with émojis 🚢',
      expected: 'Normal text with émojis 🚢',
      name: 'Unicode/Emoji'
    }
  ];

  console.log('🔒 Running Security Sanitization Tests...\n');

  tests.forEach(test => {
    const result = sanitizeString(test.input);
    const passed = result === test.expected;
    
    console.log(`${passed ? '✅' : '❌'} ${test.name}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Output: "${result}"`);
    console.log(`   Expected: "${test.expected}"`);
    
    if (test.name.includes('SQL')) {
      const isSuspicious = containsSQLInjection(test.input);
      console.log(`   SQL Injection Detected: ${isSuspicious ? '✅' : '❌'}`);
    }
    console.log('');
  });
};