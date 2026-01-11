/**
 * TESTS - PAYMENT SERVICE
 * 
 * Tests unitaires pour la logique métier financière
 * Architecture: Logique isolée, pas de dépendances React
 */

import { describe, it, expect } from 'vitest';
import { PaymentService } from './paymentService';
import { Shipment, ShipmentStatus, Expense, CommodityType } from '../types';

// ============================================
// MOCK DATA
// ============================================

const createMockShipment = (overrides?: Partial<Shipment>): Shipment => ({
  id: 'test-1',
  trackingNumber: 'TR-TEST-001',
  blNumber: 'BL123456',
  clientId: 'client-1',
  clientName: 'Test Client',
  commodityType: CommodityType.CONTAINER,
  description: 'Test shipment',
  origin: 'Test Origin',
  destination: 'Conakry, GN',
  status: ShipmentStatus.CUSTOMS_LIQUIDATION,
  eta: new Date().toISOString(),
  freeDays: 7,
  documents: [],
  expenses: [],
  alerts: [],
  shippingLine: 'Test Line',
  customsRegime: 'IM4',
  ...overrides
});

const createMockExpense = (overrides?: Partial<Expense>): Expense => ({
  id: `exp-${Date.now()}`,
  description: 'Test Expense',
  amount: 1000000,
  paid: false,
  category: 'Douane',
  type: 'DISBURSEMENT',
  date: new Date().toISOString(),
  ...overrides
});

// ============================================
// TESTS - BALANCE CALCULATION
// ============================================

describe('PaymentService - calculateBalance', () => {
  it('should calculate balance correctly with provisions and disbursements', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 5000000, paid: true }),
        createMockExpense({ type: 'PROVISION', amount: 3000000, paid: true }),
        createMockExpense({ type: 'DISBURSEMENT', amount: 2000000, paid: true }),
        createMockExpense({ type: 'DISBURSEMENT', amount: 1000000, paid: true }),
      ]
    });

    const balance = PaymentService.calculateBalance(shipment);

    expect(balance.paidProvisions).toBe(8000000);
    expect(balance.paidDisbursements).toBe(3000000);
    expect(balance.balance).toBe(5000000); // 8M - 3M
  });

  it('should only count paid provisions', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 5000000, paid: true }),
        createMockExpense({ type: 'PROVISION', amount: 3000000, paid: false }), // Not paid
      ]
    });

    const balance = PaymentService.calculateBalance(shipment);

    expect(balance.provisions).toBe(8000000); // Total
    expect(balance.paidProvisions).toBe(5000000); // Only paid
    expect(balance.balance).toBe(5000000);
  });

  it('should handle empty expenses array', () => {
    const shipment = createMockShipment({
      expenses: []
    });

    const balance = PaymentService.calculateBalance(shipment);

    expect(balance.balance).toBe(0);
    expect(balance.provisions).toBe(0);
    expect(balance.disbursements).toBe(0);
  });

  it('should handle negative balance', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 1000000, paid: true }),
        createMockExpense({ type: 'DISBURSEMENT', amount: 3000000, paid: true }),
      ]
    });

    const balance = PaymentService.calculateBalance(shipment);

    expect(balance.balance).toBe(-2000000);
  });
});

// ============================================
// TESTS - FIND PENDING LIQUIDATION
// ============================================

describe('PaymentService - findPendingLiquidation', () => {
  it('should find unpaid customs liquidation', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({
          description: 'Liquidation Douane',
          category: 'Douane',
          type: 'DISBURSEMENT',
          paid: false,
          amount: 2500000
        })
      ]
    });

    const liquidation = PaymentService.findPendingLiquidation(shipment);

    expect(liquidation).toBeDefined();
    expect(liquidation?.amount).toBe(2500000);
    expect(liquidation?.paid).toBe(false);
  });

  it('should return undefined if no pending liquidation', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({
          category: 'Port', // Not customs
          type: 'DISBURSEMENT',
          paid: false
        })
      ]
    });

    const liquidation = PaymentService.findPendingLiquidation(shipment);

    expect(liquidation).toBeUndefined();
  });

  it('should ignore paid liquidations', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({
          category: 'Douane',
          type: 'DISBURSEMENT',
          paid: true // Already paid
        })
      ]
    });

    const liquidation = PaymentService.findPendingLiquidation(shipment);

    expect(liquidation).toBeUndefined();
  });
});

// ============================================
// TESTS - CAN PAY LIQUIDATION
// ============================================

describe('PaymentService - canPayLiquidation', () => {
  it('should allow payment when balance is sufficient', () => {
    const shipment = createMockShipment({
      expenses: [
        // Provisions
        createMockExpense({ type: 'PROVISION', amount: 5000000, paid: true }),
        
        // Liquidation
        createMockExpense({
          description: 'Liquidation Douane',
          category: 'Douane',
          type: 'DISBURSEMENT',
          amount: 2500000,
          paid: false
        })
      ]
    });

    const result = PaymentService.canPayLiquidation(shipment);

    expect(result.success).toBe(true);
    expect(result.message).toContain('autorisé');
  });

  it('should refuse payment when balance is insufficient', () => {
    const shipment = createMockShipment({
      expenses: [
        // Provision insuffisante
        createMockExpense({ type: 'PROVISION', amount: 1000000, paid: true }),
        
        // Liquidation plus élevée
        createMockExpense({
          category: 'Douane',
          type: 'DISBURSEMENT',
          amount: 2500000,
          paid: false
        })
      ]
    });

    const result = PaymentService.canPayLiquidation(shipment);

    expect(result.success).toBe(false);
    expect(result.message).toContain('insuffisant');
    expect(result.requiredAmount).toBe(1500000); // 2.5M - 1M
  });

  it('should handle exact balance match', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 2500000, paid: true }),
        createMockExpense({
          category: 'Douane',
          type: 'DISBURSEMENT',
          amount: 2500000,
          paid: false
        })
      ]
    });

    const result = PaymentService.canPayLiquidation(shipment);

    expect(result.success).toBe(true);
  });

  it('should account for other paid disbursements', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 5000000, paid: true }),
        createMockExpense({ type: 'DISBURSEMENT', category: 'Port', amount: 1000000, paid: true }),
        createMockExpense({
          category: 'Douane',
          type: 'DISBURSEMENT',
          amount: 2500000,
          paid: false
        })
      ]
    });

    const result = PaymentService.canPayLiquidation(shipment);

    // Balance = 5M provision - 1M disbursement = 4M
    // Liquidation = 2.5M
    // Should succeed
    expect(result.success).toBe(true);
  });

  it('should fail when no liquidation exists', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 5000000, paid: true })
      ]
    });

    const result = PaymentService.canPayLiquidation(shipment);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Aucune liquidation');
  });
});

// ============================================
// TESTS - PROVISION RECOMMENDATIONS
// ============================================

describe('PaymentService - provision recommendations', () => {
  it('should detect when provision is required', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 1000000, paid: true }),
        createMockExpense({
          category: 'Douane',
          type: 'DISBURSEMENT',
          amount: 3000000,
          paid: false
        })
      ]
    });

    const required = PaymentService.isProvisionRequired(shipment);
    expect(required).toBe(true);
  });

  it('should calculate recommended provision with 10% margin', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 1000000, paid: true }),
        createMockExpense({
          category: 'Douane',
          type: 'DISBURSEMENT',
          amount: 3000000,
          paid: false
        })
      ]
    });

    // Shortfall = 3M - 1M = 2M
    // Recommended = 2M * 1.1 = 2.2M
    const recommended = PaymentService.getRecommendedProvisionAmount(shipment);
    expect(recommended).toBe(2200000);
  });

  it('should return 0 when no provision needed', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 5000000, paid: true }),
        createMockExpense({
          category: 'Douane',
          type: 'DISBURSEMENT',
          amount: 2000000,
          paid: false
        })
      ]
    });

    const recommended = PaymentService.getRecommendedProvisionAmount(shipment);
    expect(recommended).toBe(0);
  });
});

// ============================================
// TESTS - FINANCIAL INTEGRITY
// ============================================

describe('PaymentService - validateFinancialIntegrity', () => {
  it('should detect negative provisions', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: -1000000, paid: true })
      ]
    });

    const issues = PaymentService.validateFinancialIntegrity(shipment);
    expect(issues).toContain('Provisions négatives détectées');
  });

  it('should detect disbursements exceeding provisions', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 1000000, paid: true }),
        createMockExpense({ type: 'DISBURSEMENT', amount: 3000000, paid: true })
      ]
    });

    const issues = PaymentService.validateFinancialIntegrity(shipment);
    expect(issues).toContain('Débours payés supérieurs aux provisions reçues');
  });

  it('should detect suspicious amounts', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ amount: 150_000_000 }) // > 100M threshold
      ]
    });

    const issues = PaymentService.validateFinancialIntegrity(shipment);
    expect(issues.some(issue => issue.includes('suspect'))).toBe(true);
  });

  it('should pass validation for healthy shipment', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 5000000, paid: true }),
        createMockExpense({ type: 'DISBURSEMENT', amount: 2000000, paid: true })
      ],
      documents: [
        { id: 'doc-1', name: 'BL', type: 'BL', status: 'Verified', uploadDate: new Date().toISOString() }
      ]
    });

    const issues = PaymentService.validateFinancialIntegrity(shipment);
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// TESTS - FORMATTING
// ============================================

describe('PaymentService - formatGNF', () => {
  it('should format amounts correctly', () => {
    // Note: Intl.NumberFormat peut utiliser des espaces insécables (\u202f)
    const formatted1 = PaymentService.formatGNF(1500000);
    const formatted2 = PaymentService.formatGNF(1000);
    const formatted3 = PaymentService.formatGNF(0);
    
    expect(formatted1).toContain('1');
    expect(formatted1).toContain('500');
    expect(formatted1).toContain('000');
    expect(formatted1).toContain('GNF');
    
    expect(formatted2).toContain('1');
    expect(formatted2).toContain('000');
    expect(formatted2).toContain('GNF');
    
    expect(formatted3).toContain('0 GNF');
  });

  it('should handle large numbers', () => {
    const formatted = PaymentService.formatGNF(123456789);
    expect(formatted).toContain('123');
    expect(formatted).toContain('GNF');
  });
});

// ============================================
// TESTS - FINANCIAL REPORT
// ============================================

describe('PaymentService - generateFinancialReport', () => {
  it('should generate complete report', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: 5000000, paid: true }),
        createMockExpense({
          category: 'Douane',
          type: 'DISBURSEMENT',
          amount: 2500000,
          paid: false
        })
      ]
    });

    const report = PaymentService.generateFinancialReport(shipment);

    expect(report).toContain('RAPPORT FINANCIER');
    expect(report).toContain('TR-TEST-001');
    expect(report).toContain('5');
    expect(report).toContain('000');
    expect(report).toContain('GNF');
    expect(report).toContain('LIQUIDATION EN ATTENTE');
  });

  it('should show anomalies in report', () => {
    const shipment = createMockShipment({
      expenses: [
        createMockExpense({ type: 'PROVISION', amount: -1000000, paid: true })
      ]
    });

    const report = PaymentService.generateFinancialReport(shipment);

    expect(report).toContain('ANOMALIES DÉTECTÉES');
    expect(report).toContain('négatives');
  });
});
