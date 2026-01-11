/**
 * TIMELINE VIEW - Affichage chronologique du dossier
 */

import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { Shipment, ShipmentStatus, Role } from '../../types';
import { FileText, CheckCircle2, Ship, Container, Truck, PackageCheck, Banknote } from 'lucide-react';

interface TimelineViewProps {
  shipment: Shipment;
  role: Role;
  canEditOperations: boolean;
  onOpenScanner: (type: 'generic' | 'BAE' | 'TRUCK_PHOTO' | 'RECEIPT', expenseId?: string) => void;
  onUpdateStatus: (shipmentId: string, status: ShipmentStatus) => void;
  onSetArrivalDate: (shipmentId: string, date: string) => void;
  onSetDeclaration: (shipmentId: string, number: string, amount: string) => void;
  deliveryForm: { driverName: string; truckPlate: string; recipientName: string };
  onUpdateDeliveryForm: (updates: Partial<{ driverName: string; truckPlate: string; recipientName: string }>) => void;
  declForm: { number: string; amount: string };
  onUpdateDeclForm: (updates: Partial<{ number: string; amount: string }>) => void;
}

const TimelineStep = React.memo<{
  title: string;
  status: 'completed' | 'current' | 'pending';
  icon: any;
  isLast?: boolean;
  children: React.ReactNode;
}>(({ title, status, icon: Icon, isLast, children }) => (
  <div className={`relative pl-8 pb-8 ${!isLast ? 'border-l-2' : ''} ${status === 'completed' ? 'border-emerald-500' : status === 'current' ? 'border-blue-600' : 'border-slate-200'}`}>
    <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 transition-all duration-300 ${status === 'completed' ? 'bg-emerald-500 border-emerald-500' : status === 'current' ? 'bg-white border-blue-600 scale-125' : 'bg-slate-100 border-slate-300'}`}></div>
    <div className={`transition-all duration-300 ${status === 'pending' ? 'opacity-60 grayscale' : 'opacity-100'}`}>
      <h4 className={`font-bold text-sm flex items-center gap-2 mb-2 ${status === 'current' ? 'text-blue-600' : status === 'completed' ? 'text-emerald-700' : 'text-slate-700'}`}>
        {Icon && <Icon size={16} />} {title}
        {status === 'completed' && <CheckCircle2 size={14} className="text-emerald-500 ml-auto" />}
        {status === 'pending' && <span className="ml-auto text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-400 font-medium">À venir</span>}
      </h4>
      <div>{children}</div>
    </div>
  </div>
));

export const TimelineView: React.FC<TimelineViewProps> = ({
  shipment,
  role,
  canEditOperations,
  onOpenScanner,
  onUpdateStatus,
  onSetArrivalDate,
  onSetDeclaration,
  deliveryForm,
  onUpdateDeliveryForm,
  declForm,
  onUpdateDeclForm,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sanitization
  const sanitizeInput = (value: string): string => {
    return DOMPurify.sanitize(value.trim(), {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  };

  // Validation formats
  const validateAmount = (value: string): boolean => {
    const num = parseFloat(value);
    return !isNaN(num) && isFinite(num) && num > 0 && num < 1_000_000_000_000;
  };

  const validateDDI = (value: string): boolean => {
    // Format: 3-20 caractères alphanumériques avec /,-
    return /^[A-Z0-9/-]{3,20}$/i.test(value);
  };

  const validatePlate = (value: string): boolean => {
    // Format Guinée: AB-1234-GN ou variations
    return /^[A-Z]{2}-?\d{4}-?[A-Z]{2}$/i.test(value);
  };

  // Handlers avec confirmation
  const handleStartPreClearance = () => {
    const confirmed = window.confirm('Démarrer le pré-dédouanement de ce dossier?');
    if (confirmed) {
      onUpdateStatus(shipment.id, ShipmentStatus.PRE_CLEARANCE);
    }
  };

  const handleSubmitDeclaration = async () => {
    if (!validateDDI(declForm.number)) {
      alert('Format DDI invalide (3-20 caractères alphanumériques)');
      return;
    }
    if (!validateAmount(declForm.amount)) {
      alert('Montant invalide (doit être positif et inférieur à 1 trillion GNF)');
      return;
    }
    
    const confirmed = window.confirm(
      `Enregistrer la déclaration?\n\nDDI: ${declForm.number}\nMontant: ${declForm.amount} GNF`
    );
    
    if (!confirmed) return;
    
    setIsSubmitting(true);
    try {
      await onSetDeclaration(shipment.id, declForm.number, declForm.amount);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelivery = () => {
    if (!deliveryForm.driverName || !deliveryForm.truckPlate || !deliveryForm.recipientName) {
      alert('Veuillez remplir tous les champs de livraison');
      return;
    }
    
    if (!validatePlate(deliveryForm.truckPlate)) {
      alert('Format plaque invalide (ex: AB-1234-GN)');
      return;
    }
    
    const confirmed = window.confirm(
      `Confirmer la livraison?\n\nChauffeur: ${deliveryForm.driverName}\nPlaque: ${deliveryForm.truckPlate}\nDestinataire: ${deliveryForm.recipientName}`
    );
    
    if (confirmed) {
      onUpdateStatus(shipment.id, ShipmentStatus.DELIVERED);
    }
  };

  const statusOrder = [
    ShipmentStatus.OPENED,
    ShipmentStatus.PRE_CLEARANCE,
    ShipmentStatus.CUSTOMS_LIQUIDATION,
    ShipmentStatus.LIQUIDATION_PAID,
    ShipmentStatus.BAE_GRANTED,
    ShipmentStatus.PORT_EXIT,
    ShipmentStatus.DELIVERED,
  ];

  const currentStatusIndex = statusOrder.indexOf(shipment.status);

  const getStepStatus = (stepIndex: number): 'completed' | 'current' | 'pending' => {
    if (stepIndex < currentStatusIndex) return 'completed';
    if (stepIndex === currentStatusIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="mt-0 pl-2">
      {/* 1. INITIALISATION */}
      <TimelineStep 
        title="Ouverture & Documents" 
        status={getStepStatus(0)} 
        icon={FileText}
      >
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-500 mb-2">BL: <span className="font-mono font-bold text-slate-700">{shipment.blNumber}</span></p>
          {currentStatusIndex === 0 && canEditOperations && (
            <button 
              onClick={handleStartPreClearance}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-bold"
              aria-label="Démarrer le pré-dédouanement du dossier"
            >
              Démarrer Pré-Dédouanement
            </button>
          )}
        </div>
      </TimelineStep>

      {/* 2. ARRIVÉE */}
      <TimelineStep 
        title="Arrivée Marchandises" 
        status={getStepStatus(1)} 
        icon={Ship}
      >
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          {shipment.arrivalDate ? (
            <p className="text-xs text-slate-600">✅ Arrivé le {new Date(shipment.arrivalDate).toLocaleDateString('fr-FR', { timeZone: 'Africa/Conakry' })}</p>
          ) : (
            currentStatusIndex === 1 && canEditOperations && (
              <input 
                type="date" 
                onChange={(e) => onSetArrivalDate(shipment.id, e.target.value)} 
                min="2020-01-01"
                max={new Date().toISOString().split('T')[0]}
                className="text-xs border px-2 py-1 rounded"
                aria-label="Date d'arrivée de la marchandise"
              />
            )
          )}
        </div>
      </TimelineStep>

      {/* 3. DÉCLARATION */}
      <TimelineStep 
        title="Déclaration en Douane" 
        status={getStepStatus(2)} 
        icon={Container}
      >
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm space-y-2">
          {shipment.declarationNumber ? (
            <p className="text-xs">📋 DDI: <strong>{shipment.declarationNumber}</strong></p>
          ) : (
            currentStatusIndex === 2 && canEditOperations && (
              <>
                <div>
                  <input 
                    placeholder="N° Déclaration (ex: DDI123/2026)" 
                    value={declForm.number}
                    onChange={(e) => {
                      const sanitized = sanitizeInput(e.target.value.toUpperCase());
                      onUpdateDeclForm({ number: sanitized });
                    }}
                    className="w-full text-xs border px-2 py-1 rounded"
                    aria-label="Numéro de déclaration douanière"
                    aria-invalid={declForm.number && !validateDDI(declForm.number) ? 'true' : 'false'}
                  />
                  {declForm.number && !validateDDI(declForm.number) && (
                    <p className="text-xs text-red-600 mt-1" role="alert">Format invalide</p>
                  )}
                </div>
                <div>
                  <input 
                    type="number"
                    placeholder="Montant (GNF)" 
                    value={declForm.amount}
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/[^0-9.]/g, '');
                      onUpdateDeclForm({ amount: sanitized });
                    }}
                    min="0"
                    className="w-full text-xs border px-2 py-1 rounded"
                    aria-label="Montant de la liquidation en francs guinéens"
                    aria-invalid={declForm.amount && !validateAmount(declForm.amount) ? 'true' : 'false'}
                  />
                  {declForm.amount && !validateAmount(declForm.amount) && (
                    <p className="text-xs text-red-600 mt-1" role="alert">Montant invalide</p>
                  )}
                </div>
                <button 
                  onClick={handleSubmitDeclaration}
                  disabled={isSubmitting || !declForm.number || !declForm.amount}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-bold w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Enregistrer la déclaration douanière"
                >
                  {isSubmitting ? 'Enregistrement...' : 'Enregistrer Déclaration'}
                </button>
              </>
            )
          )}
        </div>
      </TimelineStep>

      {/* 4. LIQUIDATION */}
      <TimelineStep 
        title="Liquidation Douane" 
        status={getStepStatus(3)} 
        icon={Banknote}
      >
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          {shipment.liquidationAmount ? (
            <p className="text-xs font-bold text-orange-600">{shipment.liquidationAmount.toLocaleString()} GNF</p>
          ) : (
            <p className="text-xs text-slate-400">En attente liquidation...</p>
          )}
        </div>
      </TimelineStep>

      {/* 5. PAIEMENT */}
      <TimelineStep 
        title="Paiement Liquidation" 
        status={getStepStatus(4)} 
        icon={CheckCircle2}
      >
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          {currentStatusIndex === 4 && canEditOperations && (
            <button 
              onClick={() => onOpenScanner('RECEIPT')}
              className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 font-bold"
              aria-label="Scanner la quittance de paiement"
            >
              Scanner Quittance
            </button>
          )}
        </div>
      </TimelineStep>

      {/* 6. BAE */}
      <TimelineStep 
        title="Bon à Enlever (BAE)" 
        status={getStepStatus(5)} 
        icon={PackageCheck}
      >
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          {currentStatusIndex === 5 && canEditOperations && (
            <button 
              onClick={() => onOpenScanner('BAE')}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-bold"
              aria-label="Scanner le Bon à Enlever"
            >
              Scanner BAE
            </button>
          )}
        </div>
      </TimelineStep>

      {/* 7. LIVRAISON */}
      <TimelineStep 
        title="Livraison Client" 
        status={getStepStatus(6)} 
        icon={Truck}
        isLast
      >
        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm space-y-2">
          {currentStatusIndex === 6 && canEditOperations ? (
            <>
              <input 
                placeholder="Nom du chauffeur" 
                value={deliveryForm.driverName}
                onChange={(e) => {
                  const sanitized = sanitizeInput(e.target.value);
                  onUpdateDeliveryForm({ driverName: sanitized });
                }}
                className="w-full text-xs border px-2 py-1 rounded"
                aria-label="Nom du chauffeur"
              />
              <div>
                <input 
                  placeholder="Plaque camion (ex: AB-1234-GN)" 
                  value={deliveryForm.truckPlate}
                  onChange={(e) => {
                    const sanitized = sanitizeInput(e.target.value.toUpperCase());
                    onUpdateDeliveryForm({ truckPlate: sanitized });
                  }}
                  className="w-full text-xs border px-2 py-1 rounded"
                  aria-label="Plaque d'immatriculation du camion"
                  aria-invalid={deliveryForm.truckPlate && !validatePlate(deliveryForm.truckPlate) ? 'true' : 'false'}
                />
                {deliveryForm.truckPlate && !validatePlate(deliveryForm.truckPlate) && (
                  <p className="text-xs text-red-600 mt-1" role="alert">Format invalide (ex: AB-1234-GN)</p>
                )}
              </div>
              <input 
                placeholder="Nom du destinataire" 
                value={deliveryForm.recipientName}
                onChange={(e) => {
                  const sanitized = sanitizeInput(e.target.value);
                  onUpdateDeliveryForm({ recipientName: sanitized });
                }}
                className="w-full text-xs border px-2 py-1 rounded"
                aria-label="Nom du destinataire"
              />
              <button 
                onClick={handleConfirmDelivery}
                disabled={!deliveryForm.driverName || !deliveryForm.truckPlate || !deliveryForm.recipientName}
                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 font-bold w-full disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Confirmer la livraison au destinataire"
              >
                Confirmer Livraison
              </button>
            </>
          ) : shipment.status === ShipmentStatus.DELIVERED ? (
            <p className="text-xs text-emerald-600 font-bold">✅ Livré</p>
          ) : null}
        </div>
      </TimelineStep>
    </div>
  );
};
