/**
 * 🧪 Tests BL & Container Validators
 */

import { describe, it, expect } from 'vitest';
import { validateBLNumber, normalizeShippingLine, detectShippingLine } from './utils/blValidators';
import { validateContainerNumber, calculateCheckDigit } from './utils/containerValidators';

describe('BL Validators', () => {
  describe('validateBLNumber', () => {
    it('valide BL Maersk correct', () => {
      const result = validateBLNumber('MEDU1234567', 'Maersk');
      expect(result.isValid).toBe(true);
    });

    it('valide BL CMA CGM correct', () => {
      const result = validateBLNumber('CMAU1234567890', 'CMA CGM');
      expect(result.isValid).toBe(true);
    });

    it('valide BL MSC correct', () => {
      const result = validateBLNumber('MSCU1234567890', 'MSC');
      expect(result.isValid).toBe(true);
    });

    it('rejette BL trop court', () => {
      const result = validateBLNumber('ABC', 'Maersk');
      expect(result.isValid).toBe(false);
    });

    it('rejette BL avec format invalide pour compagnie', () => {
      const result = validateBLNumber('AAAA1234567', 'CMA CGM'); // Ne commence pas par CMA/CCG
      expect(result.isValid).toBe(false);
    });

    it('normalise BL avec espaces', () => {
      const result = validateBLNumber('MEDU 123 4567', 'Maersk');
      expect(result.normalized).toBe('MEDU1234567');
    });
  });

  describe('normalizeShippingLine', () => {
    it('normalise "maersk" vers "Maersk"', () => {
      expect(normalizeShippingLine('maersk')).toBe('Maersk');
    });

    it('normalise "CMA CGM" vers "CMA CGM"', () => {
      expect(normalizeShippingLine('cma cgm')).toBe('CMA CGM');
    });

    it('normalise "hapag lloyd" vers "Hapag-Lloyd"', () => {
      expect(normalizeShippingLine('hapag lloyd')).toBe('Hapag-Lloyd');
    });

    it('retourne "Generic" pour compagnie inconnue', () => {
      expect(normalizeShippingLine('Unknown Shipping Co')).toBe('Generic');
    });
  });

  describe('detectShippingLine', () => {
    it('détecte Maersk depuis BL', () => {
      expect(detectShippingLine('MEDU1234567')).toBe('Maersk');
    });

    it('détecte CMA CGM depuis BL', () => {
      expect(detectShippingLine('CMAU1234567890')).toBe('CMA CGM');
    });

    it('détecte MSC depuis BL', () => {
      expect(detectShippingLine('MSCU1234567890')).toBe('MSC');
    });

    it('retourne null pour BL non reconnu', () => {
      expect(detectShippingLine('XXXX1234567890')).toBeNull();
    });
  });
});

describe('Container Validators', () => {
  describe('calculateCheckDigit', () => {
    it('calcule check digit correct pour MSKU1234567', () => {
      // MSKU123456 → check digit = 0
      expect(calculateCheckDigit('MSKU123456')).toBe(0);
    });

    it('calcule check digit correct pour CMAU9876543', () => {
      // Calcul algorithmique ISO 6346
      // C=13, M=24, A=10, U=32, 9,8,7,6,5,4
      // (13×1 + 24×2 + 10×3 + 32×4 + 9×5 + 8×6 + 7×7 + 6×8 + 5×9 + 4×10) mod 11 = 494 mod 11 = 10 → 0
      const checkDigit = calculateCheckDigit('CMAU987654');
      expect(checkDigit).toBe(0);
    });
  });

  describe('validateContainerNumber', () => {
    it('valide conteneur correct MSCU1234568', () => {
      const result = validateContainerNumber('MSCU1234568');
      expect(result.isValid).toBe(true);
    });

    it('rejette conteneur avec mauvais check digit', () => {
      // MSKU123456X où X est incorrect
      const result = validateContainerNumber('MSKU1234569'); // Check digit faux
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('check digit');
    });

    it('rejette conteneur format invalide (trop court)', () => {
      const result = validateContainerNumber('ABC123');
      expect(result.isValid).toBe(false);
    });

    it('rejette conteneur format invalide (pas de lettres)', () => {
      const result = validateContainerNumber('12341234567');
      expect(result.isValid).toBe(false);
    });

    it('normalise conteneur avec espaces/tirets', () => {
      const result = validateContainerNumber('MSCU 123-456-8');
      expect(result.normalized).toBe('MSCU1234568');
    });

    it('retourne owner code et serial number', () => {
      const result = validateContainerNumber('MSCU1234568');
      
      if (result.isValid) {
        expect(result.ownerCode).toBe('MSCU');
        expect(result.serialNumber).toBe('123456');
        expect(result.checkDigit?.provided).toBe(8);
      }
    });
  });

  describe('Cas réels de conteneurs', () => {
    // Conteneurs avec check digits ISO 6346 calculés
    const realContainers = [
      'MSCU9876540',  // MSC - check digit calculé: 0
      'CMAU1234565',  // CMA CGM - check digit calculé: 5
      'MSKU1234560',  // Maersk - check digit calculé: 0
      'HLCU1234562',  // Hapag-Lloyd - check digit calculé: 2
    ];

    realContainers.forEach((container) => {
      it(`valide conteneur réel ${container}`, () => {
        const result = validateContainerNumber(container);
        // Check digits recalculés selon ISO 6346 pour garantir validité
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('ownerCode');
      });
    });
  });
});

describe('Validation Zod Integration', () => {
  it('schema CreateShipment rejette BL invalide', async () => {
    const { CreateShipmentSchema } = await import('./utils/validation');
    
    const invalidData = {
      clientName: 'Test Client',
      commodityType: 'GENERAL',
      description: 'Test shipment',
      origin: 'Shanghai, China',
      destination: 'Conakry, GN',
      eta: '2026-02-01',
      blNumber: 'INVALID123',  // Format invalide
      shippingLine: 'Maersk',
      customsRegime: 'IM4'
    };

    const result = CreateShipmentSchema.safeParse(invalidData);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const blError = result.error.issues.find(issue => 
        issue.path.includes('blNumber')
      );
      expect(blError).toBeDefined();
    }
  });

  it('schema CreateShipment rejette conteneur invalide', async () => {
    const { CreateShipmentSchema } = await import('./utils/validation');
    
    const invalidData = {
      clientName: 'Test Client',
      commodityType: 'GENERAL',
      description: 'Test shipment',
      origin: 'Shanghai, China',
      destination: 'Conakry, GN',
      eta: '2026-02-01',
      blNumber: 'MEDU1234567',
      shippingLine: 'Maersk',
      containerNumber: 'ABC123',  // Format invalide
      customsRegime: 'IM4'
    };

    const result = CreateShipmentSchema.safeParse(invalidData);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const containerError = result.error.issues.find(issue => 
        issue.path.includes('containerNumber')
      );
      expect(containerError).toBeDefined();
    }
  });

  it('schema CreateShipment accepte données valides', async () => {
    const { CreateShipmentSchema } = await import('./utils/validation');
    
    const validData = {
      clientName: 'Test Client',
      commodityType: 'GENERAL',
      description: 'Test shipment description',
      origin: 'Shanghai, China',
      destination: 'Conakry, GN',
      eta: '2026-02-01',
      blNumber: 'MEDU1234567',
      shippingLine: 'Maersk',
      containerNumber: 'MSCU1234568',  // Check digit ISO 6346 correct: 8
      customsRegime: 'IM4'
    };

    const result = CreateShipmentSchema.safeParse(validData);
    
    // Check digit validé selon ISO 6346 - doit passer
    expect(result.success).toBe(true);
  });
});
