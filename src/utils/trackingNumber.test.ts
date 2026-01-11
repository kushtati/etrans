import { describe, it, expect } from 'vitest';
import { calculateLuhnChecksum, generateTrackingNumber, validateTrackingNumber } from '../utils/trackingNumber';

describe('Tracking Number Generation', () => {
  describe('calculateLuhnChecksum', () => {
    it('should calculate correct Luhn checksum', () => {
      // Test with known Luhn values
      const checksum1 = calculateLuhnChecksum('123456789');
      expect(checksum1).toBe(3);
      
      const checksum2 = calculateLuhnChecksum('490067715');
      expect(checksum2).toBe(2);
    });

    it('should handle non-digit characters', () => {
      const checksum1 = calculateLuhnChecksum('1-2-3-4-5-6-7-8-9');
      expect(checksum1).toBe(3);
      
      const checksum2 = calculateLuhnChecksum('490-067-715');
      expect(checksum2).toBe(2);
    });
  });

  describe('generateTrackingNumber', () => {
    it('should generate valid IM4 tracking number', () => {
      const trackingNumber = generateTrackingNumber('IM4');
      expect(trackingNumber).toMatch(/^IM4-\d{2}-\d{6}-\d{3}-\d{1}-GN$/);
    });

    it('should generate valid IT tracking number', () => {
      const trackingNumber = generateTrackingNumber('IT');
      expect(trackingNumber).toMatch(/^IT-\d{2}-\d{6}-\d{3}-\d{1}-GN$/);
    });

    it('should generate unique tracking numbers', () => {
      const numbers = new Set();
      
      // Generate 10 tracking numbers
      for (let i = 0; i < 10; i++) {
        numbers.add(generateTrackingNumber('IM4'));
      }
      
      // Should have 10 unique numbers (or at least 8+ with high probability)
      expect(numbers.size).toBeGreaterThanOrEqual(8);
    });

    it('should include current year', () => {
      const trackingNumber = generateTrackingNumber('IM4');
      const year = new Date().getFullYear().toString().slice(-2);
      expect(trackingNumber).toContain(`-${year}-`);
    });
  });

  describe('validateTrackingNumber', () => {
    it('should validate generated tracking numbers', () => {
      const trackingNumber = generateTrackingNumber('IM4');
      const result = validateTrackingNumber(trackingNumber);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid format', () => {
      const result = validateTrackingNumber('INVALID-FORMAT');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject corrupted checksum', () => {
      // Generate valid number then corrupt it
      const validNumber = generateTrackingNumber('IM4');
      const parts = validNumber.split('-');
      parts[4] = '9'; // Change checksum to invalid value
      const corruptedNumber = parts.join('-');
      
      const result = validateTrackingNumber(corruptedNumber);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Checksum');
    });

    it('should accept all valid regimes', () => {
      const regimes = ['IM4', 'IT', 'AT', 'Export'];
      
      regimes.forEach(regime => {
        const trackingNumber = generateTrackingNumber(regime);
        const result = validateTrackingNumber(trackingNumber);
        if (!result.isValid) {
          console.log(`Failed for regime ${regime}:`, trackingNumber, result.error);
        }
        expect(result.isValid).toBe(true);
      });
    });
  });
});
