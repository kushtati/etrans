/**
 * DOCUMENTS VIEW - Gestion des documents du dossier
 */

import React from 'react';
import { Shipment, Document } from '../../types';
import { FileText, CheckCircle2, AlertCircle, Clock, Camera } from 'lucide-react';

interface DocumentsViewProps {
  shipment: Shipment;
  canEditOperations: boolean;
  onOpenScanner: (type: 'generic' | 'BAE' | 'TRUCK_PHOTO' | 'RECEIPT') => void;
}

const getDocIcon = (type: Document['type']) => {
  switch (type) {
    case 'DDI': return '📋';
    case 'BSC': return '🛃';
    case 'Quittance': return '💵';
    case 'BAE': return '✅';
    case 'BAD': return '📦';
    default: return '📄';
  }
};

const getDocStatus = (status: Document['status']) => {
  switch (status) {
    case 'Verified':
      return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Vérifié' };
    case 'Pending':
      return { icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', label: 'En attente' };
    case 'Rejected':
      return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Rejeté' };
  }
};

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  shipment,
  canEditOperations,
  onOpenScanner,
}) => {
  return (
    <div className="space-y-3">
      {/* Upload Button */}
      {canEditOperations && (
        <button
          onClick={() => onOpenScanner('generic')}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
          aria-label="Scanner un nouveau document"
        >
          <Camera size={18} aria-hidden="true" />
          Scanner Document
        </button>
      )}

      {/* Documents List */}
      <div className="space-y-2" role="list" aria-label="Liste des documents du dossier">
        {(!shipment.documents || shipment.documents.length === 0) ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
            <FileText size={32} className="mx-auto text-slate-300 mb-2" aria-hidden="true" />
            <p className="text-sm text-slate-600 font-medium mb-3">Aucun document</p>
            {canEditOperations && (
              <button
                onClick={() => onOpenScanner('generic')}
                className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                aria-label="Ajouter le premier document"
              >
                Ajouter le premier document
              </button>
            )}
          </div>
        ) : (
          (shipment.documents || []).map((doc) => {
            const statusInfo = getDocStatus(doc.status);
            const StatusIcon = statusInfo.icon;

            return (
              <div
                key={doc.id}
                role="listitem"
                className="bg-white border border-slate-100 rounded-xl p-4 hover:shadow-md transition-all"
                aria-label={`Document ${doc.name}, type ${doc.type}, statut ${statusInfo.label}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span role="img" aria-label={`Icône document ${doc.type}`} className="text-2xl">
                      {getDocIcon(doc.type)}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">{doc.name}</h4>
                      <p className="text-xs text-slate-500">{doc.type}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${statusInfo.bg}`}>
                    <StatusIcon size={12} className={statusInfo.color} aria-hidden="true" />
                    <span className={`text-[10px] font-bold ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">
                  Ajouté le {new Date(doc.uploadDate).toLocaleDateString('fr-FR', { timeZone: 'Africa/Conakry' })}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Document Types Guide */}
      <div className="bg-slate-50 rounded-xl p-4 mt-4">
        <h4 className="text-xs font-bold text-slate-700 mb-3">Types de Documents</h4>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="flex items-center gap-1">
            <span role="img" aria-label="DDI">📋</span>
            <span className="text-slate-600">DDI - Déclaration</span>
          </div>
          <div className="flex items-center gap-1">
            <span role="img" aria-label="BSC">🛃</span>
            <span className="text-slate-600">BSC - Bordereau</span>
          </div>
          <div className="flex items-center gap-1">
            <span role="img" aria-label="Quittance">💵</span>
            <span className="text-slate-600">Quittance</span>
          </div>
          <div className="flex items-center gap-1">
            <span role="img" aria-label="BAE">✅</span>
            <span className="text-slate-600">BAE - Bon à Enlever</span>
          </div>
          <div className="flex items-center gap-1">
            <span role="img" aria-label="BAD">📦</span>
            <span className="text-slate-600">BAD - Bon à Délivrer</span>
          </div>
          <div className="flex items-center gap-1">
            <span role="img" aria-label="Autre">📄</span>
            <span className="text-slate-600">Autre</span>
          </div>
        </div>
      </div>
    </div>
  );
};
