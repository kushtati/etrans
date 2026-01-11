import { describe, it, expect } from 'vitest';
import { 
  calculateCustomsDuties, 
  getDDRateByHSCode,
  searchHSCode,
  suggestHSCode,
  quickCalculate,
  HS_CODE_DATABASE
} from './customsCalculator';

describe('Customs Calculator - Guinea', () => {
  
  describe('HS Code Management', () => {
    it('should return correct DD rate for known HS code', () => {
      expect(getDDRateByHSCode('3920')).toBe(0.05); // Plastiques - 5%
      expect(getDDRateByHSCode('8703')).toBe(0.20); // Voitures - 20%
      expect(getDDRateByHSCode('2402')).toBe(0.35); // Cigarettes - 35%
      expect(getDDRateByHSCode('1006')).toBe(0.00); // Riz - 0%
    });

    it('should return default rate for unknown HS code', () => {
      const rate = getDDRateByHSCode('9999');
      expect(rate).toBe(0.20); // Défaut 20%
    });

    it('should search HS codes by keyword', () => {
      const results = searchHSCode('plastique');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].code).toBe('3920');
    });

    it('should suggest HS code from description', () => {
      const suggested = suggestHSCode('voiture');
      expect(suggested).toBe('8703');
    });

    it('should return null for unknown description', () => {
      const suggested = suggestHSCode('abcxyz123');
      expect(suggested).toBeNull();
    });
  });

  describe('Basic Calculation (IM4 Regime)', () => {
    it('should calculate correctly for standard import', () => {
      const result = calculateCustomsDuties({
        valueFOB: 10000000,
        freight: 500000,
        insurance: 100000,
        hsCode: '3920', // Plastiques DD 5%
        regime: 'IM4'
      });

      expect(result.valueCAF).toBe(10600000);
      expect(result.DD).toBe(530000); // 5% de CAF
      expect(result.RTL).toBe(212000); // 2% de CAF
      expect(result.RDL).toBe(159000); // 1.5% de CAF
      
      // Valeur fiscale = CAF + DD + RTL + RDL
      expect(result.valueFiscale).toBe(11501000);
      
      // TVS = 18% valeur fiscale
      expect(result.TVS).toBe(2070180);
      
      // Total
      expect(result.totalDuties).toBe(2971180);
    });

    it('should calculate correctly for luxury goods (35% DD)', () => {
      const result = calculateCustomsDuties({
        valueFOB: 5000000,
        freight: 200000,
        insurance: 50000,
        hsCode: '2402', // Cigarettes DD 35%
        regime: 'IM4'
      });

      expect(result.valueCAF).toBe(5250000);
      expect(result.DD).toBeCloseTo(1837500, 0); // 35% de CAF
      expect(result.totalDuties).toBeGreaterThan(2000000);
    });

    it('should calculate correctly for essential goods (0% DD)', () => {
      const result = calculateCustomsDuties({
        valueFOB: 8000000,
        freight: 400000,
        insurance: 80000,
        hsCode: '1006', // Riz DD 0%
        regime: 'IM4'
      });

      expect(result.valueCAF).toBe(8480000);
      expect(result.DD).toBe(0); // 0% DD
      expect(result.RTL).toBe(169600); // Toujours RTL
      expect(result.RDL).toBe(127200); // Toujours RDL
    });
  });

  describe('Transit Regime (IT)', () => {
    it('should apply zero taxes for transit', () => {
      const result = calculateCustomsDuties({
        valueFOB: 10000000,
        freight: 500000,
        insurance: 100000,
        hsCode: '8703',
        regime: 'IT'
      });

      expect(result.DD).toBe(0);
      expect(result.RTL).toBe(0);
      expect(result.RDL).toBe(0);
      expect(result.TVS).toBe(0);
      expect(result.totalDuties).toBe(0);
      expect(result.warnings).toContain('Régime IT : Suspension totale (caution requise)');
    });
  });

  describe('Temporary Admission (AT)', () => {
    it('should apply zero taxes for temporary admission', () => {
      const result = calculateCustomsDuties({
        valueFOB: 50000000,
        freight: 2000000,
        insurance: 500000,
        hsCode: '8429', // Engins chantier
        regime: 'AT'
      });

      expect(result.totalDuties).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Export Regime', () => {
    it('should apply zero taxes for exports', () => {
      const result = calculateCustomsDuties({
        valueFOB: 15000000,
        freight: 800000,
        insurance: 200000,
        regime: 'Export'
      });

      expect(result.totalDuties).toBe(0);
      expect(result.warnings).toContain('Export : Aucune taxe d\'importation');
    });
  });

  describe('Exemptions', () => {
    it('should apply diplomatic exemption', () => {
      const result = calculateCustomsDuties({
        valueFOB: 10000000,
        freight: 500000,
        insurance: 100000,
        hsCode: '8703',
        regime: 'IM4',
        isExempted: true,
        exemptionType: 'DIPLOMATIC'
      });

      expect(result.DD).toBe(0);
      expect(result.RTL).toBe(0);
      expect(result.RDL).toBe(0);
      expect(result.TVS).toBe(0);
      expect(result.exemptions.length).toBe(1);
      expect(result.exemptions[0].type).toBe('DIPLOMATIC');
    });

    it('should apply partial exemption for mining', () => {
      const result = calculateCustomsDuties({
        valueFOB: 100000000,
        freight: 5000000,
        insurance: 1000000,
        hsCode: '8429', // Engins chantier
        regime: 'IM4',
        isExempted: true,
        exemptionType: 'MINING'
      });

      expect(result.DD).toBe(0); // Exempté
      expect(result.RTL).toBeGreaterThan(0); // Pas exempté
      expect(result.RDL).toBeGreaterThan(0); // Pas exempté
      expect(result.TVS).toBeGreaterThan(0); // Pas exempté
    });

    it('should apply agricultural exemption (DD + TVS)', () => {
      const result = calculateCustomsDuties({
        valueFOB: 5000000,
        freight: 250000,
        insurance: 50000,
        hsCode: '8701', // Tracteurs
        regime: 'IM4',
        isExempted: true,
        exemptionType: 'AGRICULTURE'
      });

      expect(result.DD).toBe(0); // Exempté
      expect(result.TVS).toBe(0); // Exempté
      expect(result.RTL).toBeGreaterThan(0); // Pas exempté
      expect(result.RDL).toBeGreaterThan(0); // Pas exempté
    });
  });

  describe('Warnings', () => {
    it('should warn about high value shipments', () => {
      const result = calculateCustomsDuties({
        valueFOB: 150000000, // 150M GNF
        freight: 5000000,
        insurance: 1500000,
        regime: 'IM4'
      });

      expect(result.warnings).toContain('Valeur élevée : Vérification valeur par Inspecteur Douanes probable');
    });

    it('should warn when HS code is suggested', () => {
      const result = calculateCustomsDuties({
        valueFOB: 10000000,
        freight: 500000,
        insurance: 100000,
        commodityCategory: 'voiture',
        regime: 'IM4'
      });

      expect(result.warnings.some(w => w.includes('Code SH suggéré'))).toBe(true);
    });
  });

  describe('Quick Calculate', () => {
    it('should work with description only', () => {
      const result = quickCalculate(10000000, 500000, 100000, 'plastique');

      expect(result.valueCAF).toBe(10600000);
      expect(result.hsCode).toBe('3920');
      expect(result.totalDuties).toBeGreaterThan(0);
    });

    it('should work without description', () => {
      const result = quickCalculate(10000000, 500000, 100000);

      expect(result.valueCAF).toBe(10600000);
      expect(result.totalDuties).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should throw error for negative CAF', () => {
      expect(() => {
        calculateCustomsDuties({
          valueFOB: -1000,
          freight: 0,
          insurance: 0,
          regime: 'IM4'
        });
      }).toThrow('Valeur CAF doit être positive');
    });

    it('should handle zero freight and insurance', () => {
      const result = calculateCustomsDuties({
        valueFOB: 10000000,
        freight: 0,
        insurance: 0,
        regime: 'IM4'
      });

      expect(result.valueCAF).toBe(10000000);
      expect(result.totalDuties).toBeGreaterThan(0);
    });

    it('should handle very large values', () => {
      const result = calculateCustomsDuties({
        valueFOB: 1000000000, // 1 milliard
        freight: 50000000,
        insurance: 10000000,
        regime: 'IM4'
      });

      expect(result.valueCAF).toBe(1060000000);
      expect(result.totalDuties).toBeGreaterThan(0);
      expect(isFinite(result.totalDuties)).toBe(true);
    });
  });

  describe('Rate Accuracy', () => {
    it('should match known Guinea tariff rates', () => {
      // Vérifier correspondance avec tarifs officiels
      const testCases = [
        { code: '3002', expectedDD: 0.00, description: 'Médicaments' },
        { code: '1006', expectedDD: 0.00, description: 'Riz' },
        { code: '3920', expectedDD: 0.05, description: 'Plastiques' },
        { code: '8703', expectedDD: 0.20, description: 'Voitures' },
        { code: '2402', expectedDD: 0.35, description: 'Cigarettes' },
      ];

      testCases.forEach(tc => {
        const rate = getDDRateByHSCode(tc.code);
        expect(rate).toBe(tc.expectedDD);
      });
    });
  });

  describe('Database Integrity', () => {
    it('should have valid HS codes in database', () => {
      Object.keys(HS_CODE_DATABASE).forEach(code => {
        const entry = HS_CODE_DATABASE[code];
        
        expect(entry.code).toBe(code);
        expect(entry.description).toBeTruthy();
        expect(entry.ddRate).toBeGreaterThanOrEqual(0);
        expect(entry.ddRate).toBeLessThanOrEqual(0.35);
        expect(entry.examples.length).toBeGreaterThan(0);
      });
    });

    it('should have all categories represented', () => {
      const categories = new Set(
        Object.values(HS_CODE_DATABASE).map(e => e.category)
      );

      expect(categories.has('ESSENTIAL')).toBe(true);
      expect(categories.has('RAW_MATERIAL')).toBe(true);
      expect(categories.has('INTERMEDIATE')).toBe(true);
      expect(categories.has('FINAL_GOODS')).toBe(true);
      expect(categories.has('SPECIFIC')).toBe(true);
    });
  });
});
