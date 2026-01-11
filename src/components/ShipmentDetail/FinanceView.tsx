/**
 * FINANCE VIEW - Gestion financière du dossier
 */

import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import DOMPurify from 'dompurify';
import { Shipment, Expense, Role } from '../../types';
import { Wallet, TrendingDown, TrendingUp, Banknote, Receipt, Plus, AlertTriangle } from 'lucide-react';
import { logger } from '../../services/logger';

// 💰 Montant maximum raisonnable (1 trillion GNF = ~$100M USD)
const MAX_AMOUNT = 1_000_000_000_000;

interface FinanceViewProps {
  shipment: Shipment;
  role: Role;
  canMakePayments: boolean;
  showFinanceInput: 'PROVISION' | 'DISBURSEMENT' | null;
  financeForm: { amount: string; description: string };
  paymentError: string | null;
  onShowFinanceInput: (type: 'PROVISION' | 'DISBURSEMENT' | null) => void;
  onUpdateFinanceForm: (updates: Partial<{ amount: string; description: string }>) => void;
  onAddExpense: (shipmentId: string, expense: Expense) => void;
  onPayLiquidation: (shipmentId: string) => Promise<{ success: boolean; message: string }>; // ✅ Async
  onOpenScanner: (type: 'RECEIPT', expenseId?: string) => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  shipment,
  role,
  canMakePayments,
  showFinanceInput,
  financeForm,
  paymentError,
  onShowFinanceInput,
  onUpdateFinanceForm,
  onAddExpense,
  onPayLiquidation,
  onOpenScanner,
}) => {
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);

  // Validation sécurisée des montants
  const validateAmount = (value: string): number | null => {
    const num = parseFloat(value);
    
    if (isNaN(num) || !isFinite(num)) return null;
    if (num <= 0) return null;
    if (num > MAX_AMOUNT) return null;
    
    return num;
  };

  // Calculs sécurisés avec protection overflow
  const calculateTotal = (expenses: Expense[], type: Expense['type']): number => {
    // ✅ Protection contre undefined/null
    if (!expenses || !Array.isArray(expenses)) {
      logger.warn('Expenses is not an array', { expenses });
      return 0;
    }
    
    const total = expenses
      .filter(e => e.type === type)
      .reduce((sum, e) => {
        if (!isFinite(e.amount) || isNaN(e.amount)) {
          logger.warn('Invalid expense amount detected', { expenseId: e.id, amount: e.amount });
          return sum;
        }
        return sum + e.amount;
      }, 0);
    
    if (!Number.isSafeInteger(total)) {
      logger.error('Total overflow detected', { type, total });
      return 0;
    }
    
    return total;
  };

  const totalProvision = calculateTotal(shipment.expenses || [], 'PROVISION');
  const totalDisbursement = calculateTotal(shipment.expenses || [], 'DISBURSEMENT');

  const balance = totalProvision - totalDisbursement - (shipment.liquidationAmount || 0);

  const handlePayment = async () => {
    if (!canMakePayments || isPaymentLoading) return;
    
    // ⚠️ TODO Sprint UX: Remplacer par toast confirmation non-bloquant
    // Bibliothèque recommandée: sonner ou react-hot-toast
    const confirmed = window.confirm(
      `Confirmer le paiement de la liquidation?\n\nMontant: ${shipment.liquidationAmount?.toLocaleString()} GNF`
    );
    
    if (!confirmed) return;
    
    setIsPaymentLoading(true);
    try {
      const res = await onPayLiquidation(shipment.id);
      if (res.success) {
        logger.info('Liquidation payment successful', { shipmentId: shipment.id });
      }
    } catch (error: any) {
      logger.error('Liquidation payment failed', error);
    } finally {
      setIsPaymentLoading(false);
    }
  };

  const handleAddExpense = (type: 'PROVISION' | 'DISBURSEMENT') => {
    const amount = validateAmount(financeForm.amount);
    
    if (!amount) {
      logger.warn('Invalid amount for expense', { amount: financeForm.amount });
      return;
    }
    
    const sanitizedDesc = DOMPurify.sanitize(financeForm.description.trim(), {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    
    if (sanitizedDesc.length === 0) {
      logger.warn('Empty description for expense');
      return;
    }

    // ✅ Construire un objet Expense complet
    const expense: Expense = {
      id: uuidv4(),
      description: sanitizedDesc,
      amount,
      type,
      paid: false,
      category: 'Autre',
      date: new Date().toISOString(),
      receiptUrl: undefined
    };

    onAddExpense(shipment.id, expense);
    onUpdateFinanceForm({ amount: '', description: '' });
    onShowFinanceInput(null);
  };

  return (
    <div className="space-y-4">
      {/* Financial Summary */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-xl">
        <h3 className="text-xs font-bold uppercase tracking-wider opacity-70 mb-4">
          Résumé Financier
        </h3>
        <div className="space-y-3">
          {/* Provision */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" />
              <span className="text-sm">Provision</span>
            </div>
            <span className="font-bold text-emerald-400">
              {totalProvision.toLocaleString()} GNF
            </span>
          </div>

          {/* Débours */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <TrendingDown size={16} className="text-orange-400" />
              <span className="text-sm">Débours</span>
            </div>
            <span className="font-bold text-orange-400">
              -{totalDisbursement.toLocaleString()} GNF
            </span>
          </div>

          {/* Liquidation */}
          {shipment.liquidationAmount && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Banknote size={16} className="text-red-400" />
                <span className="text-sm">Liquidation</span>
              </div>
              <span className="font-bold text-red-400">
                -{shipment.liquidationAmount.toLocaleString()} GNF
              </span>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-white/20 my-2"></div>

          {/* Balance */}
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold">Solde</span>
            <span
              className={`text-lg font-bold ${
                balance >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {balance.toLocaleString()} GNF
            </span>
          </div>
        </div>
      </div>

      {/* Negative Balance Alert */}
      {balance < 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2" role="alert">
          <AlertTriangle size={14} className="text-red-600 flex-shrink-0" aria-hidden="true" />
          <p className="text-xs text-red-700 font-medium">
            Attention: Solde négatif de {Math.abs(balance).toLocaleString()} GNF
          </p>
        </div>
      )}

      {/* Payment Error */}
      {paymentError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 font-medium">{paymentError}</p>
        </div>
      )}

      {/* Quick Actions */}
      {canMakePayments && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onShowFinanceInput('PROVISION')}
            className="bg-emerald-50 border-2 border-emerald-200 text-emerald-700 py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 hover:bg-emerald-100 transition-all"
            aria-label="Ajouter une provision au dossier"
          >
            <TrendingUp size={18} aria-hidden="true" />
            Provision
          </button>
          <button
            onClick={() => onShowFinanceInput('DISBURSEMENT')}
            className="bg-orange-50 border-2 border-orange-200 text-orange-700 py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 hover:bg-orange-100 transition-all"
            aria-label="Ajouter un débours au dossier"
          >
            <TrendingDown size={18} aria-hidden="true" />
            Débours
          </button>
        </div>
      )}

      {/* Finance Input Form */}
      {showFinanceInput && canMakePayments && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-lg">
          <h4 className="font-bold text-sm text-slate-800">
            {showFinanceInput === 'PROVISION' ? 'Ajouter Provision' : 'Ajouter Débours'}
          </h4>
          <div>
            <input
              type="number"
              placeholder="Montant (GNF)"
              value={financeForm.amount}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/[^0-9.]/g, '');
                onUpdateFinanceForm({ amount: sanitized });
              }}
              min="0"
              max={MAX_AMOUNT}
              step="1000"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              aria-label="Montant de la dépense en francs guinéens"
              aria-invalid={financeForm.amount && !validateAmount(financeForm.amount) ? 'true' : 'false'}
            />
            {financeForm.amount && !validateAmount(financeForm.amount) && (
              <p className="text-xs text-red-600 mt-1" role="alert">
                Montant invalide (doit être positif et inférieur à {MAX_AMOUNT.toLocaleString()} GNF)
              </p>
            )}
          </div>
          <input
            type="text"
            placeholder="Description"
            value={financeForm.description}
            onChange={(e) => {
              const sanitized = DOMPurify.sanitize(e.target.value, {
                ALLOWED_TAGS: [],
                KEEP_CONTENT: true
              });
              onUpdateFinanceForm({ description: sanitized });
            }}
            maxLength={200}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            aria-label="Description de la dépense"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleAddExpense(showFinanceInput)}
              disabled={!validateAmount(financeForm.amount) || !financeForm.description.trim()}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Enregistrer la dépense"
            >
              Enregistrer
            </button>
            <button
              onClick={() => onShowFinanceInput(null)}
              className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
              aria-label="Annuler l'ajout de dépense"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Liquidation Payment */}
      {shipment.liquidationAmount && !shipment.liquidationPaid && canMakePayments && (
        <button
          onClick={handlePayment}
          disabled={isPaymentLoading}
          className="w-full bg-red-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
          aria-label={`Payer la liquidation de ${shipment.liquidationAmount?.toLocaleString()} francs guinéens`}
        >
          {isPaymentLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
              Paiement en cours...
            </>
          ) : (
            <>
              <Wallet size={18} aria-hidden="true" />
              Payer Liquidation ({shipment.liquidationAmount.toLocaleString()} GNF)
            </>
          )}
        </button>
      )}

      {/* Expenses List */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Historique
        </h4>
        {(!shipment.expenses || shipment.expenses.length === 0) ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
            <Receipt size={32} className="mx-auto text-slate-300 mb-2" aria-hidden="true" />
            <p className="text-sm text-slate-400 font-medium">Aucune dépense</p>
          </div>
        ) : (
          <div role="list" aria-label="Liste des dépenses du dossier">
            {(shipment.expenses || []).map((expense) => (
              <div
                key={expense.id}
                role="listitem"
                className="bg-white border border-slate-100 rounded-xl p-3 hover:shadow-md transition-all"
                aria-label={`${expense.type === 'PROVISION' ? 'Provision' : 'Débours'} de ${expense.amount.toLocaleString()} francs guinéens, ${expense.description}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    {expense.type === 'PROVISION' ? (
                      <TrendingUp size={14} className="text-emerald-600" aria-hidden="true" />
                    ) : (
                      <TrendingDown size={14} className="text-orange-600" aria-hidden="true" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {expense.description}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(expense.date).toLocaleDateString('fr-FR', { timeZone: 'Africa/Conakry' })}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-bold text-sm ${
                      expense.type === 'PROVISION'
                        ? 'text-emerald-600'
                        : 'text-orange-600'
                    }`}
                  >
                    {expense.type === 'PROVISION' ? '+' : '-'}
                    {expense.amount.toLocaleString()}
                  </span>
                </div>
                {expense.receiptUrl && canMakePayments && (
                  <button
                    onClick={() => onOpenScanner('RECEIPT', expense.id)}
                    className="text-[10px] text-blue-600 hover:underline"
                    aria-label={`Voir le reçu de ${expense.description}`}
                  >
                    Voir reçu
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
