
import React, { useState, useMemo, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Role, Expense, ExpenseType } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { useShipments, useAuth } from '../hooks/useTransitSelectors';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Wallet, PieChart, ArrowUpRight, ArrowDownRight, Filter, Download, X, FileText, CheckCircle, AlertCircle } from 'lucide-react';


// Constants for maintainability
const ICON_SIZES = {
  tiny: 12,
  small: 14,
  medium: 16,
  large: 18,
  xlarge: 48
} as const;

const EXPORT_COOLDOWN_MS = 5000; // 5 seconds minimum between exports

type TimeRange = 'day' | 'week' | 'month' | 'year';

export const AccountingView: React.FC = () => {
  // ✅ OPTIMISÉ: Hooks sélecteurs pour re-renders minimaux
  const shipments = useShipments(); // Re-render seulement si liste change
  const { role, userId: currentUserId } = useAuth(); // Re-render seulement si auth change
  const { canViewOwnShipments } = usePermissions();
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [isExporting, setIsExporting] = useState(false);
  const [detailModal, setDetailModal] = useState<'income' | 'expense' | 'balance' | null>(null);
  const lastExportTime = useRef<number>(0);
  const chartRef = useRef<HTMLDivElement>(null);

  // Cleanup Recharts memory leak on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.innerHTML = '';
      }
    };
  }, []);

  // LOCALIZATION: Format dates in Africa/Conakry timezone to avoid day offset issues
  const formatDateInConakry = (date: Date, format: 'time' | 'date' | 'month'): string => {
    const conakryDate = new Date(date.toLocaleString('en-US', { timeZone: 'Africa/Conakry' }));
    
    if (format === 'time') {
      return conakryDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (format === 'month') {
      return conakryDate.toLocaleDateString('fr-FR', { month: 'short' });
    } else {
      return conakryDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    }
  };

  // SECURITY: Sanitize and validate transaction data
  // Only explicitly allowed fields are copied, no spread operator exposure
  const sanitizeTransaction = (expense: Expense, shipmentRef: string, clientName: string) => {
    // Validation warnings for debugging
    if (typeof expense.amount !== 'number' || expense.amount < 0) {
      console.warn(`[AccountingView] Invalid expense amount for ${expense.id}:`, expense.amount);
    }
    
    if (!['Douane', 'Port', 'Logistique', 'Agence', 'Autre'].includes(expense.category)) {
      console.warn(`[AccountingView] Unknown category "${expense.category}" for ${expense.id}, defaulting to "Autre"`);
    }

    return {
      id: expense.id,
      description: DOMPurify.sanitize(expense.description),
      amount: typeof expense.amount === 'number' && expense.amount >= 0 ? expense.amount : 0,
      paid: expense.paid === true,
      category: ['Douane', 'Port', 'Logistique', 'Agence', 'Autre'].includes(expense.category) 
        ? expense.category 
        : 'Autre',
      type: ['PROVISION', 'DISBURSEMENT', 'FEE'].includes(expense.type) 
        ? (expense.type as ExpenseType)
        : 'FEE',
      date: expense.date,
      shipmentRef: DOMPurify.sanitize(shipmentRef),
      client: DOMPurify.sanitize(clientName),
      dateObj: new Date(expense.date)
    };
  };

  // 1. Flatten all expenses from all shipments into a single transaction ledger
  // SECURITY: Filter shipments by role - Clients only see their own shipments
  // PERFORMANCE: Memoize filtered shipments separately to avoid double filtering
  const filteredShipments = useMemo(() => {
    console.log('[AccountingView] Total shipments:', shipments.length);
    console.log('[AccountingView] canViewOwnShipments:', canViewOwnShipments);
    console.log('[AccountingView] currentUserId:', currentUserId);
    
    const filtered = canViewOwnShipments 
      ? shipments.filter(s => s.clientId === currentUserId)
      : shipments;
    
    console.log('[AccountingView] Filtered shipments:', filtered.length);
    return filtered;
  }, [shipments, canViewOwnShipments, currentUserId]);

  const allTransactions = useMemo(() => {
    const transactions = filteredShipments.flatMap(s => {
      console.log(`[AccountingView] Shipment ${s.trackingNumber} has ${(s.expenses || []).length} expenses`);
      return (s.expenses || []).map(e => sanitizeTransaction(e, s.trackingNumber, s.clientName));
    }).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    
    console.log('[AccountingView] Total transactions:', transactions.length);
    return transactions;
  }, [filteredShipments]);

  // 2. Filter transactions based on selected Time Range
  const filteredData = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Helper to get start of week (Monday)
    const getStartOfWeek = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    };

    let startDate: Date;

    switch (timeRange) {
      case 'day':
        startDate = startOfDay;
        break;
      case 'week':
        startDate = getStartOfWeek(now);
        startDate.setHours(0,0,0,0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(0);
    }

    return allTransactions.filter(t => t.dateObj >= startDate && t.dateObj <= now);
  }, [allTransactions, timeRange]);

  // Log pour débogage
  console.log('[AccountingView] Time range:', timeRange);
  console.log('[AccountingView] Filtered transactions:', filteredData.length);
  if (filteredData.length > 0) {
    console.log('[AccountingView] First transaction:', filteredData[0]);
  }

  // 3. Calculate Totals
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    
    filteredData.forEach(t => {
      if (t.type === 'PROVISION' && t.paid) income += t.amount;
      if ((t.type === 'DISBURSEMENT' || t.type === 'FEE') && t.paid) expense += t.amount;
    });

    console.log('[AccountingView] Totals - Income:', income, 'Expense:', expense);
    return { income, expense, balance: income - expense };
  }, [filteredData]);

  // 4. Prepare Chart Data
  const chartData = useMemo(() => {
    // Group by date/period
    const groups: Record<string, { name: string, in: number, out: number, timestamp: number }> = {};
    
    filteredData.forEach(t => {
        let key = '';
        if (timeRange === 'day') key = formatDateInConakry(t.dateObj, 'time');
        else if (timeRange === 'year') key = formatDateInConakry(t.dateObj, 'month');
        else key = formatDateInConakry(t.dateObj, 'date');

        if (!groups[key]) groups[key] = { name: key, in: 0, out: 0, timestamp: t.dateObj.getTime() };
        
        if (t.type === 'PROVISION' && t.paid) groups[key].in += t.amount;
        if ((t.type === 'DISBURSEMENT' || t.type === 'FEE') && t.paid) groups[key].out += t.amount;
    });

    // PERF: Sort keys chronologically instead of reversing array
    // Avoid Object.values() + reverse() which creates unnecessary array and reverses
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      return groups[a].timestamp - groups[b].timestamp;
    });
    
    const result = sortedKeys.map(k => {
      const { timestamp, ...data } = groups[k];
      return data;
    });

    return result;
  }, [filteredData, timeRange]);

  // ROBUSTNESS: Handle undefined, null, or NaN values to prevent silent crashes
  const formatGNF = (val: number | undefined | null): string => {
    if (val === undefined || val === null || isNaN(val)) return '0 GNF';
    
    try {
      return new Intl.NumberFormat('fr-GN', { 
        style: 'currency', 
        currency: 'GNF', 
        maximumFractionDigits: 0 
      }).format(val);
    } catch (error) {
      // Fallback if fr-GN locale unavailable (older browsers in Guinea)
      console.warn('[AccountingView] Intl.NumberFormat failed, using fallback', error);
      return `${Math.round(val).toLocaleString('fr-FR')} GNF`;
    }
  };

  // PDF Export with rate limiting and security
  const exportToPDF = async () => {
    const now = Date.now();
    
    // Rate limiting: 5 seconds minimum between exports
    if (now - lastExportTime.current < EXPORT_COOLDOWN_MS) {
      const waitTime = Math.ceil((EXPORT_COOLDOWN_MS - (now - lastExportTime.current)) / 1000);
      alert(`Veuillez attendre ${waitTime}s avant le prochain export`);
      return;
    }
    
    if (isExporting) return;
    
    setIsExporting(true);
    lastExportTime.current = now;
    
    try {
      // ⚡ LAZY LOAD - Ne charger jsPDF que quand l'utilisateur clique (économise 419 KB au chargement)
      const [{ jsPDF }, autoTable] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(18);
      doc.text('Rapport Comptable - TransitGuinée', 14, 22);
      doc.setFontSize(10);
      doc.text(`Période: ${timeRange} - Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);
      
      // Summary
      doc.setFontSize(12);
      doc.text('Résumé:', 14, 45);
      doc.setFontSize(10);
      doc.text(`Entrées: ${formatGNF(totals.income)}`, 20, 52);
      doc.text(`Sorties: ${formatGNF(totals.expense)}`, 20, 59);
      doc.text(`Bilan: ${formatGNF(totals.balance)}`, 20, 66);
      
      // Table
      const tableData = filteredData.map(t => [
        formatDateInConakry(t.dateObj, 'date'),
        t.shipmentRef,
        DOMPurify.sanitize(t.description), // Extra sanitization for PDF
        t.category,
        t.type === 'PROVISION' ? formatGNF(t.amount) : '',
        t.type !== 'PROVISION' ? formatGNF(t.amount) : ''
      ]);
      
      autoTable(doc, {
        startY: 75,
        head: [['Date', 'Réf', 'Description', 'Catégorie', 'Entrée', 'Sortie']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42] }
      });
      
      doc.save(`rapport-${timeRange}-${Date.now()}.pdf`);
    } catch (error) {
      console.error('[AccountingView] PDF export failed:', error);
      alert('Erreur lors de l\'export PDF. Veuillez réessayer.');
    } finally {
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-6 animate-in fade-in pb-24">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
             <PieChart className="text-blue-600" /> Bilan Financier
           </h2>
           <p className="text-slate-500 text-sm">Supervision de la trésorerie et des flux.</p>
        </div>
        
        {/* Time Filters */}
        <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm">
           {(['day', 'week', 'month', 'year'] as const).map((range: TimeRange) => (
             <button
               key={range}
               onClick={() => setTimeRange(range)}
               aria-label={`Afficher période ${range === 'day' ? 'journalière' : range === 'week' ? 'hebdomadaire' : range === 'month' ? 'mensuelle' : 'annuelle'}`}
               aria-pressed={timeRange === range}
               className={`px-4 py-2 text-xs font-bold uppercase rounded-lg transition-all ${timeRange === range ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
             >
               {range === 'day' ? 'Jour' : range === 'week' ? 'Hebdo' : range === 'month' ? 'Mois' : 'Annuel'}
             </button>
           ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         {/* Income */}
         <button
            onClick={() => setDetailModal('income')}
            className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all text-left w-full cursor-pointer"
         >
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <TrendingUp size={ICON_SIZES.xlarge} className="text-emerald-600" />
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Entrées (Provisions)</p>
            <h3 className="text-2xl font-bold text-slate-900">{formatGNF(totals.income)}</h3>
            <div className="mt-2 flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded">
               <ArrowUpRight size={ICON_SIZES.small} className="mr-1" /> Cliquez pour détails
            </div>
         </button>

         {/* Expense */}
         <button
            onClick={() => setDetailModal('expense')}
            className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all text-left w-full cursor-pointer"
         >
            <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <TrendingDown size={ICON_SIZES.xlarge} className="text-red-600" />
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Sorties (Débours)</p>
            <h3 className="text-2xl font-bold text-slate-900">{formatGNF(totals.expense)}</h3>
            <div className="mt-2 flex items-center text-xs font-medium text-red-600 bg-red-50 w-fit px-2 py-1 rounded">
               <ArrowDownRight size={ICON_SIZES.small} className="mr-1" /> Cliquez pour détails
            </div>
         </button>

         {/* Balance */}
         <button
            onClick={() => setDetailModal('balance')}
            className="bg-slate-900 p-5 rounded-2xl text-white shadow-lg shadow-slate-900/20 relative overflow-hidden hover:shadow-xl transition-all text-left w-full cursor-pointer"
         >
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500 rounded-full blur-2xl opacity-20"></div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Bilan Net (Trésorerie)</p>
            <h3 className={`text-3xl font-bold tracking-tight ${totals.balance < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
               {totals.balance > 0 ? '+' : ''}{formatGNF(totals.balance)}
            </h3>
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
               <Wallet size={ICON_SIZES.tiny} /> Cliquez pour détails
            </p>
         </button>
      </div>

      {/* Charts */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-80">
         <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Évolution Financière</h3>
            <button 
              onClick={exportToPDF}
              disabled={isExporting}
              className={`text-xs flex items-center gap-1 ${isExporting ? 'text-slate-300 cursor-wait' : 'text-slate-500 hover:text-blue-600'}`}
              aria-label="Exporter le rapport en PDF"
            >
               <Download size={ICON_SIZES.small} className={isExporting ? 'animate-bounce' : ''} /> 
               {isExporting ? 'Génération...' : 'Export Rapport'}
            </button>
         </div>
         <div ref={chartRef} style={{ width: '100%', height: '400px', minHeight: '400px' }}>
         {chartData.length > 0 ? (
         <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
               <defs>
                  <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                     <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                     <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
               </defs>
               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
               <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} />
               <YAxis hide />
               <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}
                  formatter={(value: number, name: string) => {
                    const safeName = DOMPurify.sanitize(name);
                    return [formatGNF(value), safeName];
                  }}
                  labelFormatter={(label) => DOMPurify.sanitize(String(label))}
               />
               <Area type="monotone" dataKey="in" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIn)" name="Entrées" />
               <Area type="monotone" dataKey="out" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorOut)" name="Sorties" />
            </AreaChart>
         </ResponsiveContainer>
         ) : (
           <div className="flex items-center justify-center h-full text-slate-400 text-sm">
             Aucune donnée à afficher
           </div>
         )}
         </div>
      </div>

      {/* Transaction Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
               <Filter size={ICON_SIZES.medium} /> Journal des Opérations
            </h3>
            <span className="text-xs font-bold text-slate-400">{filteredData.length} écritures</span>
         </div>
         <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {filteredData.length === 0 ? (
               <div className="p-8 text-center text-slate-400 text-sm">Aucune opération sur cette période.</div>
            ) : (
               filteredData.map((t, idx) => (
                  <div key={`${t.id}-${idx}`} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                     <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.type === 'PROVISION' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                           {t.type === 'PROVISION' ? <ArrowUpRight size={ICON_SIZES.large} /> : <ArrowDownRight size={ICON_SIZES.large} />}
                        </div>
                        <div>
                           <p className="font-bold text-slate-800 text-sm">{t.description}</p>
                           <p className="text-xs text-slate-400 mt-0.5">
                              {formatDateInConakry(t.dateObj, 'date')} • {t.shipmentRef} • <span className="uppercase font-semibold">{t.category}</span>
                           </p>
                        </div>
                     </div>
                     <div className="text-right">
                        <span className={`block font-bold text-sm ${t.type === 'PROVISION' ? 'text-emerald-600' : 'text-slate-900'}`}>
                           {t.type === 'PROVISION' ? '+' : '-'}{formatGNF(t.amount)}
                        </span>
                        {t.client && <span className="text-[10px] text-slate-400 font-medium truncate max-w-[100px] block">{t.client}</span>}
                     </div>
                  </div>
               ))
            )}
         </div>
      </div>

      {/* Modal de détails */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className={`p-6 border-b ${detailModal === 'income' ? 'bg-emerald-50 border-emerald-100' : detailModal === 'expense' ? 'bg-red-50 border-red-100' : 'bg-slate-900 text-white border-slate-800'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {detailModal === 'income' && <TrendingUp className="text-emerald-600" size={32} />}
                  {detailModal === 'expense' && <TrendingDown className="text-red-600" size={32} />}
                  {detailModal === 'balance' && <Wallet className="text-white" size={32} />}
                  <div>
                    <h3 className="text-xl font-bold">
                      {detailModal === 'income' && 'Entrées (Provisions)'}
                      {detailModal === 'expense' && 'Sorties (Débours)'}
                      {detailModal === 'balance' && 'Bilan Net (Trésorerie)'}
                    </h3>
                    <p className={`text-sm ${detailModal === 'balance' ? 'text-slate-400' : 'text-slate-600'}`}>
                      Période: {timeRange === 'day' ? 'Journalière' : timeRange === 'week' ? 'Hebdomadaire' : timeRange === 'month' ? 'Mensuelle' : 'Annuelle'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setDetailModal(null)} className={`p-2 rounded-lg transition-colors ${detailModal === 'balance' ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Résumé */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-4">
                  {detailModal === 'income' && (
                    <>
                      <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Total Provisions</p>
                        <p className="text-2xl font-bold text-emerald-600">{formatGNF(totals.income)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Transactions</p>
                        <p className="text-2xl font-bold text-slate-900">{filteredData.filter(t => t.type === 'PROVISION').length}</p>
                      </div>
                    </>
                  )}
                  {detailModal === 'expense' && (
                    <>
                      <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Total Débours</p>
                        <p className="text-2xl font-bold text-red-600">{formatGNF(totals.expense)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium mb-1">Transactions</p>
                        <p className="text-2xl font-bold text-slate-900">{filteredData.filter(t => t.type === 'DISBURSEMENT' || t.type === 'FEE').length}</p>
                      </div>
                    </>
                  )}
                  {detailModal === 'balance' && (
                    <>
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-1">Solde Net</p>
                        <p className={`text-2xl font-bold ${totals.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {totals.balance > 0 ? '+' : ''}{formatGNF(totals.balance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-1">Marge</p>
                        <p className="text-2xl font-bold text-white">
                          {totals.income > 0 ? ((totals.balance / totals.income) * 100).toFixed(1) : '0'}%
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Par catégorie */}
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <PieChart size={16} /> Répartition par catégorie
                </h4>
                <div className="space-y-2">
                  {['Douane', 'Port', 'Logistique', 'Agence', 'Autre'].map(category => {
                    const transactions = filteredData.filter(t => 
                      t.category === category && 
                      t.paid && 
                      (detailModal === 'income' ? t.type === 'PROVISION' : 
                       detailModal === 'expense' ? (t.type === 'DISBURSEMENT' || t.type === 'FEE') : true)
                    );
                    const total = transactions.reduce((sum, t) => sum + t.amount, 0);
                    const percentage = detailModal === 'income' 
                      ? totals.income > 0 ? (total / totals.income) * 100 : 0
                      : detailModal === 'expense'
                      ? totals.expense > 0 ? (total / totals.expense) * 100 : 0
                      : (totals.income + totals.expense) > 0 ? (total / (totals.income + totals.expense)) * 100 : 0;

                    if (transactions.length === 0) return null;

                    return (
                      <div key={category} className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-700">{category}</span>
                            <span className="text-xs font-bold text-slate-900">{formatGNF(total)}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${detailModal === 'income' ? 'bg-emerald-500' : detailModal === 'expense' ? 'bg-red-500' : 'bg-blue-500'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-slate-500 font-medium w-12 text-right">{percentage.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Liste des transactions */}
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <FileText size={16} /> Transactions détaillées
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredData
                    .filter(t => 
                      t.paid && (
                        detailModal === 'income' ? t.type === 'PROVISION' :
                        detailModal === 'expense' ? (t.type === 'DISBURSEMENT' || t.type === 'FEE') : true
                      )
                    )
                    .map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-3">
                          {t.paid ? (
                            <CheckCircle size={16} className="text-emerald-600" />
                          ) : (
                            <AlertCircle size={16} className="text-amber-600" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-slate-900">{t.description}</p>
                            <p className="text-xs text-slate-500">
                              {formatDateInConakry(t.dateObj, 'date')} • {t.shipmentRef} • {t.category}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${t.type === 'PROVISION' ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {t.type === 'PROVISION' ? '+' : '-'}{formatGNF(t.amount)}
                          </p>
                          {t.client && <p className="text-xs text-slate-400">{t.client}</p>}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
