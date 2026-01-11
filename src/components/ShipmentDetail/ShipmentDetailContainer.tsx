/**
 * SHIPMENT DETAIL CONTAINER - Composant principal refactorisé
 * 
 * Architecture:
 * - Container pattern (logique)
 * - useReducer pour state management
 * - Composants présentationnels (Timeline, Documents, Finance)
 * - Séparation des responsabilités
 */

import React, { useReducer, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import DOMPurify from 'dompurify';
import { Role, ShipmentStatus, Document, Expense } from '../../types';
import { ArrowLeft, MessageCircle, PenLine, Save } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { logger } from '../../services/logger';
import { 
  useShipmentById, 
  useShipmentActions, 
  useAuth 
} from '../../hooks/useTransitSelectors';

import { DocumentScanner } from '../DocumentScanner';
import { TimelineView } from './TimelineView';
import { DocumentsView } from './DocumentsView';
import { FinanceView } from './FinanceView';
import {
  shipmentDetailReducer,
  createInitialState,
  ShipmentDetailState,
} from './shipmentDetailState';

interface Props {
  shipmentId: string;
  onBack: () => void;
}

export const ShipmentDetailContainer: React.FC<Props> = ({ shipmentId, onBack }) => {
  // ✅ OPTIMISÉ: Hooks sélecteurs pour re-renders minimaux
  const shipment = useShipmentById(shipmentId); // Re-render seulement si CE dossier change
  const { role } = useAuth(); // Re-render seulement si role change
  const {
    updateShipmentStatus,
    addDocument,
    setArrivalDate,
    setDeclarationDetails,
    payLiquidation,
    addExpense,
    updateShipmentDetails,
  } = useShipmentActions(); // JAMAIS de re-render (actions stables)

  // Sécurité & Permissions - Système centralisé
  const { canViewFinance, canMakePayments, canEditOperations } = usePermissions();

  // State Management avec useReducer
  const defaultTab = canViewFinance ? 'finance' : 'timeline';
  const [state, dispatch] = useReducer(
    shipmentDetailReducer,
    createInitialState(defaultTab)
  );

  // Edit mode (séparé car local au header)
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  // ✅ Early return si dossier introuvable
  if (!shipment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Dossier introuvable</p>
      </div>
    );
  }

  // ============================================
  // VALIDATION
  // ============================================

  const validateBLNumber = (value: string): boolean => {
    if (!value || value.trim().length === 0) return true; // Empty ok
    // Format standard BL: 5-20 caractères alphanumériques avec tirets
    return /^[A-Z0-9-]{5,20}$/i.test(value.trim());
  };

  const validateContainerNumber = (value: string): boolean => {
    if (!value || value.trim().length === 0) return true; // Empty ok
    // Format ISO 6346: 4 lettres + 7 chiffres (ex: MSCU1234567)
    return /^[A-Z]{4}\d{7}$/i.test(value.trim());
  };

  const sanitizeInput = (value: string): string => {
    return DOMPurify.sanitize(value.trim(), {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleWhatsAppShare = () => {
    // Sanitize all user-provided fields
    const sanitize = (str: string) => DOMPurify.sanitize(str, {
      ALLOWED_TAGS: [],
      KEEP_CONTENT: true
    });
    
    const message = `*TRANSIT GUINÉE* - Point Dossier\n\n📦 Ref: ${sanitize(shipment.trackingNumber)}\n🚢 BL: ${sanitize(shipment.blNumber)}\n📍 Statut: ${shipment.status}\n📅 ETA: ${shipment.eta}\n\nMerci de votre confiance.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleOpenScanner = (
    type: 'generic' | 'BAE' | 'TRUCK_PHOTO' | 'RECEIPT',
    expenseId?: string
  ) => {
    dispatch({ type: 'OPEN_SCANNER', payload: { type, expenseId } });
  };

  const handleScanResult = async (result: any) => {
    dispatch({ type: 'SET_ANALYSIS_RESULT', payload: result });

    let docType: Document['type'] = 'Autre';
    let docName = 'Document Scanné';

    if (state.scanContext.type === 'BAE') {
      docType = 'BAE';
      docName = 'Bon à Enlever (BAE)';
    } else if (state.scanContext.type === 'TRUCK_PHOTO') {
      docType = 'Photo Camion';
      docName = `Chargement ${state.deliveryForm.truckPlate || ''}`;
    } else if (state.scanContext.type === 'RECEIPT') {
      docType = 'Quittance';
      docName = `Reçu Paiement - ${state.scanContext.expenseId ? 'Dépense' : 'Douane'}`;
    } else {
      docType = ['DDI', 'BSC', 'Quittance', 'BAE', 'BAD'].includes(result.detectedType)
        ? result.detectedType
        : 'Autre';
      docName = result.detectedType ? `Scan ${result.detectedType}` : 'Document';
    }

    const newDoc: Document = {
      id: uuidv4(), // ✅ UUID pour éviter collisions
      name: sanitizeInput(docName),
      type: docType,
      status: 'Verified',
      uploadDate: new Date().toISOString(),
    };
    addDocument(shipmentId, newDoc);

    // Auto-trigger workflows
    if (docType === 'Quittance' && shipment.status === ShipmentStatus.CUSTOMS_LIQUIDATION) {
      const res = await payLiquidation(shipmentId); // ✅ Await async
      if (!res.success) {
        dispatch({ type: 'SET_PAYMENT_ERROR', payload: res.message });
      } else {
        dispatch({ type: 'SET_PAYMENT_ERROR', payload: null });
      }
    }

    if (docType === 'BAE' && shipment.status === ShipmentStatus.LIQUIDATION_PAID) {
      updateShipmentStatus(shipmentId, ShipmentStatus.BAE_GRANTED);
    }
  };

  const handlePayLiquidation = async (id: string) => {
    const res = await payLiquidation(id); // ✅ Await async
    if (!res.success) {
      dispatch({ type: 'SET_PAYMENT_ERROR', payload: res.message });
    } else {
      dispatch({ type: 'SET_PAYMENT_ERROR', payload: null });
    }
    return res;
  };

  const toggleEdit = async () => {
    if (isEditing && (editForm.blNumber || editForm.containerNumber)) {
      // Validation
      if (editForm.blNumber && !validateBLNumber(editForm.blNumber)) {
        dispatch({ type: 'SET_PAYMENT_ERROR', payload: 'Format BL invalide (5-20 caractères alphanumériques)' });
        setTimeout(() => dispatch({ type: 'SET_PAYMENT_ERROR', payload: null }), 10000); // 10s
        return;
      }
      
      if (editForm.containerNumber && !validateContainerNumber(editForm.containerNumber)) {
        dispatch({ type: 'SET_PAYMENT_ERROR', payload: 'Format Container invalide (4 lettres + 7 chiffres)' });
        setTimeout(() => dispatch({ type: 'SET_PAYMENT_ERROR', payload: null }), 10000); // 10s
        return;
      }
      
      // ⚠️ TODO Sprint UX: Remplacer par toast confirmation non-bloquant
      // Bibliothèque recommandée: sonner ou react-hot-toast
      // const confirmed = await showConfirmToast('Sauvegarder les modifications ?');
      const confirmed = window.confirm('Sauvegarder les modifications du dossier?');
      if (!confirmed) {
        setIsEditing(false);
        setEditForm({});
        return;
      }
      
      // Save with loading state
      setIsSaving(true);
      try {
        const sanitized = {
          blNumber: editForm.blNumber ? sanitizeInput(editForm.blNumber) : undefined,
          containerNumber: editForm.containerNumber ? sanitizeInput(editForm.containerNumber) : undefined
        };
        
        await updateShipmentDetails(shipmentId, sanitized);
        logger.info('Shipment details updated', { shipmentId, ...sanitized });
        setEditForm({});
      } catch (error: any) {
        dispatch({ type: 'SET_PAYMENT_ERROR', payload: 'Échec sauvegarde. Réessayez.' });
        logger.error('Failed to update shipment details', error);
        setTimeout(() => dispatch({ type: 'SET_PAYMENT_ERROR', payload: null }), 10000); // 10s
        setIsSaving(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditing(!isEditing);
  };

  // Tabs visibles
  const visibleTabs = ['timeline', 'docs'];
  if (canViewFinance) visibleTabs.push('finance');

  return (
    <div className="bg-[#f8fafc] min-h-screen animate-in slide-in-from-right duration-500">
      {/* Scanner Modal */}
      {state.showScanner && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scanner-title"
          onClick={(e) => {
            // Fermer modal si click sur backdrop (pas sur contenu)
            if (e.target === e.currentTarget) {
              dispatch({ type: 'CLOSE_SCANNER' });
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <h2 id="scanner-title" className="sr-only">Scanner de documents</h2>
            <DocumentScanner
              onScanComplete={handleScanResult}
              onClose={() => dispatch({ type: 'CLOSE_SCANNER' })}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#0f172a] text-white p-2 sticky top-0 z-20 shadow-xl shadow-slate-900/20 rounded-b-[2rem]">
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={onBack}
            className="p-1 bg-white/10 rounded hover:bg-white/20 backdrop-blur-md transition-all"
            aria-label="Retour à la liste des dossiers"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-xs font-bold tracking-widest uppercase opacity-70">
            Détail Dossier
          </h1>
          <button
            onClick={handleWhatsAppShare}
            className="p-1 bg-emerald-500/80 rounded text-white hover:bg-emerald-400 transition-all"
            aria-label="Partager le dossier via WhatsApp"
          >
            <MessageCircle size={14} />
          </button>
        </div>

        <div className="mb-1">
          <div className="flex items-center gap-1 mb-1">
            <span className="bg-blue-600 px-1 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider">
              {shipment.customsRegime}
            </span>
            <span className="bg-slate-700 px-1 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider text-slate-300">
              {shipment.commodityType}
            </span>
          </div>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-base font-bold tracking-tight mb-0">
                {shipment.trackingNumber}
              </h2>
              <p className="text-slate-400 text-xs font-medium">{shipment.clientName}</p>
            </div>
            {/* Edit Button */}
            {canEditOperations && (
              <button
                onClick={toggleEdit}
                disabled={isSaving}
                className="p-0.5 rounded-full hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label={isEditing ? 'Sauvegarder les modifications' : 'Modifier le dossier'}
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : isEditing ? (
                  <Save size={14} className="text-emerald-400" />
                ) : (
                  <PenLine size={14} className="text-slate-400" />
                )}
              </button>
            )}
          </div>

          {/* Editable Fields */}
          {isEditing && (
            <div className="mt-4 bg-white/10 p-4 rounded-xl space-y-3">
              <div>
                <input
                  value={editForm.blNumber || shipment.blNumber}
                  onChange={(e) => {
                    const sanitized = sanitizeInput(e.target.value);
                    setEditForm({ ...editForm, blNumber: sanitized });
                  }}
                  placeholder="BL Number (ex: ABCD123456)"
                  className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600 text-sm"
                  aria-label="Numéro de connaissement (BL)"
                  aria-invalid={editForm.blNumber && !validateBLNumber(editForm.blNumber) ? 'true' : 'false'}
                />
                {editForm.blNumber && !validateBLNumber(editForm.blNumber) && (
                  <p className="text-xs text-red-400 mt-1" role="alert">Format invalide (5-20 caractères)</p>
                )}
              </div>
              <div>
                <input
                  value={editForm.containerNumber || shipment.containerNumber}
                  onChange={(e) => {
                    const sanitized = sanitizeInput(e.target.value.toUpperCase());
                    setEditForm({ ...editForm, containerNumber: sanitized });
                  }}
                  placeholder="Container Number (ex: MSCU1234567)"
                  className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600 text-sm"
                  aria-label="Numéro de conteneur"
                  aria-invalid={editForm.containerNumber && !validateContainerNumber(editForm.containerNumber) ? 'true' : 'false'}
                />
                {editForm.containerNumber && !validateContainerNumber(editForm.containerNumber) && (
                  <p className="text-xs text-red-400 mt-1" role="alert">Format invalide (4 lettres + 7 chiffres)</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 -mt-6 sticky top-28 z-10">
        <div 
          className="bg-white p-1.5 rounded-2xl shadow-lg shadow-slate-200/50 flex justify-between border border-slate-100"
          role="tablist"
          aria-label="Navigation du dossier"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() =>
                dispatch({ type: 'SET_ACTIVE_TAB', payload: tab as any })
              }
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  dispatch({ type: 'SET_ACTIVE_TAB', payload: tab as any });
                }
              }}
              role="tab"
              aria-selected={state.activeTab === tab}
              aria-controls={`${tab}-panel`}
              tabIndex={state.activeTab === tab ? 0 : -1}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-300 ${
                state.activeTab === tab
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              {tab === 'timeline' ? 'Suivi' : tab === 'docs' ? 'Docs' : 'Compta'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-32 space-y-4 pt-32">
        {state.activeTab === 'timeline' && (
          <div id="timeline-panel" role="tabpanel" aria-labelledby="timeline-tab">
            <TimelineView
            shipment={shipment}
            role={role}
            canEditOperations={canEditOperations}
            onOpenScanner={handleOpenScanner}
            onUpdateStatus={updateShipmentStatus}
            onSetArrivalDate={setArrivalDate}
            onSetDeclaration={setDeclarationDetails}
            deliveryForm={state.deliveryForm}
            onUpdateDeliveryForm={(updates) =>
              dispatch({ type: 'UPDATE_DELIVERY_FORM', payload: updates })
            }
            declForm={state.declForm}
            onUpdateDeclForm={(updates) =>
              dispatch({ type: 'UPDATE_DECL_FORM', payload: updates })
            }
          />
          </div>
        )}

        {state.activeTab === 'docs' && (
          <div id="docs-panel" role="tabpanel" aria-labelledby="docs-tab">
            <DocumentsView
              shipment={shipment}
              canEditOperations={canEditOperations}
              onOpenScanner={handleOpenScanner}
            />
          </div>
        )}

        {state.activeTab === 'finance' && canViewFinance && (
          <div id="finance-panel" role="tabpanel" aria-labelledby="finance-tab">
            <FinanceView
              shipment={shipment}
              role={role}
              canMakePayments={canMakePayments}
              showFinanceInput={state.showFinanceInput}
              financeForm={state.financeForm}
              paymentError={state.paymentError}
              onShowFinanceInput={(type) =>
                dispatch({ type: 'SHOW_FINANCE_INPUT', payload: type })
              }
              onUpdateFinanceForm={(updates) =>
                dispatch({ type: 'UPDATE_FINANCE_FORM', payload: updates })
              }
              onAddExpense={addExpense}
              onPayLiquidation={handlePayLiquidation}
              onOpenScanner={handleOpenScanner}
            />
          </div>
        )}
      </div>

      {/* Error Notification */}
      {state.paymentError && (
        <div 
          className="fixed bottom-20 left-4 right-4 bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg z-50 animate-in slide-in-from-bottom"
          role="alert"
        >
          <p className="text-sm text-red-700 font-medium">{state.paymentError}</p>
          <button 
            onClick={() => dispatch({ type: 'SET_PAYMENT_ERROR', payload: null })}
            className="text-xs text-red-600 underline mt-1 hover:text-red-800"
            aria-label="Fermer le message d'erreur"
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  );
};
