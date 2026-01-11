import { describe, it, expect } from 'vitest';
import { CreateShipmentSchema, ExpenseSchema } from './validation';
import { CommodityType } from '../types';

describe('Validation Schemas', () => {
  describe('CreateShipmentSchema', () => {
    it('should validate a correct shipment creation', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5); // 5 days in the future
      const dateStr = futureDate.toISOString().split('T')[0];

      const validInput = {
        clientName: 'Soguiplast SARL',
        commodityType: CommodityType.CONTAINER,
        description: '40" - Granulés Plastiques',
        origin: 'Anvers, BE',
        destination: 'Conakry, GN',
        eta: dateStr,
        blNumber: 'MSKU90123456',
        shippingLine: 'Maersk',
        customsRegime: 'IM4'
      };

      const result = CreateShipmentSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject shipment with clientName too short', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split('T')[0];

      const invalidInput = {
        clientName: 'AB', // Only 2 characters, minimum is 3
        commodityType: CommodityType.CONTAINER,
        description: 'Valid description here',
        origin: 'Anvers, BE',
        destination: 'Conakry, GN',
        eta: dateStr,
        blNumber: 'MSKU90123456',
        shippingLine: 'Maersk',
        customsRegime: 'IM4'
      };

      const result = CreateShipmentSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(e => e.path && e.path[0] === 'clientName')).toBe(true);
      }
    });

    it('should reject shipment with invalid BL number format', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split('T')[0];

      const invalidInput = {
        clientName: 'Valid Company',
        commodityType: CommodityType.CONTAINER,
        description: 'Valid description',
        origin: 'Anvers, BE',
        destination: 'Conakry, GN',
        eta: dateStr,
        blNumber: 'msku-lowercase', // BL must be uppercase and alphanumeric only
        shippingLine: 'Maersk',
        customsRegime: 'IM4'
      };

      const result = CreateShipmentSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(e => e.path && e.path[0] === 'blNumber')).toBe(true);
      }
    });

    it('should reject shipment with invalid ETA date', () => {
      const invalidInput = {
        clientName: 'Valid Company',
        commodityType: CommodityType.CONTAINER,
        description: 'Valid description',
        origin: 'Anvers, BE',
        destination: 'Conakry, GN',
        eta: 'invalid-date',
        blNumber: 'MSKU90123456',
        shippingLine: 'Maersk',
        customsRegime: 'IM4'
      };

      const result = CreateShipmentSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should set default destination if not provided', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const dateStr = futureDate.toISOString().split('T')[0];

      const inputWithoutDest = {
        clientName: 'Valid Company',
        commodityType: CommodityType.CONTAINER,
        description: 'Valid description',
        origin: 'Anvers, BE',
        eta: dateStr,
        blNumber: 'MSKU90123456',
        shippingLine: 'Maersk',
        customsRegime: 'IM4'
      };

      const result = CreateShipmentSchema.safeParse(inputWithoutDest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.destination).toBe('Conakry, GN');
      }
    });
  });

  describe('ExpenseSchema', () => {
    it('should validate a correct expense entry', () => {
      const validExpense = {
        description: 'Frais Portuaires',
        amount: 4500000,
        category: 'Port',
        type: 'DISBURSEMENT'
      };

      const result = ExpenseSchema.safeParse(validExpense);
      expect(result.success).toBe(true);
    });

    it('should reject expense with negative amount', () => {
      const invalidExpense = {
        description: 'Frais Portuaires',
        amount: -1000, // Negative amount not allowed
        category: 'Port',
        type: 'DISBURSEMENT'
      };

      const result = ExpenseSchema.safeParse(invalidExpense);
      expect(result.success).toBe(false);
    });

    it('should reject expense with missing description', () => {
      const invalidExpense = {
        description: 'A', // Too short
        amount: 1000,
        category: 'Port',
        type: 'DISBURSEMENT'
      };

      const result = ExpenseSchema.safeParse(invalidExpense);
      expect(result.success).toBe(false);
    });

    it('should reject expense with invalid category', () => {
      const invalidExpense = {
        description: 'Some Expense',
        amount: 1000,
        category: 'InvalidCategory', // Not in enum
        type: 'DISBURSEMENT'
      };

      const result = ExpenseSchema.safeParse(invalidExpense);
      expect(result.success).toBe(false);
    });

    it('should accept all valid expense types', () => {
      const types = ['PROVISION', 'DISBURSEMENT', 'FEE'];
      
      types.forEach(type => {
        const expense = {
          description: 'Valid Expense',
          amount: 5000,
          category: 'Port',
          type: type
        };

        const result = ExpenseSchema.safeParse(expense);
        expect(result.success).toBe(true);
      });
    });
  });
});
