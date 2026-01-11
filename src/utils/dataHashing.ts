/**
 * Data Hashing Utilities for GDPR/RGPD Compliance
 * Hash sensitive data before logging to prevent exposure in plaintext logs
 * 
 * ✅ No PII (Personally Identifiable Information) in logs
 * ✅ Deterministic hashes for tracking same entities
 * ✅ One-way hashing (cannot be reversed)
 */

/**
 * Simple hash function using SubtleCrypto (async)
 * Produces consistent hash for tracking purposes
 * @param data - String to hash
 * @returns Hash string (first 16 hex chars of SHA-256)
 */
export const hashData = async (data: string): Promise<string> => {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16); // First 16 chars for readability
  } catch (error) {
    console.error('Error hashing data:', error);
    return 'HASH_ERROR';
  }
};

/**
 * Synchronous hash function using simple djb2 algorithm
 * For use when async is not possible (e.g., in synchronous logging)
 * WARNING: Less secure than SHA-256 but deterministic
 * @param data - String to hash
 * @returns Hash string (8 hex digits)
 */
export const hashDataSync = (data: string): string => {
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash) + data.charCodeAt(i);
    hash = hash & 0xffffffff; // Convert to 32-bit integer
  }
  const hexStr = Math.abs(hash).toString(16);
  // Pad to 8 characters with leading zeros
  return hexStr.padStart(8, '0').substring(0, 8);
};

/**
 * Hash client name for logging
 * Deterministic so same client always produces same hash
 * @param clientName - Full client name
 * @returns Hash (8 hex chars prefixed with CLIENT_)
 */
export const hashClientName = (clientName: string): string => {
  return `CLIENT_${hashDataSync(clientName)}`;
};

/**
 * Hash BL (Bill of Lading) number for logging
 * Deterministic for tracking purposes
 * @param blNumber - BL number to hash
 * @returns Hash (8 hex chars prefixed with BL_)
 */
export const hashBLNumber = (blNumber: string): string => {
  return `BL_${hashDataSync(blNumber)}`;
};

/**
 * Hash shipping container number for logging
 * @param containerNumber - Container number
 * @returns Hash (8 hex chars prefixed with CONT_)
 */
export const hashContainerNumber = (containerNumber: string): string => {
  return `CONT_${hashDataSync(containerNumber)}`;
};

/**
 * Hash email address for logging
 * @param email - Email address
 * @returns Hash (8 hex chars prefixed with EMAIL_)
 */
export const hashEmail = (email: string): string => {
  return `EMAIL_${hashDataSync(email.toLowerCase())}`;
};

/**
 * Create a safe log object with hashed sensitive fields
 * @param obj - Object potentially containing sensitive data
 * @param sensitiveFields - Array of field names to hash
 * @returns New object with specified fields hashed
 */
export const hashObjectFields = (
  obj: Record<string, any>,
  sensitiveFields: string[]
): Record<string, any> => {
  const result = { ...obj };
  
  sensitiveFields.forEach(field => {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = hashDataSync(result[field]).substring(0, 8);
    }
  });
  
  return result;
};
