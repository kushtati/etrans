import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CommodityType, Shipment, ShipmentStatus } from '../types';
import { Package, MapPin, Calendar, User, Save, X, Truck, Anchor, FileText, Settings, AlertCircle } from 'lucide-react';
import { CreateShipmentSchema, CreateShipmentInput, GN_CITIES } from '../utils/validation';
import { generateTrackingNumber } from '../utils/trackingNumber';
import { hashClientName, hashBLNumber } from '../utils/dataHashing';
import { logger } from '../services/logger';
import DOMPurify from 'dompurify';
import { useShipmentActions } from '../hooks/useTransitSelectors';

// Configuration: Shipping Lines
const SHIPPING_LINES = [
  { value: 'Maersk', label: 'Maersk Line' },
  { value: 'CMA CGM', label: 'CMA CGM' },
  { value: 'MSC', label: 'MSC' },
  { value: 'Grimaldi', label: 'Grimaldi' },
  { value: 'Hapag-Lloyd', label: 'Hapag-Lloyd' },
  { value: 'Autre', label: 'Autre / Affrètement' }
] as const;

const FORM_STORAGE_KEY = 'shipment_draft';
const SUBMIT_COOLDOWN_MS = 3000; // 3 seconds between submissions

interface Props {
  onCancel: () => void;
  currentUserId: string; // SECURITY: Associate shipment with creating user
}

// Strict sanitization: plain text only, no HTML tags
const sanitizeInput = (input: string): string => {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // No HTML tags allowed
    ALLOWED_ATTR: [], // No attributes allowed
    KEEP_CONTENT: true // Keep text content, remove tags
  }).trim();
};

export const CreateShipmentForm: React.FC<Props> = ({ onCancel, currentUserId }) => {
  // ✅ OPTIMISÉ: Hook actions stable - JAMAIS de re-render
  const { addShipment } = useShipmentActions();
  const [rawFormData, setRawFormData] = useState<CreateShipmentInput>({
    clientName: '',
    commodityType: CommodityType.CONTAINER,
    description: '',
    origin: '',
    destination: 'Conakry, GN', // Default to Conakry
    eta: '',
    blNumber: '',
    shippingLine: 'Maersk',
    containerNumber: '',
    customsRegime: 'IM4'
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastSubmitTime = useRef<number>(0);
  const firstErrorRef = useRef<HTMLInputElement>(null);

  // Auto-save to localStorage
  useEffect(() => {
    const saved = localStorage.getItem(FORM_STORAGE_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setRawFormData(draft);
      } catch (e) {
        console.warn('[CreateShipmentForm] Failed to restore draft', e);
      }
    }
  }, []);

  useEffect(() => {
    if (rawFormData.clientName || rawFormData.blNumber) {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(rawFormData));
    }
  }, [rawFormData]);

  // Auto-scroll to first error
  useEffect(() => {
    if (Object.keys(validationErrors).length > 0 && firstErrorRef.current) {
      firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstErrorRef.current.focus();
    }
  }, [validationErrors]);

  const clearDraft = () => {
    localStorage.removeItem(FORM_STORAGE_KEY);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    // Clear error when user types
    if (validationErrors[e.target.name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[e.target.name];
        return newErrors;
      });
    }
    if (serverError) setServerError(null);
    setRawFormData({ ...rawFormData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Rate limiting check
    const now = Date.now();
    if (now - lastSubmitTime.current < SUBMIT_COOLDOWN_MS) {
      const waitTime = Math.ceil((SUBMIT_COOLDOWN_MS - (now - lastSubmitTime.current)) / 1000);
      setServerError(`Veuillez attendre ${waitTime}s avant de créer un autre dossier`);
      return;
    }

    if (isSubmitting) return;

    // 2. Sanitize inputs with strict config (plain text only)
    const sanitizedFormData = {
      ...rawFormData,
      clientName: sanitizeInput(rawFormData.clientName),
      description: sanitizeInput(rawFormData.description),
      origin: sanitizeInput(rawFormData.origin),
      blNumber: sanitizeInput(rawFormData.blNumber),
      containerNumber: rawFormData.containerNumber ? sanitizeInput(rawFormData.containerNumber) : ''
    };

    // 3. Client-side validation (UX)
    const validationResult = CreateShipmentSchema.safeParse(sanitizedFormData);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.issues.forEach(err => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });
      setValidationErrors(fieldErrors);
      logger.warn('[CreateShipmentForm] Validation failed', fieldErrors);
      return;
    }

    // 4. Show confirmation modal
    setShowConfirmation(true);
  };

  const confirmCreate = () => {
    setShowConfirmation(false);
    setIsSubmitting(true);
    setServerError(null);
    lastSubmitTime.current = Date.now();

    try {
      const sanitizedFormData = {
        ...rawFormData,
        clientName: sanitizeInput(rawFormData.clientName),
        description: sanitizeInput(rawFormData.description),
        origin: sanitizeInput(rawFormData.origin),
        blNumber: sanitizeInput(rawFormData.blNumber),
        containerNumber: rawFormData.containerNumber ? sanitizeInput(rawFormData.containerNumber) : ''
      };

      // GDPR: Hash sensitive data before logging
      logger.audit('CREATION_DOSSIER_INIT', { 
        clientHash: hashClientName(sanitizedFormData.clientName),
        blHash: hashBLNumber(sanitizedFormData.blNumber),
        regime: sanitizedFormData.customsRegime
      });

      // Generate professional tracking number with Luhn checksum
      const trackingNumber = generateTrackingNumber(sanitizedFormData.customsRegime);

      const newShipment: Shipment = {
        id: uuidv4(), // ✅ UUID v4 instead of Date.now()
        trackingNumber,
        clientId: currentUserId,
        clientName: sanitizedFormData.clientName,
        commodityType: sanitizedFormData.commodityType,
        description: sanitizedFormData.description,
        origin: sanitizedFormData.origin,
        destination: sanitizedFormData.destination,
        status: ShipmentStatus.OPENED,
        eta: sanitizedFormData.eta,
        freeDays: 7,
        documents: [],
        expenses: [],
        alerts: [],
        blNumber: sanitizedFormData.blNumber.toUpperCase(),
        shippingLine: sanitizedFormData.shippingLine,
        containerNumber: sanitizedFormData.containerNumber ? sanitizedFormData.containerNumber.toUpperCase() : undefined,
        customsRegime: sanitizedFormData.customsRegime
      };

      addShipment(newShipment);
      clearDraft();
      logger.info('[CreateShipmentForm] Shipment created successfully', { trackingNumber });
      onCancel();
    } catch (error) {
      console.error('[CreateShipmentForm] Creation failed', error);
      setServerError('Erreur lors de la création du dossier. Veuillez réessayer.');
      logger.error('[CreateShipmentForm] Creation failed', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white min-h-full p-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Ouverture Dossier</h2>
          <p className="text-sm text-slate-500">Enregistrement technique sécurisé (Validation Zod)</p>
        </div>
        <button onClick={onCancel} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl mx-auto pb-10">
        
        {/* Error Summary if any */}
        {Object.keys(validationErrors).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
             <AlertCircle className="text-red-500 mt-0.5" size={18} />
             <div>
               <h4 className="text-sm font-bold text-red-800">Erreurs de validation</h4>
               <ul className="list-disc list-inside text-xs text-red-600 mt-1">
                 {Object.values(validationErrors).map((err, i) => <li key={i}>{err}</li>)}
               </ul>
             </div>
          </div>
        )}

        {/* Server Error */}
        {serverError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
             <AlertCircle className="text-red-500 mt-0.5" size={18} />
             <p className="text-sm text-red-800 font-medium">{serverError}</p>
          </div>
        )}

        {/* Section 1: Client & Régime */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <User size={14} /> Identification
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Client / Importateur</label>
                <input
                  ref={validationErrors.clientName ? firstErrorRef : null}
                  name="clientName"
                  value={rawFormData.clientName}
                  onChange={handleChange}
                  aria-label="Nom du client ou importateur"
                  aria-invalid={!!validationErrors.clientName}
                  aria-describedby={validationErrors.clientName ? 'clientName-error' : undefined}
                  className={`w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-semibold ${validationErrors.clientName ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'}`}
                  placeholder="Société ou Particulier"
                />
                {validationErrors.clientName && <span id="clientName-error" role="alert" className="text-[10px] text-red-500 font-bold">{validationErrors.clientName}</span>}
             </div>
             <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Régime Douanier</label>
                <select
                  name="customsRegime"
                  value={rawFormData.customsRegime}
                  onChange={handleChange}
                  aria-label="Régime douanier"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-semibold"
                >
                  <option value="IM4">IM4 - Consommation</option>
                  <option value="IT">IT - Transit</option>
                  <option value="AT">AT - Adm. Temporaire</option>
                  <option value="Export">Export</option>
                </select>
             </div>
          </div>
        </div>

        {/* Section 2: Détails Maritimes */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Anchor size={14} /> Transport Maritime
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">N° Connaissement (BL)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3.5 text-slate-400" size={16} />
                <input
                  name="blNumber"
                  value={rawFormData.blNumber}
                  onChange={handleChange}
                  aria-label="Numéro de connaissement"
                  aria-invalid={!!validationErrors.blNumber}
                  aria-describedby={validationErrors.blNumber ? 'blNumber-error' : undefined}
                  className={`w-full pl-10 p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-mono font-bold uppercase placeholder:font-sans placeholder:font-normal ${validationErrors.blNumber ? 'border-red-300' : 'border-slate-200'}`}
                  placeholder="Ex: MEDU1234567"
                />
              </div>
              {validationErrors.blNumber && <span id="blNumber-error" role="alert" className="text-[10px] text-red-500 font-bold">{validationErrors.blNumber}</span>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Compagnie Maritime</label>
              <select
                name="shippingLine"
                value={rawFormData.shippingLine}
                onChange={handleChange}
                aria-label="Compagnie maritime"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-semibold"
              >
                {SHIPPING_LINES.map(line => (
                  <option key={line.value} value={line.value}>{line.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Marchandise & Logistique */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Package size={14} /> Marchandise & Traçage
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type Conteneur / Colis</label>
                <select
                  name="commodityType"
                  value={rawFormData.commodityType}
                  onChange={handleChange}
                  aria-label="Type de conteneur ou colis"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-semibold"
                >
                  {Object.values(CommodityType).map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
             </div>
             <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">N° Conteneur / Châssis</label>
                <input
                  name="containerNumber"
                  value={rawFormData.containerNumber || ''}
                  onChange={handleChange}
                  aria-label="Numéro de conteneur"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-mono font-bold uppercase placeholder:font-sans placeholder:font-normal"
                  placeholder="Ex: MSKU1234567"
                />
             </div>
             <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Description Marchandise</label>
                <input
                  name="description"
                  value={rawFormData.description}
                  onChange={handleChange}
                  aria-label="Description de la marchandise"
                  aria-invalid={!!validationErrors.description}
                  aria-describedby={validationErrors.description ? 'description-error' : undefined}
                  className={`w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-semibold ${validationErrors.description ? 'border-red-300' : 'border-slate-200'}`}
                  placeholder="Ex: Pièces détachées, Huile moteur..."
                />
                {validationErrors.description && <span id="description-error" role="alert" className="text-[10px] text-red-500 font-bold">{validationErrors.description}</span>}
             </div>
          </div>
        </div>

        {/* Section 4: Route */}
        <div className="space-y-4">
           <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <MapPin size={14} /> Itinéraire
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Port de Chargement (POL)</label>
                <input
                  name="origin"
                  value={rawFormData.origin}
                  onChange={handleChange}
                  aria-label="Port de chargement"
                  aria-invalid={!!validationErrors.origin}
                  aria-describedby={validationErrors.origin ? 'origin-error' : undefined}
                  className={`w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-semibold ${validationErrors.origin ? 'border-red-300' : 'border-slate-200'}`}
                  placeholder="Ex: Anvers, Dubai"
                />
                {validationErrors.origin && <span id="origin-error" role="alert" className="text-[10px] text-red-500 font-bold">{validationErrors.origin}</span>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Destination Guinée (POD)</label>
                <select
                  name="destination"
                  value={rawFormData.destination}
                  onChange={handleChange}
                  aria-label="Destination en Guinée"
                  aria-invalid={!!validationErrors.destination}
                  aria-describedby={validationErrors.destination ? 'destination-error' : undefined}
                  className={`w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-semibold ${validationErrors.destination ? 'border-red-300' : 'border-slate-200'}`}
                >
                  {GN_CITIES.map(city => (
                    <option key={city} value={`${city}, GN`}>{city}</option>
                  ))}
                </select>
                {validationErrors.destination && <span id="destination-error" role="alert" className="text-[10px] text-red-500 font-bold">{validationErrors.destination}</span>}
              </div>
           </div>

           <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ETA Destination (POD)</label>
                <input
                  type="date"
                  name="eta"
                  value={rawFormData.eta}
                  onChange={handleChange}
                  aria-label="Date d'arrivée estimée"
                  aria-invalid={!!validationErrors.eta}
                  aria-describedby={validationErrors.eta ? 'eta-error' : undefined}
                  className={`w-full p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm font-semibold ${validationErrors.eta ? 'border-red-300' : 'border-slate-200'}`}
                />
                {validationErrors.eta && <span id="eta-error" role="alert" className="text-[10px] text-red-500 font-bold">{validationErrors.eta}</span>}
              </div>
           </div>
        </div>

        <div className="pt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-[2] py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} className={isSubmitting ? 'animate-pulse' : ''} /> 
            {isSubmitting ? 'Enregistrement...' : 'Enregistrer Dossier'}
          </button>
        </div>

      </form>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl max-w-md w-full shadow-2xl">
            <h3 className="font-bold text-lg mb-3 text-slate-900">Confirmer création dossier</h3>
            <div className="space-y-2 text-sm text-slate-600 mb-6">
              <p><strong>Client:</strong> {rawFormData.clientName}</p>
              <p><strong>BL N°:</strong> {rawFormData.blNumber}</p>
              <p><strong>Régime:</strong> {rawFormData.customsRegime}</p>
              <p><strong>Route:</strong> {rawFormData.origin} → {rawFormData.destination}</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirmation(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={confirmCreate}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
