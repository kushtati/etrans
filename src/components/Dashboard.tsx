import React, { useState, useMemo, useRef } from 'react';
import { Role, ShipmentStatus, Shipment } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { useShipments, useAuth } from '../hooks/useTransitSelectors';
import { 
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { Ship, AlertCircle, Clock, ArrowRight, Package, TrendingUp, Plus, Archive, History, CheckCircle2, Lock, X, Search, Filter, Download, Calendar, DollarSign, FileText, User, Truck, MapPin, Eye } from 'lucide-react';

// Constants
const TRAFFIC_LIGHT_THRESHOLDS = {
  GREEN_DAYS: 5,    // Plus de 5 jours = vert
  ORANGE_DAYS: 1,   // 1-5 jours = orange
  RED_DAYS: 0       // 0 ou moins = rouge
} as const;

const CLICK_THROTTLE_MS = 300;

interface DashboardProps {
  onViewShipment: (id: string) => void;
  onCreateShipment: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onViewShipment, onCreateShipment }) => {
  // ✅ OPTIMISÉ: Hooks sélecteurs pour re-renders minimaux
  const shipments = useShipments(); // Re-render seulement si liste change
  const { role } = useAuth(); // Re-render seulement si role change
  const { canViewFinance, canEditShipments, canCreate } = usePermissions();
  const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');
  const lastClickTimeRef = useRef<number>(0);
  
  // Modal state for "Dossiers en cours"
  const [showDossiersModal, setShowDossiersModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ShipmentStatus | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'date' | 'client' | 'status'>('date');

  // Modal state for "Bloqués"
  const [showBloquesModal, setShowBloquesModal] = useState(false);
  const [searchTermBloques, setSearchTermBloques] = useState('');
  const [filterStatusBloques, setFilterStatusBloques] = useState<ShipmentStatus | 'ALL'>('ALL');
  const [sortByBloques, setSortByBloques] = useState<'date' | 'client' | 'status'>('date');

  // Modal state for "Sortie Port"
  const [showSortiePortModal, setShowSortiePortModal] = useState(false);
  const [searchTermSortiePort, setSearchTermSortiePort] = useState('');
  const [filterStatusSortiePort, setFilterStatusSortiePort] = useState<ShipmentStatus | 'ALL'>('ALL');
  const [sortBySortiePort, setSortBySortiePort] = useState<'date' | 'client' | 'status'>('date');

  // Export functionality with CSV injection protection
  const handleExportCSV = () => {
    if (filteredDossiers.length === 0) {
      alert('Aucun dossier à exporter');
      return;
    }

    // CSV sanitization: escape formula injection
    const sanitizeCSV = (value: string | number): string => {
      const str = String(value);
      // Escape =+-@ at start (CSV injection)
      if (str.match(/^[=+\-@]/)) {
        return "'" + str;
      }
      return str;
    };

    // CSV Headers
    const headers = [
      'N° Tracking',
      'Client',
      'N° BL',
      'Description',
      'Statut',
      'Date d\'arrivée',
      'Feu tricolore',
      'Total facturé',
      'Payé',
      'Solde',
      'Alertes'
    ];

    // CSV Rows with sanitization
    const rows = filteredDossiers.map(dossier => {
      const totalFacture = (dossier.expenses || [])
        .filter(e => e.type === 'REVENUE')
        .reduce((sum, e) => sum + e.amount, 0);
      const totalPaye = (dossier.expenses || [])
        .filter(e => e.type === 'REVENUE' && e.paid)
        .reduce((sum, e) => sum + e.amount, 0);
      const solde = totalFacture - totalPaye;
      const trafficLight = getTrafficLight(dossier);
      const alertes = (dossier.alerts || []).join('; ');
      
      return [
        sanitizeCSV(dossier.trackingNumber),
        sanitizeCSV(dossier.clientName),
        sanitizeCSV(dossier.blNumber),
        sanitizeCSV(dossier.description || ''),
        sanitizeCSV(getStatusLabel(dossier.status)),
        dossier.arrivalDate ? new Date(dossier.arrivalDate).toLocaleDateString('fr-FR') : '',
        trafficLight === 'green' ? 'Vert' : trafficLight === 'orange' ? 'Orange' : trafficLight === 'red' ? 'Rouge' : 'Gris',
        `${totalFacture.toLocaleString('fr-FR')} GNF`,
        `${totalPaye.toLocaleString('fr-FR')} GNF`,
        `${solde.toLocaleString('fr-FR')} GNF`,
        sanitizeCSV(alertes)
      ];
    });

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create Blob and download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `dossiers-en-cours-${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusLabel = (status: ShipmentStatus): string => {
    const labels: Record<ShipmentStatus, string> = {
      [ShipmentStatus.IN_TRANSIT]: 'En transit',
      [ShipmentStatus.AT_CUSTOMS]: 'À la douane',
      [ShipmentStatus.CUSTOMS_EXAM]: 'Examen douanier',
      [ShipmentStatus.PENDING_DOCS]: 'Documents en attente',
      [ShipmentStatus.PAYMENT_PENDING]: 'Paiement en attente',
      [ShipmentStatus.BAE_GRANTED]: 'BAE accordé',
      [ShipmentStatus.PORT_EXIT]: 'Sortie du port',
      [ShipmentStatus.DELIVERED]: 'Livré',
      [ShipmentStatus.CANCELLED]: 'Annulé'
    };
    return labels[status] || status;
  };

  // Filter logic for Archive vs Active
  const activeList = shipments.filter(s => s.status !== ShipmentStatus.DELIVERED);
  const archiveList = shipments.filter(s => s.status === ShipmentStatus.DELIVERED);
  
  const displayList = viewMode === 'active' ? activeList : archiveList;

  // Normalize date to Africa/Conakry timezone
  const normalizeDateToConakry = (date: Date): Date => {
    return new Date(date.toLocaleString('en-US', { timeZone: 'Africa/Conakry' }));
  };

  // Calculate shipment balance with validation
  const calculateShipmentBalance = (expenses: any[]): number => {
    return expenses.reduce((acc, e) => {
      if (typeof e.amount !== 'number' || isNaN(e.amount) || !isFinite(e.amount)) {
        logger.warn('Invalid expense amount detected', { expense: e });
        return acc; // Skip invalid amount (graceful degradation)
      }
      
      if (e.type === 'PROVISION') return acc + e.amount;
      if (e.type === 'DISBURSEMENT') return acc - e.amount;
      return acc;
    }, 0);
  };

  // Format date in Conakry timezone
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: '2-digit',
        timeZone: 'Africa/Conakry'
      });
    } catch (e) {
      logger.warn('Invalid date format', { dateString });
      return 'Date invalide';
    }
  };

  // Throttled click handler
  const handleShipmentClick = (shipmentId: string) => {
    const now = Date.now();
    if (now - lastClickTimeRef.current < CLICK_THROTTLE_MS) {
      return; // Ignore rapid clicks
    }
    lastClickTimeRef.current = now;
    onViewShipment(shipmentId);
  };

  // DG KPIs Logic - Optimized with single array pass
  const { ddi: ddiCount, blocked: blockedCount, readyForExit: readyForExitCount, dossiersEnCours, dossiersBloques, dossiersSortiePort } = useMemo(() => {
    const enCours: Shipment[] = [];
    const bloques: Shipment[] = [];
    const sortiePort: Shipment[] = [];
    const result = shipments.reduce((acc, s) => {
      if (s.status !== ShipmentStatus.DELIVERED) {
        acc.ddi++;
        enCours.push(s);
      }
      if (s.alerts && Array.isArray(s.alerts) && s.alerts.length > 0) {
        acc.blocked++;
        bloques.push(s);
      }
      if (s.status === ShipmentStatus.BAE_GRANTED || s.status === ShipmentStatus.PORT_EXIT) {
        acc.readyForExit++;
        sortiePort.push(s);
      }
      return acc;
    }, { ddi: 0, blocked: 0, readyForExit: 0 });
    return { ...result, dossiersEnCours: enCours, dossiersBloques: bloques, dossiersSortiePort: sortiePort };
  }, [shipments]);

  // Filtered and sorted dossiers for modal
  const filteredDossiers = useMemo(() => {
    let filtered = dossiersEnCours;
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(d => 
        d.trackingNumber.toLowerCase().includes(term) ||
        d.clientName.toLowerCase().includes(term) ||
        d.blNumber.toLowerCase().includes(term) ||
        d.description.toLowerCase().includes(term)
      );
    }
    
    // Status filter
    if (filterStatus !== 'ALL') {
      filtered = filtered.filter(d => d.status === filterStatus);
    }
    
    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.eta || b.arrivalDate || '').getTime() - new Date(a.eta || a.arrivalDate || '').getTime();
      } else if (sortBy === 'client') {
        return a.clientName.localeCompare(b.clientName);
      } else {
        return a.status.localeCompare(b.status);
      }
    });
    
    return filtered;
  }, [dossiersEnCours, searchTerm, filterStatus, sortBy]);

  // Filtered and sorted bloqués for modal
  // Filtrage et tri pour "Sortie Port"
  const filteredSortiePort = useMemo(() => {
    let filtered = dossiersSortiePort;
    
    // Recherche
    if (searchTermSortiePort.trim()) {
      const term = searchTermSortiePort.toLowerCase();
      filtered = filtered.filter(d => 
        d.trackingNumber.toLowerCase().includes(term) ||
        d.clientName.toLowerCase().includes(term) ||
        d.blNumber.toLowerCase().includes(term) ||
        (d.description && d.description.toLowerCase().includes(term)) ||
        (d.destination && d.destination.toLowerCase().includes(term)) ||
        (d.deliveryInfo?.driverName && d.deliveryInfo.driverName.toLowerCase().includes(term)) ||
        (d.deliveryInfo?.recipientName && d.deliveryInfo.recipientName.toLowerCase().includes(term))
      );
    }

    // Filtre par statut
    if (filterStatusSortiePort !== 'ALL') {
      filtered = filtered.filter(d => d.status === filterStatusSortiePort);
    }

    // Tri
    filtered = [...filtered].sort((a, b) => {
      if (sortBySortiePort === 'date') {
        return new Date(b.arrivalDate || b.eta).getTime() - new Date(a.arrivalDate || a.eta).getTime();
      } else if (sortBySortiePort === 'client') {
        return a.clientName.localeCompare(b.clientName);
      } else {
        return a.status.localeCompare(b.status);
      }
    });

    return filtered;
  }, [dossiersSortiePort, searchTermSortiePort, filterStatusSortiePort, sortBySortiePort]);

  const filteredBloques = useMemo(() => {
    let filtered = dossiersBloques;
    
    // Search filter
    if (searchTermBloques) {
      const term = searchTermBloques.toLowerCase();
      filtered = filtered.filter(d => 
        d.trackingNumber.toLowerCase().includes(term) ||
        d.clientName.toLowerCase().includes(term) ||
        d.blNumber.toLowerCase().includes(term) ||
        d.description.toLowerCase().includes(term)
      );
    }
    
    // Status filter
    if (filterStatusBloques !== 'ALL') {
      filtered = filtered.filter(d => d.status === filterStatusBloques);
    }
    
    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (sortByBloques === 'date') {
        return new Date(b.eta || b.arrivalDate || '').getTime() - new Date(a.eta || a.arrivalDate || '').getTime();
      } else if (sortByBloques === 'client') {
        return a.clientName.localeCompare(b.clientName);
      } else {
        return a.status.localeCompare(b.status);
      }
    });
    
    return filtered;
  }, [dossiersBloques, searchTermBloques, filterStatusBloques, sortByBloques]);

  // Chart data with memoization and validation
  // Données financières pour le mini-graphique
  const financialChartData = useMemo(() => {
    if (!shipments || shipments.length === 0) return [];
    
    // Calculer provisions et dépenses par dossier (top 5)
    return shipments
      .slice(0, 5)
      .map(s => {
        const totalProvisions = (s.expenses || [])
          .filter(e => e.type === 'PROVISION' && e.paid)
          .reduce((sum, e) => sum + e.amount, 0);
        
        const totalDisbursements = (s.expenses || [])
          .filter(e => (e.type === 'DISBURSEMENT' || e.type === 'FEE') && e.paid)
          .reduce((sum, e) => sum + e.amount, 0);
        
        return {
          name: s.trackingNumber.substring(0, 8),
          solde: totalProvisions - totalDisbursements
        };
      })
      .filter(item => item.solde !== 0);
  }, [shipments]);

  const getTrafficLight = (shipment: Shipment): 'green' | 'orange' | 'red' | 'gray' => {
    if (shipment.status === ShipmentStatus.DELIVERED) return 'gray';
    if (!shipment.arrivalDate) return 'gray'; 
    
    const arrival = normalizeDateToConakry(new Date(shipment.arrivalDate));
    const today = normalizeDateToConakry(new Date());
    
    // Reset time to midnight for accurate day calculation
    arrival.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const daysAtPort = Math.floor((today.getTime() - arrival.getTime()) / (1000 * 3600 * 24));
    const remainingFreeDays = shipment.freeDays - daysAtPort;
    
    if (remainingFreeDays > TRAFFIC_LIGHT_THRESHOLDS.GREEN_DAYS) return 'green';
    if (remainingFreeDays > TRAFFIC_LIGHT_THRESHOLDS.ORANGE_DAYS) return 'orange';
    return 'red';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Welcome Section */}
      <div className="flex justify-between items-end pb-2 border-b border-slate-200 mb-2">
         <div>
            <h2 className="text-2xl font-bold text-slate-900">Vue d'ensemble</h2>
         </div>
      </div>

      {/* DG DASHBOARD SPECIFIC KPIs */}
      {canViewFinance && (
        <div className="grid grid-cols-3 gap-3">
            <div 
              onClick={() => setShowDossiersModal(true)}
              className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center cursor-pointer hover:shadow-lg hover:border-orange-300 transition-all group"
            >
               <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform"><Package size={16}/></div>
               <span className="block text-2xl font-bold text-slate-900">{ddiCount}</span>
               <span className="text-[10px] font-bold text-slate-400 uppercase">Dossiers en cours</span>
               <div className="text-[9px] text-orange-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Cliquez pour détails</div>
            </div>
            <div 
              onClick={() => setShowBloquesModal(true)}
              className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center cursor-pointer hover:shadow-lg hover:border-red-300 transition-all group"
            >
               <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform"><AlertCircle size={16}/></div>
               <span className="block text-2xl font-bold text-slate-900">{blockedCount}</span>
               <span className="text-[10px] font-bold text-slate-400 uppercase">Bloqués</span>
               <div className="text-[9px] text-red-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Cliquez pour détails</div>
            </div>
            <div 
              onClick={() => setShowSortiePortModal(true)}
              className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center cursor-pointer hover:shadow-lg hover:border-emerald-300 transition-all group"
            >
               <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform"><CheckCircle2 size={16}/></div>
               <span className="block text-2xl font-bold text-slate-900">{readyForExitCount}</span>
               <span className="text-[10px] font-bold text-slate-400 uppercase">Sortie Port</span>
               <div className="text-[9px] text-emerald-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Cliquez pour détails</div>
            </div>
        </div>
      )}

      {/* Action Button for Creators */}
      {canCreate && viewMode === 'active' && (
        <button 
          onClick={onCreateShipment}
          aria-label="Créer un nouveau dossier d'importation"
          className="w-full bg-slate-900 text-white p-4 rounded-xl shadow-lg shadow-slate-900/20 flex items-center justify-between group hover:bg-slate-800 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
               <Plus size={20} className="text-white" />
            </div>
            <div className="text-left">
               <span className="block font-bold text-sm">Nouveau Dossier</span>
               <span className="block text-xs text-slate-400">Ouverture et Enregistrement</span>
            </div>
          </div>
          <ArrowRight size={18} className="text-slate-400 group-hover:text-white transition-colors" />
        </button>
      )}

      {/* Financial Chart Mini (Director/Accountant) */}
      {canViewFinance && (
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <div className="mb-4 flex justify-between items-center">
             <h3 className="font-bold text-slate-800 text-sm">Flux Financiers</h3>
             <span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-500">Temps Réel</span>
          </div>
          <div className="h-32 w-full" style={{ minHeight: '128px' }}>
            {financialChartData && financialChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialChartData} barSize={20}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} dy={5} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '4px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px'}}
                />
                <Bar dataKey="solde" radius={[2, 2, 2, 2]}>
                  {financialChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.solde < 0 ? '#ef4444' : '#0f172a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                Aucune donnée financière
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shipment List Section with Archive Toggle */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
           <div className="flex gap-4">
             <button 
               onClick={() => setViewMode('active')}
               aria-label="Afficher les dossiers en cours"
               aria-pressed={viewMode === 'active'}
               className={`text-xs font-bold uppercase tracking-wide pb-1 border-b-2 transition-all ${viewMode === 'active' ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
             >
               En cours
             </button>
             <button 
               onClick={() => setViewMode('archive')}
               aria-label="Afficher l'historique des dossiers"
               aria-pressed={viewMode === 'archive'}
               className={`text-xs font-bold uppercase tracking-wide pb-1 border-b-2 transition-all ${viewMode === 'archive' ? 'text-slate-900 border-slate-900' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
             >
               Historique
             </button>
           </div>
           <span className="text-xs font-bold text-slate-400">{displayList.length} dossiers</span>
        </div>
        
        <div className="divide-y divide-slate-100">
          {displayList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
               {viewMode === 'active' ? "Aucun dossier en cours." : "Aucun dossier archivé."}
            </div>
          ) : (
            displayList.map(shipment => {
              const light = getTrafficLight(shipment);
              return (
                <div 
                  key={shipment.id}
                  onClick={() => handleShipmentClick(shipment.id)}
                  role="button"
                  tabIndex={0}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleShipmentClick(shipment.id);
                    }
                  }}
                  aria-label={`Voir détails du dossier ${shipment.trackingNumber}`}
                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-4">
                    {/* Status Indicator */}
                    <div className={`w-1.5 h-10 rounded-full ${light === 'green' ? 'bg-emerald-500' : light === 'orange' ? 'bg-orange-400' : light === 'red' ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                    
                    <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 text-sm bg-slate-100 px-1.5 rounded">{shipment.trackingNumber}</span>
                          {viewMode === 'archive' && <Archive size={12} className="text-slate-400" />}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 font-medium">{shipment.clientName} • {shipment.blNumber}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                        {shipment.status}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-medium">
                        {shipment.eta ? `ETA: ${formatDate(shipment.eta)}` : 'Pas de date'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL: Dossiers en cours détaillés */}
      {showDossiersModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-slideUp">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-orange-50 to-amber-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Package size={24}/>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Dossiers en Cours</h2>
                  <p className="text-sm text-slate-600">{filteredDossiers.length} dossier{filteredDossiers.length > 1 ? 's' : ''} actif{filteredDossiers.length > 1 ? 's' : ''}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDossiersModal(false)}
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X size={20} className="text-slate-600"/>
              </button>
            </div>

            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex flex-wrap gap-3">
                {/* Search */}
                <div className="flex-1 min-w-[200px] relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input
                    type="text"
                    placeholder="Rechercher par N°, client, BL..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as ShipmentStatus | 'ALL')}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value={ShipmentStatus.OPENED}>Ouvert</option>
                  <option value={ShipmentStatus.PRE_CLEARANCE}>Pré-Dédouanement</option>
                  <option value={ShipmentStatus.CUSTOMS_LIQUIDATION}>Liquidation</option>
                  <option value={ShipmentStatus.LIQUIDATION_PAID}>Liquidation Payée</option>
                  <option value={ShipmentStatus.BAE_GRANTED}>BAE Obtenu</option>
                  <option value={ShipmentStatus.PORT_EXIT}>Sortie Port</option>
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'client' | 'status')}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                >
                  <option value="date">Trier par date</option>
                  <option value="client">Trier par client</option>
                  <option value="status">Trier par statut</option>
                </select>

                {/* Export */}
                <button 
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
                >
                  <Download size={16}/>
                  Exporter
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredDossiers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Package size={64} className="mb-4 opacity-20"/>
                  <p className="text-lg font-medium">Aucun dossier trouvé</p>
                  <p className="text-sm">Essayez de modifier vos filtres de recherche</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredDossiers.map((dossier) => {
                    const light = getTrafficLight(dossier);
                    const balance = calculateShipmentBalance(dossier.expenses || []);
                    const totalProvisions = dossier.expenses?.filter(e => e.type === 'PROVISION').reduce((acc, e) => acc + e.amount, 0) || 0;
                    const totalDisbursements = dossier.expenses?.filter(e => e.type === 'DISBURSEMENT').reduce((acc, e) => acc + e.amount, 0) || 0;
                    
                    return (
                      <div 
                        key={dossier.id}
                        className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-all"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-16 rounded-full ${light === 'green' ? 'bg-emerald-500' : light === 'orange' ? 'bg-orange-400' : light === 'red' ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono font-bold text-lg text-slate-900">{dossier.trackingNumber}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  dossier.status === ShipmentStatus.BAE_GRANTED ? 'bg-emerald-100 text-emerald-700' :
                                  dossier.status === ShipmentStatus.PORT_EXIT ? 'bg-blue-100 text-blue-700' :
                                  'bg-orange-100 text-orange-700'
                                }`}>
                                  {dossier.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-slate-600">
                                <div className="flex items-center gap-1">
                                  <User size={14}/>
                                  <span>{dossier.clientName}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <FileText size={14}/>
                                  <span>BL: {dossier.blNumber}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Truck size={14}/>
                                  <span>{dossier.shippingLine}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => {
                              setShowDossiersModal(false);
                              onViewShipment(dossier.id);
                            }}
                            className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors flex items-center gap-2"
                          >
                            <Eye size={16}/>
                            Voir détails
                          </button>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-4">
                          <div className="bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                              <Package size={12}/>
                              <span>Marchandise</span>
                            </div>
                            <p className="font-bold text-slate-900 text-sm">{dossier.commodityType}</p>
                            <p className="text-xs text-slate-500 truncate">{dossier.description}</p>
                          </div>

                          <div className="bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                              <MapPin size={12}/>
                              <span>Origine</span>
                            </div>
                            <p className="font-bold text-slate-900 text-sm">{dossier.origin}</p>
                            <p className="text-xs text-slate-500">→ {dossier.destination}</p>
                          </div>

                          <div className="bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                              <Calendar size={12}/>
                              <span>ETA</span>
                            </div>
                            <p className="font-bold text-slate-900 text-sm">{dossier.eta ? formatDate(dossier.eta) : 'N/A'}</p>
                            <p className="text-xs text-slate-500">Jours libres: {dossier.freeDays}</p>
                          </div>

                          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-3 border border-orange-200">
                            <div className="flex items-center gap-2 text-xs text-orange-700 mb-1">
                              <DollarSign size={12}/>
                              <span>Solde</span>
                            </div>
                            <p className={`font-bold text-lg ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {balance.toLocaleString('fr-GN')} GNF
                            </p>
                            <div className="flex gap-2 text-xs mt-1">
                              <span className="text-emerald-600">↓ {totalProvisions.toLocaleString()}</span>
                              <span className="text-red-600">↑ {totalDisbursements.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {dossier.alerts && dossier.alerts.length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-2">
                              <AlertCircle size={14}/>
                              <span>Alertes ({dossier.alerts.length})</span>
                            </div>
                            <div className="space-y-1">
                              {dossier.alerts.slice(0, 2).map((alert, idx) => (
                                <p key={idx} className="text-xs text-red-600">• {alert}</p>
                              ))}
                              {dossier.alerts.length > 2 && (
                                <p className="text-xs text-red-500 font-medium">+ {dossier.alerts.length - 2} autre(s)</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Stats */}
            <div className="p-4 border-t border-slate-200 bg-slate-50">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{filteredDossiers.length}</p>
                  <p className="text-xs text-slate-600">Dossiers</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600">
                    {filteredDossiers.filter(d => getTrafficLight(d) === 'green').length}
                  </p>
                  <p className="text-xs text-slate-600">En règle</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">
                    {filteredDossiers.filter(d => getTrafficLight(d) === 'orange').length}
                  </p>
                  <p className="text-xs text-slate-600">Attention</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">
                    {filteredDossiers.filter(d => getTrafficLight(d) === 'red').length}
                  </p>
                  <p className="text-xs text-slate-600">Urgence</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Sortie Port - Ultra-détaillé avec infos de livraison */}
      {showSortiePortModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] flex flex-col animate-slideUp">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Dossiers Prêts pour Sortie Port</h2>
                  <p className="text-xs text-slate-500 mt-0.5">BAE Obtenu & Sortie Port • Suivi Livraison Complet</p>
                </div>
                <span className="ml-4 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
                  {filteredSortiePort.length} dossier{filteredSortiePort.length > 1 ? 's' : ''}
                </span>
              </div>
              <button 
                onClick={() => setShowSortiePortModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="flex-1 min-w-[200px] relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher (N°, client, BL, destination, chauffeur, destinataire...)"
                  value={searchTermSortiePort}
                  onChange={(e) => setSearchTermSortiePort(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              {/* Filter */}
              <select
                value={filterStatusSortiePort}
                onChange={(e) => setFilterStatusSortiePort(e.target.value as ShipmentStatus | 'ALL')}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
              >
                <option value="ALL">Tous les statuts</option>
                <option value={ShipmentStatus.BAE_GRANTED}>BAE Obtenu</option>
                <option value={ShipmentStatus.PORT_EXIT}>Sortie Port</option>
              </select>

              {/* Sort */}
              <select
                value={sortBySortiePort}
                onChange={(e) => setSortBySortiePort(e.target.value as 'date' | 'client' | 'status')}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
              >
                <option value="date">Trier par date</option>
                <option value="client">Trier par client</option>
                <option value="status">Trier par statut</option>
              </select>

              {/* Export CSV */}
              <button
                onClick={() => {
                  if (filteredSortiePort.length === 0) {
                    alert('Aucun dossier à exporter');
                    return;
                  }
                  const headers = ['N° Tracking', 'Client', 'N° BL', 'Description', 'Statut', "Date d'arrivée", 'Destination', 'Chauffeur', 'Camion', 'Destinataire', 'Date livraison', 'Reçu par client', 'Total facturé', 'Payé', 'Solde', 'Alertes'];
                  const rows = filteredSortiePort.map(d => {
                    const totalFacture = (d.expenses || []).filter(e => e.type === 'REVENUE').reduce((sum, e) => sum + e.amount, 0);
                    const totalPaye = (d.expenses || []).filter(e => e.type === 'REVENUE' && e.paid).reduce((sum, e) => sum + e.amount, 0);
                    const solde = totalFacture - totalPaye;
                    const alertes = (d.alerts || []).join('; ');
                    const destination = d.destination || 'N/A';
                    const chauffeur = d.deliveryInfo?.driverName || 'Non assigné';
                    const camion = d.deliveryInfo?.truckPlate || 'N/A';
                    const destinataire = d.deliveryInfo?.recipientName || 'Non spécifié';
                    const dateLivraison = d.deliveryInfo?.deliveryDate ? new Date(d.deliveryInfo.deliveryDate).toLocaleDateString('fr-FR') : 'Non planifiée';
                    const recuParClient = d.status === ShipmentStatus.DELIVERED ? 'Oui' : d.status === ShipmentStatus.PORT_EXIT ? 'En cours' : 'Non';
                    return [d.trackingNumber, d.clientName, d.blNumber, d.description || '', getStatusLabel(d.status), d.arrivalDate ? new Date(d.arrivalDate).toLocaleDateString('fr-FR') : '', destination, chauffeur, camion, destinataire, dateLivraison, recuParClient, `${totalFacture.toLocaleString('fr-FR')} GNF`, `${totalPaye.toLocaleString('fr-FR')} GNF`, `${solde.toLocaleString('fr-FR')} GNF`, alertes];
                  });
                  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `&quot;${c}&quot;`).join(','))].join('\\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `sortie-port-${new Date().toISOString().split('T')[0]}.csv`;
                  link.click();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
              >
                <Download size={16} />
                Exporter
              </button>
            </div>

            {/* Content - Grid of Cards */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredSortiePort.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} className="text-slate-400" />
                  </div>
                  <p className="text-slate-500 font-medium">Aucun dossier trouvé</p>
                  <p className="text-slate-400 text-sm mt-1">Ajustez vos filtres de recherche</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSortiePort.map((dossier, index) => {
                    const totalFacture = (dossier.expenses || []).filter(e => e.type === 'REVENUE').reduce((sum, e) => sum + e.amount, 0);
                    const totalPaye = (dossier.expenses || []).filter(e => e.type === 'REVENUE' && e.paid).reduce((sum, e) => sum + e.amount, 0);
                    const solde = totalFacture - totalPaye;
                    const trafficLight = getTrafficLight(dossier);
                    const hasDeliveryInfo = !!dossier.deliveryInfo;
                    const isDelivered = dossier.status === ShipmentStatus.DELIVERED;
                    
                    return (
                      <div 
                        key={dossier.id}
                        className="bg-white border-2 border-slate-200 rounded-xl p-4 hover:shadow-lg transition-all hover:border-emerald-300"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {/* Header avec feu tricolore */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              trafficLight === 'green' ? 'bg-green-500 animate-pulse' :
                              trafficLight === 'orange' ? 'bg-orange-500 animate-pulse' :
                              trafficLight === 'red' ? 'bg-red-500 animate-pulse' : 'bg-slate-300'
                            }`} />
                            <div>
                              <h3 className="font-bold text-slate-900 text-sm">{dossier.trackingNumber}</h3>
                              <p className="text-xs text-slate-500">{dossier.clientName}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                            dossier.status === ShipmentStatus.BAE_GRANTED ? 'bg-blue-100 text-blue-700' :
                            dossier.status === ShipmentStatus.PORT_EXIT ? 'bg-emerald-100 text-emerald-700' : 
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {getStatusLabel(dossier.status)}
                          </span>
                        </div>

                        {/* Infos principales */}
                        <div className="space-y-2 mb-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-2 text-xs">
                            <FileText size={14} className="text-slate-400" />
                            <span className="text-slate-600">BL:</span>
                            <span className="font-medium text-slate-900">{dossier.blNumber}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <Calendar size={14} className="text-slate-400" />
                            <span className="text-slate-600">Arrivée:</span>
                            <span className="text-slate-900">{dossier.arrivalDate ? new Date(dossier.arrivalDate).toLocaleDateString('fr-FR') : 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <Package size={14} className="text-slate-400" />
                            <span className="text-slate-600">Conteneur:</span>
                            <span className="text-slate-900">{dossier.containerNumber || 'N/A'}</span>
                          </div>
                          {dossier.description && (
                            <p className="text-xs text-slate-600 italic line-clamp-2">{dossier.description}</p>
                          )}
                        </div>

                        {/* SECTION LIVRAISON - Ultra-détaillée */}
                        <div className="mb-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-2 mb-2">
                            <Truck size={14} className="text-emerald-600" />
                            <span className="text-xs font-bold text-slate-700 uppercase">Informations Livraison</span>
                          </div>
                          
                          {/* Destination */}
                          <div className="flex items-start gap-2 text-xs mb-2">
                            <MapPin size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <span className="text-slate-500 block">Destination:</span>
                              <span className="font-medium text-slate-900">{dossier.destination || 'Non spécifiée'}</span>
                            </div>
                          </div>

                          {hasDeliveryInfo ? (
                            <>
                              {/* Chauffeur */}
                              <div className="flex items-start gap-2 text-xs mb-2 bg-emerald-50 p-2 rounded">
                                <User size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <span className="text-slate-500 block">Chauffeur:</span>
                                  <span className="font-bold text-emerald-900">{dossier.deliveryInfo.driverName}</span>
                                </div>
                              </div>

                              {/* Camion */}
                              <div className="flex items-start gap-2 text-xs mb-2">
                                <Truck size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <span className="text-slate-500 block">N° Camion:</span>
                                  <span className="font-medium text-slate-900">{dossier.deliveryInfo.truckPlate}</span>
                                </div>
                              </div>

                              {/* Destinataire */}
                              <div className="flex items-start gap-2 text-xs mb-2 bg-blue-50 p-2 rounded">
                                <User size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <span className="text-slate-500 block">Destinataire (Reçu par):</span>
                                  <span className="font-bold text-blue-900">{dossier.deliveryInfo.recipientName}</span>
                                </div>
                              </div>

                              {/* Date de livraison */}
                              <div className="flex items-start gap-2 text-xs mb-2">
                                <Calendar size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <span className="text-slate-500 block">Date livraison:</span>
                                  <span className="font-medium text-slate-900">{new Date(dossier.deliveryInfo.deliveryDate).toLocaleDateString('fr-FR')}</span>
                                </div>
                              </div>

                              {/* Statut réception client */}
                              <div className={`flex items-center gap-2 text-xs p-2 rounded mt-2 ${
                                isDelivered ? 'bg-green-100' : 'bg-orange-100'
                              }`}>
                                <CheckCircle2 size={14} className={isDelivered ? 'text-green-600' : 'text-orange-600'} />
                                <span className={`font-bold ${
                                  isDelivered ? 'text-green-900' : 'text-orange-900'
                                }`}>
                                  {isDelivered ? '✓ Reçu par le client' : '⏳ En cours de livraison'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800 mt-2">
                              <AlertCircle size={12} className="inline mr-1" />
                              <span className="font-medium">Informations de livraison non renseignées</span>
                            </div>
                          )}
                        </div>

                        {/* Résumé financier */}
                        <div className="mb-3">
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-slate-500 block mb-1">Total facturé</span>
                              <span className="font-bold text-slate-900">{totalFacture.toLocaleString('fr-FR')} GNF</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block mb-1">Payé</span>
                              <span className="font-bold text-green-600">{totalPaye.toLocaleString('fr-FR')} GNF</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block mb-1">Solde</span>
                              <span className={`font-bold ${solde > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{solde.toLocaleString('fr-FR')} GNF</span>
                            </div>
                          </div>
                        </div>

                        {/* Alertes */}
                        {dossier.alerts && dossier.alerts.length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertCircle size={12} className="text-red-600" />
                              <span className="text-xs font-bold text-red-900">Alertes ({dossier.alerts.length})</span>
                            </div>
                            <ul className="text-xs text-red-800 space-y-1">
                              {dossier.alerts.map((alert, i) => (
                                <li key={i}>• {alert}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Bouton Voir détails */}
                        <button
                          onClick={() => {
                            setShowSortiePortModal(false);
                            onViewShipment(dossier.id);
                          }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 rounded-lg transition-all text-xs font-medium"
                        >
                          <Eye size={14} />
                          Voir détails complets
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer avec statistiques */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-slate-900">{filteredSortiePort.length}</div>
                  <div className="text-xs text-slate-500 uppercase font-medium">Total</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{filteredSortiePort.filter(d => d.status === ShipmentStatus.BAE_GRANTED).length}</div>
                  <div className="text-xs text-slate-500 uppercase font-medium">BAE Obtenu</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-600">{filteredSortiePort.filter(d => d.status === ShipmentStatus.PORT_EXIT).length}</div>
                  <div className="text-xs text-slate-500 uppercase font-medium">Sortie Port</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{filteredSortiePort.filter(d => d.deliveryInfo).length}</div>
                  <div className="text-xs text-slate-500 uppercase font-medium">Infos Livraison</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Dossiers Bloqués détaillés */}
      {showBloquesModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => setShowBloquesModal(false)}
        >
          <div 
            className="flex flex-col w-full max-w-6xl max-h-[90vh] bg-white rounded-2xl shadow-2xl animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-slate-200 bg-red-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                    <AlertCircle size={20}/>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Dossiers Bloqués</h2>
                  <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                    {filteredBloques.length} dossier(s)
                  </span>
                </div>
                <button 
                  onClick={() => setShowBloquesModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-red-100 flex items-center justify-center transition-colors"
                  aria-label="Fermer"
                >
                  <X size={18}/>
                </button>
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap gap-3">
                {/* Search */}
                <div className="flex-1 min-w-[250px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                  <input
                    type="text"
                    placeholder="Rechercher par N°, client, BL, description..."
                    value={searchTermBloques}
                    onChange={(e) => setSearchTermBloques(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                {/* Filter Status */}
                <select
                  value={filterStatusBloques}
                  onChange={(e) => setFilterStatusBloques(e.target.value as ShipmentStatus | 'ALL')}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value={ShipmentStatus.AT_CUSTOMS}>À la douane</option>
                  <option value={ShipmentStatus.CUSTOMS_EXAM}>Examen douanier</option>
                  <option value={ShipmentStatus.PENDING_DOCS}>Documents en attente</option>
                  <option value={ShipmentStatus.PAYMENT_PENDING}>Paiement en attente</option>
                  <option value={ShipmentStatus.BAE_GRANTED}>BAE accordé</option>
                  <option value={ShipmentStatus.PORT_EXIT}>Sortie du port</option>
                </select>

                {/* Sort */}
                <select
                  value={sortByBloques}
                  onChange={(e) => setSortByBloques(e.target.value as 'date' | 'client' | 'status')}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                >
                  <option value="date">Trier par date</option>
                  <option value="client">Trier par client</option>
                  <option value="status">Trier par statut</option>
                </select>

                {/* Export */}
                <button 
                  onClick={() => {
                    if (filteredBloques.length === 0) {
                      alert('Aucun dossier à exporter');
                      return;
                    }
                    const headers = ['N° Tracking', 'Client', 'N° BL', 'Description', 'Statut', "Date d'arrivée", 'Feu tricolore', 'Total facturé', 'Payé', 'Solde', 'Alertes'];
                    const rows = filteredBloques.map(d => {
                      const totalFacture = (d.expenses || []).filter(e => e.type === 'REVENUE').reduce((sum, e) => sum + e.amount, 0);
                      const totalPaye = (d.expenses || []).filter(e => e.type === 'REVENUE' && e.paid).reduce((sum, e) => sum + e.amount, 0);
                      const solde = totalFacture - totalPaye;
                      const trafficLight = getTrafficLight(d);
                      const alertes = (d.alerts || []).join('; ');
                      return [d.trackingNumber, d.clientName, d.blNumber, d.description || '', getStatusLabel(d.status), d.arrivalDate ? new Date(d.arrivalDate).toLocaleDateString('fr-FR') : '', trafficLight === 'green' ? 'Vert' : trafficLight === 'orange' ? 'Orange' : trafficLight === 'red' ? 'Rouge' : 'Gris', `${totalFacture.toLocaleString('fr-FR')} GNF`, `${totalPaye.toLocaleString('fr-FR')} GNF`, `${solde.toLocaleString('fr-FR')} GNF`, alertes];
                    });
                    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\\n');
                    const blob = new Blob(['\\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    const url = URL.createObjectURL(blob);
                    const date = new Date().toISOString().split('T')[0];
                    link.setAttribute('href', url);
                    link.setAttribute('download', `dossiers-bloques-${date}.csv`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
                >
                  <Download size={16}/>
                  Exporter
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredBloques.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <AlertCircle size={64} className="mb-4 opacity-20"/>
                  <p className="text-lg font-medium">Aucun dossier bloqué trouvé</p>
                  <p className="text-sm">Essayez de modifier vos filtres de recherche</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredBloques.map((dossier) => {
                    const trafficLight = getTrafficLight(dossier);
                    const lightColor = trafficLight === 'green' ? 'bg-emerald-500' : trafficLight === 'orange' ? 'bg-orange-500' : trafficLight === 'red' ? 'bg-red-500' : 'bg-slate-400';
                    const totalFacture = (dossier.expenses || []).filter(e => e.type === 'REVENUE').reduce((sum, e) => sum + e.amount, 0);
                    const totalPaye = (dossier.expenses || []).filter(e => e.type === 'REVENUE' && e.paid).reduce((sum, e) => sum + e.amount, 0);
                    const solde = totalFacture - totalPaye;
                    const totalProvisions = (dossier.expenses || []).filter(e => e.type === 'EXPENSE' && e.category === 'PROVISION').reduce((sum, e) => sum + e.amount, 0);
                    const totalDisbursements = (dossier.expenses || []).filter(e => e.type === 'EXPENSE' && e.category === 'DISBURSEMENT').reduce((sum, e) => sum + e.amount, 0);

                    return (
                      <div key={dossier.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
                        {/* Header with traffic light */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-3 h-3 rounded-full ${lightColor} animate-pulse`}></div>
                              <span className="text-xs font-bold text-slate-900">{dossier.trackingNumber}</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-800">{dossier.clientName}</p>
                            <p className="text-xs text-slate-500">BL: {dossier.blNumber}</p>
                          </div>
                          <button
                            onClick={() => onViewShipment(dossier.id)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Voir détails"
                          >
                            <Eye size={16} className="text-slate-600"/>
                          </button>
                        </div>

                        {/* Status badge */}
                        <div className="mb-3">
                          <span className="inline-block px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                            {getStatusLabel(dossier.status)}
                          </span>
                        </div>

                        {/* Info grid */}
                        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                          <div className="flex items-center gap-1 text-slate-600">
                            <Calendar size={12}/>
                            <span>{dossier.arrivalDate ? new Date(dossier.arrivalDate).toLocaleDateString('fr-FR') : 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-600">
                            <Truck size={12}/>
                            <span>{dossier.containerNumber || 'N/A'}</span>
                          </div>
                        </div>

                        {/* Financial summary */}
                        <div className="bg-slate-50 rounded-lg p-2 mb-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-600">Total facturé</span>
                            <span className="font-semibold text-slate-900">{totalFacture.toLocaleString()} GNF</span>
                          </div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-600">Payé</span>
                            <span className="font-semibold text-emerald-600">{totalPaye.toLocaleString()} GNF</span>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                            <span className="text-slate-600 font-medium">Solde</span>
                            <span className={`font-bold ${solde > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {solde.toLocaleString()} GNF
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-slate-200">
                            <span className="text-slate-600">Frais</span>
                            <div className="flex gap-2 text-xs">
                              <span className="text-emerald-600">↓ {totalProvisions.toLocaleString()}</span>
                              <span className="text-red-600">↑ {totalDisbursements.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {dossier.alerts && dossier.alerts.length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-2">
                              <AlertCircle size={14}/>
                              <span>Alertes ({dossier.alerts.length})</span>
                            </div>
                            <div className="space-y-1">
                              {dossier.alerts.slice(0, 2).map((alert, idx) => (
                                <p key={idx} className="text-xs text-red-600">• {alert}</p>
                              ))}
                              {dossier.alerts.length > 2 && (
                                <p className="text-xs text-red-500 font-medium">+ {dossier.alerts.length - 2} autre(s)</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Stats */}
            <div className="border-t border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{filteredBloques.length}</p>
                  <p className="text-xs text-slate-600">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600">
                    {filteredBloques.filter(d => getTrafficLight(d) === 'green').length}
                  </p>
                  <p className="text-xs text-slate-600">En règle</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">
                    {filteredBloques.filter(d => getTrafficLight(d) === 'orange').length}
                  </p>
                  <p className="text-xs text-slate-600">Attention</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">
                    {filteredBloques.filter(d => getTrafficLight(d) === 'red').length}
                  </p>
                  <p className="text-xs text-slate-600">Urgence</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};