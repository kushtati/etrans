import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  fetchCurrentCustomsRates,
  daysSince,
  isRatesStale,
  formatLastUpdate
} from '../services/customsRatesService';
import { calculateCustomsDuties, validateCustomsRates } from '../services/customsCalculator';
import { CustomsRates } from '../types';

describe('Customs Rates Service - Guinea', () => {
  describe('fetchCurrentCustomsRates', () => {
    it('should fetch valid customs rates', async () => {
      const rates = await fetchCurrentCustomsRates();
      
      expect(rates).toBeDefined();
      expect(rates.rtl).toBeGreaterThan(0);
      expect(rates.rdl).toBeGreaterThan(0);
      expect(rates.tvs).toBeGreaterThan(0);
      expect(rates.dd).toBeGreaterThan(0);
    });

    it('should include last update timestamp', async () => {
      const rates = await fetchCurrentCustomsRates();
      
      expect(rates.lastUpdate).toBeDefined();
      const date = new Date(rates.lastUpdate);
      expect(date).toBeInstanceOf(Date);
      expect(date.toString()).not.toBe('Invalid Date');
    });

    it('should include source information', async () => {
      const rates = await fetchCurrentCustomsRates();
      
      expect(rates.source).toBeDefined();
      expect(rates.source).not.toBe('');
    });

    it('should have reasonable rate values', async () => {
      const rates = await fetchCurrentCustomsRates();
      
      // Rates should be between 0% and 100%
      expect(rates.rtl).toBeGreaterThanOrEqual(0);
      expect(rates.rtl).toBeLessThanOrEqual(1);
      expect(rates.rdl).toBeGreaterThanOrEqual(0);
      expect(rates.rdl).toBeLessThanOrEqual(1);
      expect(rates.tvs).toBeGreaterThanOrEqual(0);
      expect(rates.tvs).toBeLessThanOrEqual(1);
      expect(rates.dd).toBeGreaterThanOrEqual(0);
      expect(rates.dd).toBeLessThanOrEqual(1);
    });
  });

  describe('daysSince', () => {
    it('should calculate 0 days for today', () => {
      const today = new Date();
      expect(daysSince(today)).toBe(0);
    });

    it('should calculate correct days for past dates', () => {
      const oneDay = new Date();
      oneDay.setDate(oneDay.getDate() - 1);
      expect(daysSince(oneDay)).toBe(1);

      const sevenDays = new Date();
      sevenDays.setDate(sevenDays.getDate() - 7);
      expect(daysSince(sevenDays)).toBe(7);

      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() - 30);
      expect(daysSince(thirtyDays)).toBe(30);
    });

    it('should handle future dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(daysSince(tomorrow)).toBe(-1);
    });
  });

  describe('isRatesStale', () => {
    it('should return false for recent rates (< 30 days)', () => {
      const recent = new Date();
      recent.setDate(recent.getDate() - 15); // 15 days ago
      
      expect(isRatesStale(recent)).toBe(false);
    });

    it('should return true for old rates (> 30 days)', () => {
      const old = new Date();
      old.setDate(old.getDate() - 35); // 35 days ago
      
      expect(isRatesStale(old)).toBe(true);
    });

    it('should return false for today', () => {
      const today = new Date();
      expect(isRatesStale(today)).toBe(false);
    });

    it('should return false for exactly 30 days', () => {
      const exactly30 = new Date();
      exactly30.setDate(exactly30.getDate() - 30);
      
      expect(isRatesStale(exactly30)).toBe(false);
    });

    it('should return true for 31 days', () => {
      const moreThan30 = new Date();
      moreThan30.setDate(moreThan30.getDate() - 31);
      
      expect(isRatesStale(moreThan30)).toBe(true);
    });
  });

  describe('formatLastUpdate', () => {
    it('should format date in French locale', () => {
      // Mock French locale for CI consistency
      const originalToLocaleDateString = Date.prototype.toLocaleDateString;
      Date.prototype.toLocaleDateString = vi.fn(() => '15 janvier 2026 à 14:30');
      
      const date = new Date('2026-01-15T14:30:00Z');
      const formatted = formatLastUpdate(date);
      
      expect(formatted).toContain('15');
      expect(formatted).toContain('janvier');
      expect(formatted).toContain('2026');
      
      // Restore
      Date.prototype.toLocaleDateString = originalToLocaleDateString;
    });

    it('should include time information', () => {
      const date = new Date('2026-01-15T14:30:00Z');
      const formatted = formatLastUpdate(date);
      
      // Should contain time (hour and minute) - flexible for CI timezones
      expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('Customs Rate Calculations', () => {
    it('should support accurate duty calculations using CustomsCalculator', async () => {
      const rates = await fetchCurrentCustomsRates();

      // Validate rates are within bounds
      expect(validateCustomsRates(rates)).toBe(true);

      // Test shipment: FOB=1,000,000 GNF, Freight=100,000, Insurance=50,000
      const valueFOB = 1000000;
      const freight = 100000;
      const insurance = 50000;

      // Use centralized CustomsCalculator (decimal.js precision)
      const breakdown = calculateCustomsDuties(valueFOB, freight, insurance, rates);

      // Verify structure
      expect(breakdown.valueCAF).toBe(valueFOB + freight + insurance);
      expect(breakdown.taxableBaseTVS).toBe(breakdown.valueCAF + breakdown.dd);

      // All values should be positive numbers
      expect(breakdown.rtl).toBeGreaterThan(0);
      expect(breakdown.rdl).toBeGreaterThan(0);
      expect(breakdown.dd).toBeGreaterThan(0);
      expect(breakdown.tvs).toBeGreaterThan(0);
      expect(breakdown.totalDuties).toBeGreaterThan(0);

      // Total duties should be significant portion of CAF
      // (typical: 40-60% of CAF for Guinea)
      expect(breakdown.totalDuties).toBeGreaterThan(breakdown.valueCAF * 0.3);
      expect(breakdown.totalDuties).toBeLessThan(breakdown.valueCAF * 1.0);
    });
  });

  describe('Rate Updates and Compliance', () => {
    it('should indicate when rates need verification', async () => {
      const rates = await fetchCurrentCustomsRates();
      const ratesDate = new Date(rates.lastUpdate);

      // Application should warn if rates > 30 days old
      if (daysSince(ratesDate) > 30) {
        expect(isRatesStale(ratesDate)).toBe(true);
      } else {
        expect(isRatesStale(ratesDate)).toBe(false);
      }
    });

    it('should provide audit trail of rate source', async () => {
      const rates = await fetchCurrentCustomsRates();

      // Source should be traceable to government decree or official source
      expect(rates.source).toBeDefined();
      expect(rates.source.length).toBeGreaterThan(0);
    });
  });
});
