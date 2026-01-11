import React, { useState, useMemo, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Calculator, RefreshCcw, Info, CircleDollarSign, Search, AlertTriangle, CheckCircle, FileText, Shield, Settings } from 'lucide-react';
import { 
  calculateCustomsDuties, 
  formatGNF, 
  searchHSCode, 
  HS_CODE_DATABASE,
  EXEMPTIONS_DATABASE,
  ExemptionType,
  CustomsCalculationInput
} from '../utils/customsCalculator';

// Constants
const STORAGE_KEY = 'customs_calculator_state';
const MAX_VALUE = 1_000_000_000_000; // 1 trillion GNF
const MAX_SEARCH_LENGTH = 100;
const DEBOUNCE_DELAY_MS = 300;

type CustomsRegime = 'IM4' | 'IT' | 'AT' | 'Export';

const isValidRegime = (value: string): value is CustomsRegime => {
  return ['IM4', 'IT', 'AT', 'Export'].includes(value);
};

export const CustomsCalculator: React.FC = () => {
  // États de base
  const [valueFOB, setValueFOB] = useState<number>(0);
  const [freight, setFreight] = useState<number>(0);
  const [insurance, setInsurance] = useState<number>(0);
  
  // États avancés
  const [hsCode, setHsCode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [regime, setRegime] = useState<CustomsRegime>('IM4');
  const [isExempted, setIsExempted] = useState<boolean>(false);
  const [exemptionType, setExemptionType] = useState<ExemptionType | undefined>();
  
  // UI
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showHSSearch, setShowHSSearch] = useState<boolean>(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  
  // Refs
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Restore state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.valueFOB) setValueFOB(state.valueFOB);
        if (state.freight) setFreight(state.freight);
        if (state.insurance) setInsurance(state.insurance);
        if (state.hsCode) setHsCode(state.hsCode);
        if (state.regime && isValidRegime(state.regime)) setRegime(state.regime);
      } catch (e) {
        console.warn('[CustomsCalculator] Failed to restore state', e);
      }
    }
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    if (valueFOB > 0) {
      const state = { valueFOB, freight, insurance, hsCode, regime };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [valueFOB, freight, insurance, hsCode, regime]);

  // Debounce search query
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, DEBOUNCE_DELAY_MS);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Input validation handler
  const handleNumberInput = (
    value: string, 
    setter: (val: number) => void,
    fieldName: string
  ) => {
    const num = Number(value);
    
    if (isNaN(num)) {
      console.warn(`[CustomsCalculator] Invalid ${fieldName}:`, value);
      setter(0);
      return;
    }
    
    if (num < 0) {
      console.warn(`[CustomsCalculator] Negative ${fieldName} not allowed`);
      setter(0);
      return;
    }
    
    if (!isFinite(num)) {
      console.warn(`[CustomsCalculator] Infinite ${fieldName} not allowed`);
      setter(0);
      return;
    }
    
    if (num > MAX_VALUE) {
      console.warn(`[CustomsCalculator] ${fieldName} exceeds maximum`);
      setter(MAX_VALUE);
      return;
    }
    
    setter(num);
  };

  // Sanitize search input
  const handleSearchInput = (value: string) => {
    const sanitized = DOMPurify.sanitize(value, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    }).trim();
    
    setSearchQuery(sanitized.substring(0, MAX_SEARCH_LENGTH));
  };

  // Recherche codes SH (debounced)
  const hsSearchResults = useMemo(() => {
    if (!debouncedSearchQuery || debouncedSearchQuery.length < 3) return [];
    return searchHSCode(debouncedSearchQuery).slice(0, 5);
  }, [debouncedSearchQuery]);

  // Calcul with error handling
  const result = useMemo(() => {
    if (valueFOB === 0) return null;
    
    setCalculationError(null);
    
    try {
      const input: CustomsCalculationInput = {
        valueFOB,
        freight,
        insurance,
        hsCode: hsCode || undefined,
        regime,
        isExempted,
        exemptionType
      };

      return calculateCustomsDuties(input);
    } catch (error) {
      console.error('[CustomsCalculator] Calculation failed', error);
      setCalculationError('Erreur de calcul. Vérifiez les valeurs saisies.');
      return null;
    }
  }, [valueFOB, freight, insurance, hsCode, regime, isExempted, exemptionType]);

  const handleReset = () => {
    setValueFOB(0);
    setFreight(0);
    setInsurance(0);
    setHsCode('');
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setRegime('IM4');
    setIsExempted(false);
    setExemptionType(undefined);
    setCalculationError(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleSelectHS = (code: string) => {
    setHsCode(code);
    setShowHSSearch(false);
    setSearchQuery('');
  };

  const selectedHSInfo = hsCode ? HS_CODE_DATABASE[hsCode] : null;

  return (
    <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
      
      {/* Header avec résultat */}
      <div className="bg-slate-900 p-8 text-white text-center relative overflow-hidden">
         <div className="relative z-10">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Total Estimé</p>
            <h2 className="text-4xl font-bold tracking-tight">
              {result ? formatGNF(result.totalDuties) : formatGNF(0)}
            </h2>
            <div className="mt-4 flex justify-center gap-4 text-xs font-medium text-slate-300">
               <span>CAF: {result ? formatGNF(result.valueCAF) : formatGNF(0)}</span>
               {result && <span>Total: {formatGNF(result.totalCost)}</span>}
            </div>
         </div>
         <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-600 rounded-full blur-3xl opacity-20"></div>
      </div>

      <div className="p-6 space-y-6">
        
        {/* Calculation Error */}
        {calculationError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">{calculationError}</p>
          </div>
        )}

        {/* Inputs de base */}
        <div className="space-y-4">
          {[
            { label: 'Valeur FOB', val: valueFOB, set: setValueFOB, id: 'fob' },
            { label: 'Fret', val: freight, set: setFreight, id: 'freight' },
            { label: 'Assurance', val: insurance, set: setInsurance, id: 'insurance' }
          ].map((item, i) => (
             <div key={i}>
                <label 
                  htmlFor={`input-${item.id}`}
                  className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-1"
                >
                  {item.label}
                </label>
                <div className="relative">
                   <input 
                     id={`input-${item.id}`}
                     type="number"
                     min="0"
                     max={MAX_VALUE.toString()}
                     step="1000"
                     value={item.val || ''} 
                     onChange={e => handleNumberInput(e.target.value, item.set, item.label)}
                     aria-label={`Valeur ${item.label} en Francs Guinéens`}
                     aria-describedby={`help-${item.id}`}
                     aria-required="true"
                     className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold text-slate-900 placeholder:text-slate-300"
                     placeholder="0"
                   />
                   <span className="absolute right-4 top-4 text-xs font-bold text-slate-400">GNF</span>
                   <span id={`help-${item.id}`} className="sr-only">
                     Saisissez la valeur en GNF, minimum 0
                   </span>
                </div>
             </div>
          ))}
        </div>

        {/* Toggle options avancées */}
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full py-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-700 font-bold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Settings size={16} />
          {showAdvanced ? 'Masquer' : 'Options Avancées'} (Code SH, Exonérations)
        </button>

        {/* Options avancées */}
        {showAdvanced && (
          <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            
            {/* Recherche Code SH */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-2">
                <Search size={14} /> Code SH (Système Harmonisé)
              </label>
              
              {!hsCode ? (
                <>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearchInput(e.target.value)}
                    onFocus={() => setShowHSSearch(true)}
                    maxLength={MAX_SEARCH_LENGTH}
                    aria-label="Rechercher un code SH"
                    placeholder="Rechercher... (ex: plastique, riz, voiture)"
                    className="w-full p-3 bg-white rounded-lg border border-slate-200 text-sm"
                  />
                  
                  {showHSSearch && hsSearchResults.length > 0 && (
                    <div className="mt-2 bg-white rounded-lg border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                      {hsSearchResults.map(result => (
                        <button
                          key={result.code}
                          onClick={() => handleSelectHS(result.code)}
                          className="w-full p-3 text-left hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                        >
                          <div className="font-bold text-xs text-blue-600">{result.code}</div>
                          <div className="text-xs text-slate-600">{result.description}</div>
                          <div className="text-[10px] text-slate-400 mt-1">DD: {(result.ddRate * 100).toFixed(0)}%</div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white p-3 rounded-lg border border-green-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono font-bold text-green-700">{hsCode}</span>
                      {selectedHSInfo && (
                        <>
                          <p className="text-xs text-slate-600 mt-1">{selectedHSInfo.description}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            DD: {(selectedHSInfo.ddRate * 100).toFixed(0)}% • {selectedHSInfo.category}
                          </p>
                        </>
                      )}
                    </div>
                    <button 
                      onClick={() => setHsCode('')}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Régime douanier */}
            <div>
              <label htmlFor="regime-select" className="block text-xs font-bold text-slate-700 uppercase mb-2">Régime Douanier</label>
              <select
                id="regime-select"
                value={regime}
                onChange={e => {
                  const value = e.target.value;
                  if (isValidRegime(value)) {
                    setRegime(value);
                  } else {
                    console.warn('[CustomsCalculator] Invalid regime:', value);
                  }
                }}
                aria-label="Sélectionner le régime douanier"
                className="w-full p-3 bg-white rounded-lg border border-slate-200 text-sm font-semibold"
              >
                <option value="IM4">IM4 - Import Consommation</option>
                <option value="IT">IT - Transit International</option>
                <option value="AT">AT - Admission Temporaire</option>
                <option value="Export">Export</option>
              </select>
            </div>

            {/* Exonérations */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isExempted}
                  onChange={e => setIsExempted(e.target.checked)}
                  aria-label="Activer l'exonération de taxes"
                  className="w-4 h-4 rounded"
                />
                <span className="text-xs font-bold text-slate-700 uppercase">Exonération Applicable</span>
              </label>

              {isExempted && (
                <select
                  value={exemptionType || ''}
                  onChange={e => setExemptionType(e.target.value as ExemptionType)}
                  aria-label="Sélectionner le type d'exonération"
                  className="w-full mt-2 p-3 bg-white rounded-lg border border-slate-200 text-sm"
                >
                  <option value="">Sélectionner type...</option>
                  {Object.values(EXEMPTIONS_DATABASE).map(ex => (
                    <option key={ex.type} value={ex.type}>
                      {ex.type} - {ex.description}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Détails taxes */}
        {result && (
          <>
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
               <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Info size={14} className="text-blue-500" /> Détails Taxes
               </h4>
               <div className="space-y-2 text-sm">
                 <div className="flex justify-between text-slate-500">
                   <span>Droit Douane (DD {(result.rates.DD * 100).toFixed(0)}%)</span>
                   <span className="font-bold text-slate-700">{formatGNF(result.DD)}</span>
                 </div>
                 <div className="flex justify-between text-slate-500">
                   <span>RTL (2%)</span>
                   <span className="font-bold text-slate-700">{formatGNF(result.RTL)}</span>
                 </div>
                 <div className="flex justify-between text-slate-500">
                   <span>RDL (1.5%)</span>
                   <span className="font-bold text-slate-700">{formatGNF(result.RDL)}</span>
                 </div>
                 <div className="flex justify-between text-slate-500">
                   <span>TVS (18%)</span>
                   <span className="font-bold text-slate-700">{formatGNF(result.TVS)}</span>
                 </div>
                 <div className="pt-2 border-t border-slate-200 flex justify-between font-bold">
                   <span>Valeur Fiscale</span>
                   <span className="text-blue-600">{formatGNF(result.valueFiscale)}</span>
                 </div>
               </div>
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    {result.warnings.map((warning, i) => (
                      <p key={i} className="text-xs text-orange-700 font-medium">{warning}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Exonérations actives */}
            {result.exemptions.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-start gap-2 mb-2">
                  <Shield size={16} className="text-green-600 mt-0.5" />
                  <h5 className="text-xs font-bold text-green-800 uppercase">Exonérations Appliquées</h5>
                </div>
                {result.exemptions.map((ex, i) => (
                  <div key={i} className="mt-2">
                    <p className="text-xs font-bold text-green-700">{ex.type}</p>
                    <p className="text-[10px] text-green-600 mt-1">{ex.description}</p>
                    <p className="text-[10px] text-green-600">
                      Taxes exemptées: {ex.taxesExempted.join(', ')}
                    </p>
                    <details className="mt-2">
                      <summary className="text-[10px] text-green-700 cursor-pointer hover:underline">
                        Documents requis ({ex.requiresDocuments.length})
                      </summary>
                      <ul className="text-[10px] text-green-600 mt-1 ml-4 list-disc">
                        {ex.requiresDocuments.map((doc, j) => (
                          <li key={j}>{doc}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Reset button */}
        <button 
          onClick={handleReset}
          className="w-full py-4 rounded-xl text-slate-500 font-bold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCcw size={16} /> Réinitialiser
        </button>

        {/* Info disclaimer */}
        <div className="bg-blue-50 p-3 rounded-xl">
          <p className="text-[10px] text-blue-700 text-center">
            <Info size={12} className="inline mr-1" />
            Calcul estimatif. Montants définitifs déterminés par la Direction Nationale des Douanes (DND).
          </p>
        </div>
      </div>
    </div>
  );
};