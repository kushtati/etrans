import React, { useRef } from 'react';
import DOMPurify from 'dompurify';
import { CheckCircle2, ArrowLeft, PenLine, Save, MessageCircle } from 'lucide-react';
import { Shipment, Role } from '../../types';

interface ShipmentHeaderProps {
  shipment: Shipment;
  role: Role;
  isEditing: boolean;
  onBack: () => void;
  onToggleEdit: () => void;
  onShare: () => void;
  editForm: Partial<Shipment>;
  onEditChange: (field: string, value: string) => void;
}

/**
 * ShipmentHeader: Immersive header section with tracking number, client name, and edit mode
 * Extracted from ShipmentDetail for better modularity
 */
export const ShipmentHeader: React.FC<ShipmentHeaderProps> = ({
  shipment,
  role,
  isEditing,
  onBack,
  onToggleEdit,
  onShare,
  editForm,
  onEditChange
}) => {
  const lastShareTime = useRef(0);

  // Sanitization
  const sanitizeInput = (value: string): string => {
    return DOMPurify.sanitize(value.trim(), {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  };

  // Validation formats
  const validateBL = (value: string): boolean => {
    // Format BL international: 4 lettres + 9 chiffres (ex: MAEU123456789)
    return /^[A-Z]{4}\d{9}$/i.test(value);
  };

  const validateContainer = (value: string): boolean => {
    // Format ISO 6346: 4 lettres + 7 chiffres (ex: MSCU1234567)
    return /^[A-Z]{4}\d{7}$/i.test(value);
  };

  // Handler avec confirmation
  const handleSaveClick = () => {
    if (editForm.blNumber && !validateBL(editForm.blNumber)) {
      alert('Format BL invalide (4 lettres + 9 chiffres, ex: MAEU123456789)');
      return;
    }
    if (editForm.containerNumber && !validateContainer(editForm.containerNumber)) {
      alert('Format Container invalide (4 lettres + 7 chiffres, ex: MSCU1234567)');
      return;
    }

    const confirmed = window.confirm('Sauvegarder les modifications du dossier?');
    if (confirmed) {
      onToggleEdit();
    }
  };

  // Rate limiting share (3s)
  const handleShare = () => {
    const now = Date.now();
    if (now - lastShareTime.current < 3000) {
      return; // Throttle
    }
    lastShareTime.current = now;
    onShare();
  };

  // Keyboard navigation
  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="bg-[#0f172a] text-white p-6 pt-safe-top sticky top-0 z-20 shadow-xl shadow-slate-900/20 rounded-b-[2rem]">
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={onBack}
          onKeyPress={(e) => handleKeyPress(e, onBack)}
          className="p-2 bg-white/10 rounded-xl hover:bg-white/20 backdrop-blur-md transition-all"
          aria-label="Retour à la liste des dossiers"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-sm font-bold tracking-widest uppercase opacity-70">Détail Dossier</h1>
        <button 
          onClick={handleShare}
          onKeyPress={(e) => handleKeyPress(e, handleShare)}
          className="p-2 bg-emerald-500 rounded-xl text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-all"
          aria-label="Partager le dossier par WhatsApp"
        >
          <MessageCircle size={20} />
        </button>
      </div>
      
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-blue-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">{shipment.customsRegime}</span>
          <span className="bg-slate-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-slate-300">{shipment.commodityType}</span>
        </div>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-1">{shipment.trackingNumber}</h2>
            <p className="text-slate-400 text-sm font-medium">{shipment.clientName}</p>
          </div>
          {(role === 'Chargé de Création' || role === 'DG / Admin') && (
            <button 
              onClick={isEditing ? handleSaveClick : onToggleEdit}
              onKeyPress={(e) => handleKeyPress(e, isEditing ? handleSaveClick : onToggleEdit)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label={isEditing ? 'Sauvegarder les modifications' : 'Modifier le dossier'}
            >
              {isEditing ? <Save size={20} className="text-emerald-400" /> : <PenLine size={20} className="text-slate-400" />}
            </button>
          )}
        </div>
        
        {/* EDITABLE FIELDS */}
        {isEditing ? (
          <div className="mt-4 bg-white/10 p-4 rounded-xl space-y-3">
            <div>
              <input 
                value={editForm.blNumber || ''} 
                onChange={(e) => {
                  const sanitized = sanitizeInput(e.target.value.toUpperCase());
                  onEditChange('blNumber', sanitized);
                }}
                placeholder="BL Number (ex: MAEU123456789)"
                maxLength={13}
                className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600"
                aria-label="Numéro de connaissement (Bill of Lading)"
                aria-invalid={editForm.blNumber && !validateBL(editForm.blNumber) ? 'true' : 'false'}
              />
              {editForm.blNumber && !validateBL(editForm.blNumber) && (
                <p className="text-xs text-red-400 mt-1" role="alert">Format invalide (4 lettres + 9 chiffres)</p>
              )}
            </div>
            <div>
              <input 
                value={editForm.containerNumber || ''} 
                onChange={(e) => {
                  const sanitized = sanitizeInput(e.target.value.toUpperCase());
                  onEditChange('containerNumber', sanitized);
                }}
                placeholder="Container Number (ex: MSCU1234567)"
                maxLength={11}
                className="w-full bg-slate-800 text-white p-2 rounded border border-slate-600"
                aria-label="Numéro de conteneur ISO 6346"
                aria-invalid={editForm.containerNumber && !validateContainer(editForm.containerNumber) ? 'true' : 'false'}
              />
              {editForm.containerNumber && !validateContainer(editForm.containerNumber) && (
                <p className="text-xs text-red-400 mt-1" role="alert">Format invalide (4 lettres + 7 chiffres)</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
