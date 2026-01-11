/**
 * PAYMENT SERVICE - Logique Métier Financière
 * 
 * Gère les calculs et validations financières pour les dossiers transit.
 * Séparation claire de la logique métier et de la couche UI.
 * 
 * Architecture:
 * - Méthodes statiques pures (testables isolément)
 * - Pas de dépendances sur React/Context
 * - Types forts pour garantir la cohérence
 */

import { Shipment, Expense } from '../types';
import { logger } from './logger';

// ============================================
// TYPES
// ============================================

export interface PaymentResult {
  success: boolean;
  message?: string;
  requiredAmount?: number;
  currentBalance?: number;
}

export interface BalanceDetails {
  provisions: number;
  paidProvisions: number;
  disbursements: number;
  paidDisbursements: number;
  fees: number;
  balance: number;
}

// ============================================
// PAYMENT SERVICE
// ============================================

export class PaymentService {
  /**
   * Vérifie si une liquidation peut être payée
   * 
   * @param shipment - Dossier à vérifier
   * @returns Résultat avec détails du paiement
   * 
   * Règles métier:
   * 1. Une liquidation en attente doit exister
   * 2. Le solde provisions - débours doit être >= montant liquidation
   * 3. Seules les provisions PAYÉES sont comptabilisées
   * 4. Anti-fraude: Vérifier que le montant n'a pas été modifié
   */
  static canPayLiquidation(shipment: Shipment): PaymentResult {
    // 1. Trouver liquidation en attente
    const liquidation = this.findPendingLiquidation(shipment);
    
    if (!liquidation) {
      return {
        success: false,
        message: 'Aucune liquidation en attente trouvée.'
      };
    }

    // 1.5. Anti-fraude: Vérifier montant non modifié
    const fraudCheck = this.validateLiquidationAmount(shipment, liquidation);
    if (!fraudCheck.valid) {
      logger.error('Fraude détectée: montant liquidation modifié', fraudCheck);
      return {
        success: false,
        message: `Anomalie détectée: ${fraudCheck.reason}`
      };
    }

    // 2. Calculer solde disponible
    const balance = this.calculateBalance(shipment);

    // 3. Vérifier suffisance des fonds
    if (balance.balance < liquidation.amount) {
      const shortfall = liquidation.amount - balance.balance;
      
      return {
        success: false,
        message: `Solde insuffisant: ${this.formatGNF(balance.balance)} disponible, ${this.formatGNF(liquidation.amount)} requis.`,
        requiredAmount: shortfall,
        currentBalance: balance.balance
      };
    }

    // 4. Paiement autorisé
    return {
      success: true,
      message: 'Paiement autorisé.',
      currentBalance: balance.balance
    };
  }

  /**
   * Trouve la liquidation douane en attente
   * 
   * @param shipment - Dossier
   * @returns Liquidation non payée ou undefined
   */
  static findPendingLiquidation(shipment: Shipment): Expense | undefined {
    return shipment.expenses
      .filter(e => e.category === 'Douane' && e.type === 'DISBURSEMENT' && !e.paid)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
  }

  /**
   * Valide que le montant de liquidation n'a pas été modifié (anti-fraude)
   * 
   * @param shipment - Dossier
   * @param liquidation - Liquidation à vérifier
   * @returns Résultat validation avec raison si invalide
   */
  static validateLiquidationAmount(
    shipment: Shipment,
    liquidation: Expense
  ): { valid: boolean; reason?: string } {
    // TODO: Implémenter calcul attendu des droits de douane
    // const expected = calculateExpectedDuties(shipment);
    // if (Math.abs(liquidation.amount - expected) > 1000) {
    //   return { valid: false, reason: `Montant attendu ${expected}, reçu ${liquidation.amount}` };
    // }
    
    // Validation basique: montant raisonnable
    const suspiciousThreshold = Number(process.env.VITE_SUSPICIOUS_THRESHOLD) || 100_000_000;
    if (liquidation.amount > suspiciousThreshold) {
      return { 
        valid: false, 
        reason: `Montant suspect: ${this.formatGNF(liquidation.amount)}` 
      };
    }
    
    if (liquidation.amount <= 0) {
      return { 
        valid: false, 
        reason: 'Montant négatif ou nul' 
      };
    }
    
    return { valid: true };
  }

  /**
   * Calcule le solde financier d'un dossier
   * 
   * Formule:
   * Balance = Provisions payées - Débours payés
   * 
   * @param shipment - Dossier
   * @returns Détails complets du solde
   */
  static calculateBalance(shipment: Shipment): BalanceDetails {
    const provisions = shipment.expenses
      .filter(e => e.type === 'PROVISION')
      .reduce((sum, e) => sum + e.amount, 0);

    const paidProvisions = shipment.expenses
      .filter(e => e.type === 'PROVISION' && e.paid)
      .reduce((sum, e) => sum + e.amount, 0);

    const disbursements = shipment.expenses
      .filter(e => e.type === 'DISBURSEMENT')
      .reduce((sum, e) => sum + e.amount, 0);

    const paidDisbursements = shipment.expenses
      .filter(e => e.type === 'DISBURSEMENT' && e.paid)
      .reduce((sum, e) => sum + e.amount, 0);

    const fees = shipment.expenses
      .filter(e => e.type === 'FEE')
      .reduce((sum, e) => sum + e.amount, 0);

    // ✅ Balance = Provisions reçues - Débours payés
    const balance = paidProvisions - paidDisbursements;

    return {
      provisions,
      paidProvisions,
      disbursements,
      paidDisbursements,
      fees,
      balance
    };
  }

  /**
   * Calcule le solde net après paiement d'une liquidation
   * 
   * @param shipment - Dossier
   * @returns Solde après paiement ou null si impossible
   */
  static calculateBalanceAfterPayment(shipment: Shipment): number | null {
    const liquidation = this.findPendingLiquidation(shipment);
    if (!liquidation) return null;

    const current = this.calculateBalance(shipment);
    return current.balance - liquidation.amount;
  }

  /**
   * Vérifie si une provision est requise
   * 
   * @param shipment - Dossier
   * @returns true si provision nécessaire
   */
  static isProvisionRequired(shipment: Shipment): boolean {
    const check = this.canPayLiquidation(shipment);
    return !check.success && check.requiredAmount !== undefined && check.requiredAmount > 0;
  }

  /**
   * Calcule le montant de provision recommandé
   * 
   * Inclut une marge de sécurité de 10%
   * 
   * @param shipment - Dossier
   * @returns Montant recommandé ou 0
   */
  static getRecommendedProvisionAmount(shipment: Shipment): number {
    const check = this.canPayLiquidation(shipment);
    
    if (!check.requiredAmount) return 0;
    
    // Ajouter 10% de marge de sécurité
    return Math.ceil(check.requiredAmount * 1.1);
  }

  /**
   * Vérifie la cohérence financière d'un dossier
   * 
   * @param shipment - Dossier
   * @returns Liste des anomalies détectées
   */
  static validateFinancialIntegrity(shipment: Shipment): string[] {
    const issues: string[] = [];
    const balance = this.calculateBalance(shipment);

    // 1. Vérifier provisions négatives
    if (balance.provisions < 0) {
      issues.push('Provisions négatives détectées');
    }

    // 2. Vérifier débours > provisions
    if (balance.paidDisbursements > balance.paidProvisions) {
      issues.push('Débours payés supérieurs aux provisions reçues');
    }

    // 3. Vérifier montants suspects (> 100M GNF)
    const suspiciousThreshold = 100_000_000;
    const hasSuspicious = shipment.expenses.some(e => e.amount > suspiciousThreshold);
    
    if (hasSuspicious) {
      issues.push(`Montant suspect détecté (> ${this.formatGNF(suspiciousThreshold)})`);
    }

    // 4. Vérifier liquidation sans BL
    const hasLiquidation = this.findPendingLiquidation(shipment);
    const hasBL = shipment.documents.some(d => d.type === 'BL' && d.status === 'Verified');
    
    if (hasLiquidation && !hasBL) {
      issues.push('Liquidation sans BL vérifié');
    }

    return issues;
  }

  /**
   * Formate un montant en Francs Guinéens
   * 
   * @param amount - Montant en GNF
   * @returns Montant formaté avec devise
   * 
   * @example
   * formatGNF(1500000) // "1 500 000 GNF"
   */
  static formatGNF(amount: number): string {
    return new Intl.NumberFormat('fr-GN', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount) + ' GNF';
  }

  /**
   * Génère un rapport financier détaillé
   * 
   * @param shipment - Dossier
   * @returns Rapport formaté pour affichage
   */
  static generateFinancialReport(shipment: Shipment): string {
    const balance = this.calculateBalance(shipment);
    const liquidation = this.findPendingLiquidation(shipment);
    const issues = this.validateFinancialIntegrity(shipment);

    let report = `📊 RAPPORT FINANCIER - ${shipment.trackingNumber}\n`;
    report += `${'='.repeat(60)}\n\n`;

    report += `💰 PROVISIONS:\n`;
    report += `   Total: ${this.formatGNF(balance.provisions)}\n`;
    report += `   Payées: ${this.formatGNF(balance.paidProvisions)}\n\n`;

    report += `📤 DÉBOURS:\n`;
    report += `   Total: ${this.formatGNF(balance.disbursements)}\n`;
    report += `   Payés: ${this.formatGNF(balance.paidDisbursements)}\n\n`;

    report += `💵 HONORAIRES:\n`;
    report += `   Total: ${this.formatGNF(balance.fees)}\n\n`;

    report += `💎 SOLDE DISPONIBLE: ${this.formatGNF(balance.balance)}\n\n`;

    if (liquidation) {
      report += `⚖️  LIQUIDATION EN ATTENTE:\n`;
      report += `   Montant: ${this.formatGNF(liquidation.amount)}\n`;
      report += `   Description: ${liquidation.description}\n\n`;

      const canPay = this.canPayLiquidation(shipment);
      report += `   Statut: ${canPay.success ? '✅ Payable' : '❌ Fonds insuffisants'}\n`;
      
      if (canPay.requiredAmount) {
        report += `   Manque: ${this.formatGNF(canPay.requiredAmount)}\n`;
      }
    }

    if (issues.length > 0) {
      report += `\n⚠️  ANOMALIES DÉTECTÉES:\n`;
      issues.forEach(issue => report += `   - ${issue}\n`);
    }

    return report;
  }

  /**
   * Log les détails d'un paiement
   * 
   * @param shipment - Dossier
   * @param success - Succès du paiement
   */
  static logPaymentAttempt(shipment: Shipment, success: boolean): void {
    const balance = this.calculateBalance(shipment);
    const liquidation = this.findPendingLiquidation(shipment);

    if (success) {
      logger.audit('Paiement Liquidation Validé', {
        shipmentId: shipment.id,
        tracking: shipment.trackingNumber,
        amount: liquidation?.amount,
        balanceBefore: balance.balance,
        balanceAfter: liquidation ? balance.balance - liquidation.amount : balance.balance
      });
    } else {
      logger.warn('Paiement Liquidation Refusé', {
        shipmentId: shipment.id,
        tracking: shipment.trackingNumber,
        balance: balance.balance,
        required: liquidation?.amount,
        shortfall: liquidation ? liquidation.amount - balance.balance : 0
      });
    }
  }
}
