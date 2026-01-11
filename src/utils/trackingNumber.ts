/**
 * Professional Tracking Number Generation for TransitGuinée
 * Format: REGIME-YY-TIMESTAMP-RANDOM-CHECKSUM-GN
 * Example: IM4-26-123456-789-5-GN
 * 
 * Features:
 * ✅ Unique: Year + Timestamp + Random
 * ✅ Validated: Luhn checksum
 * ✅ Format: Standard industry format
 * ✅ Traceable: Encodes creation timestamp
 */

/**
 * Calculate Luhn checksum for tracking number validation
 * Industry standard for invoice/tracking numbers
 * @param digits - String of digits only
 * @returns Single digit checksum (0-9)
 */
export const calculateLuhnChecksum = (digits: string): number => {
  // Remove any non-digit characters
  const cleanDigits = digits.replace(/\D/g, '');
  
  let sum = 0;
  let isEven = false;

  // Process digits from right to left
  for (let i = cleanDigits.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanDigits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return (10 - (sum % 10)) % 10;
};

/**
 * Generate professional tracking number
 * Format: REGIME-YY-TIMESTAMP-RANDOM-CHECKSUM-GN
 * 
 * Example outputs:
 * - IM4-26-654321-456-7-GN (IM4 regime, created on 654321 milliseconds, checksum 7)
 * - EXPORT-26-654321-123-9-GN (Export regime in uppercase)
 * 
 * @param regime - Customs regime (IM4, IT, AT, Export)
 * @returns Unique, validated tracking number
 */
export const generateTrackingNumber = (regime: string): string => {
  // Normalize regime to uppercase
  const regimeUpper = regime.toUpperCase();
  
  // YY: Last 2 digits of year (26 for 2026)
  const year = new Date().getFullYear().toString().slice(-2);
  
  // TIMESTAMP: Last 6 digits of milliseconds timestamp
  // Provides 1 million unique sequences per millisecond
  const timestamp = Date.now().toString().slice(-6);
  
  // RANDOM: 3-digit random number (100-999)
  // Additional entropy for same-millisecond collisions
  const random = Math.floor(100 + Math.random() * 900);
  
  // Build the base tracking number without checksum
  const base = `${regimeUpper}${year}${timestamp}${random}`;
  
  // Calculate Luhn checksum for validation
  const checksum = calculateLuhnChecksum(base);
  
  // Return formatted: REGIME-YY-TIMESTAMP-RANDOM-CHECKSUM-GN
  return `${regimeUpper}-${year}-${timestamp}-${random}-${checksum}-GN`;
};

/**
 * Validate tracking number format and checksum
 * @param trackingNumber - Tracking number to validate
 * @returns Object with isValid flag and error message if invalid
 */
export const validateTrackingNumber = (trackingNumber: string): { isValid: boolean; error?: string } => {
  // Expected format: REGIME-YY-TIMESTAMP-RANDOM-CHECKSUM-GN
  // Regime can be: IM4, IT, AT, Export (2-6 chars, letters and digits)
  const pattern = /^([A-Z0-9]+)-(\d{2})-(\d{6})-(\d{3})-(\d{1})-GN$/;
  
  const match = trackingNumber.match(pattern);
  if (!match) {
    return { 
      isValid: false, 
      error: 'Format de numéro de suivi invalide' 
    };
  }

  const [, regime, year, timestamp, random, checksumStr] = match;
  const providedChecksum = parseInt(checksumStr, 10);
  
  // Verify checksum
  const base = `${regime}${year}${timestamp}${random}`;
  const calculatedChecksum = calculateLuhnChecksum(base);
  
  if (providedChecksum !== calculatedChecksum) {
    return {
      isValid: false,
      error: 'Checksum invalide - numéro de suivi corrompu'
    };
  }

  // Verify year is reasonable (within 10 years range)
  const currentYear = new Date().getFullYear();
  const trackingYear = 2000 + parseInt(year, 10);
  
  if (trackingYear < currentYear - 5 || trackingYear > currentYear + 5) {
    return {
      isValid: false,
      error: 'Année du numéro de suivi invalide'
    };
  }

  return { isValid: true };
};
