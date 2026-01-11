import { describe, it, expect } from 'vitest';
import { 
  hashDataSync, 
  hashClientName, 
  hashBLNumber,
  hashContainerNumber,
  hashEmail,
  hashObjectFields
} from '../utils/dataHashing';

describe('Data Hashing Utilities - GDPR Compliance', () => {
  describe('hashDataSync', () => {
    it('should produce consistent hash for same input', () => {
      const input = 'TestData123';
      const hash1 = hashDataSync(input);
      const hash2 = hashDataSync(input);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different inputs', () => {
      const hash1 = hashDataSync('Client1');
      const hash2 = hashDataSync('Client2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should return 8 character hex string', () => {
      const hash = hashDataSync('test');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should handle special characters', () => {
      const hash = hashDataSync('Client@#$%^&*()Name');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('hashClientName', () => {
    it('should return CLIENT_ prefixed hash', () => {
      const hash = hashClientName('Acme Corp');
      expect(hash).toMatch(/^CLIENT_[0-9a-f]{8}$/);
    });

    it('should be consistent for same client', () => {
      const hash1 = hashClientName('Soguiplast SARL');
      const hash2 = hashClientName('Soguiplast SARL');
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('hashBLNumber', () => {
    it('should return BL_ prefixed hash', () => {
      const hash = hashBLNumber('MEDU1234567');
      expect(hash).toMatch(/^BL_[0-9a-f]{8}$/);
    });

    it('should be case-sensitive', () => {
      const hash1 = hashBLNumber('MEDU1234567');
      const hash2 = hashBLNumber('medu1234567');
      
      // Should be different because hash is case-sensitive
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashContainerNumber', () => {
    it('should return CONT_ prefixed hash', () => {
      const hash = hashContainerNumber('MSKU4567890');
      expect(hash).toMatch(/^CONT_[0-9a-f]{8}$/);
    });
  });

  describe('hashEmail', () => {
    it('should return EMAIL_ prefixed hash', () => {
      const hash = hashEmail('user@example.com');
      expect(hash).toMatch(/^EMAIL_[0-9a-f]{8}$/);
    });

    it('should normalize to lowercase before hashing', () => {
      const hash1 = hashEmail('User@Example.COM');
      const hash2 = hashEmail('user@example.com');
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('hashObjectFields', () => {
    it('should hash specified fields in object', () => {
      const obj = {
        id: 'shipment-123',
        clientName: 'Acme Corporation',
        blNumber: 'MEDU1234567',
        amount: 50000
      };

      const result = hashObjectFields(obj, ['clientName', 'blNumber']);

      expect(result.id).toBe('shipment-123');
      expect(result.amount).toBe(50000);
      expect(result.clientName).toMatch(/^[0-9a-f]{8}$/);
      expect(result.blNumber).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should not modify original object', () => {
      const obj = { name: 'Test', value: 123 };
      const original = { ...obj };

      hashObjectFields(obj, ['name']);

      expect(obj).toEqual(original);
    });

    it('should handle non-string fields gracefully', () => {
      const obj = {
        id: 123,
        name: 'Test',
        active: true
      };

      const result = hashObjectFields(obj, ['id', 'active', 'name']);

      expect(result.id).toBe(123); // Not a string, not hashed
      expect(result.active).toBe(true); // Not a string, not hashed
      expect(result.name).toMatch(/^[0-9a-f]{8}$/); // String, hashed
    });
  });

  describe('GDPR Compliance', () => {
    it('should prevent logging of raw client names', () => {
      const clientName = 'Jean Dupont';
      const logged = hashClientName(clientName);

      // Hash should not contain original name
      expect(logged).not.toContain('Jean');
      expect(logged).not.toContain('Dupont');
      expect(logged).toMatch(/^CLIENT_[0-9a-f]{8}$/);
    });

    it('should prevent logging of raw BL numbers', () => {
      const blNumber = 'MEDU1234567';
      const logged = hashBLNumber(blNumber);

      // Hash should not contain original BL number
      expect(logged).not.toContain('MEDU');
      expect(logged).not.toContain('1234567');
      expect(logged).toMatch(/^BL_[0-9a-f]{8}$/);
    });

    it('should prevent logging of raw emails', () => {
      const email = 'user@example.com';
      const logged = hashEmail(email);

      // Hash should not contain original email
      expect(logged).not.toContain('user');
      expect(logged).not.toContain('example');
      expect(logged).toMatch(/^EMAIL_[0-9a-f]{8}$/);
    });
  });
});
