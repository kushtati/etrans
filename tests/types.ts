export enum Role {
  DIRECTOR = 'DG / Admin',
  CREATION_AGENT = 'Chargé de Création',
  ACCOUNTANT = 'Comptable',
  FIELD_AGENT = 'Agent de Terrain',
  CLIENT = 'Client / Importateur'
}

export enum ShipmentStatus {
  OPENED = 'Ouverture Dossier',
  PRE_CLEARANCE = 'Pré-Dédouanement (DDI & BSC)', // Étape 1 stricte
  CUSTOMS_LIQUIDATION = 'Liquidation Douane',
  LIQUIDATION_PAID = 'Liquidation Payée', // Étape 4 : Paiement validé
  BAE_GRANTED = 'BAE Obtenu',
  PORT_EXIT = 'Sortie Port',
  DELIVERED = 'Livré / Archivé'
}

export enum CommodityType {
  VEHICLE = 'Véhicule',
  CONTAINER = 'Conteneur',
  FOOD = 'Denrées Alimentaires',
  ELECTRONICS = 'Électroménager',
  BULK = 'Vrac',
  GENERAL = 'Divers'
}

export type DocumentStatus = 'Pending' | 'Verified' | 'Rejected';

export type DocumentType = 'BL' | 'Facture' | 'Packing List' | 'Certificat' | 'DDI' | 'BSC' | 'Quittance' | 'BAE' | 'BAD' | 'Photo Camion' | 'Autre';

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  status: DocumentStatus;
  uploadDate: string;
  url?: string;
}

export type ExpenseType = 'PROVISION' | 'DISBURSEMENT' | 'FEE';

export interface Expense {
  id: string;
  description: string;
  /**
   * Montant en GNF (Franc Guinéen)
   * @minimum 0
   * @maximum 1000000000000
   * @example 150000
   */
  amount: number;
  paid: boolean; // For disbursements: true if paid to supplier. For provisions: true if received from client.
  category: 'Douane' | 'Port' | 'Logistique' | 'Agence' | 'Autre';
  type: ExpenseType; // PROVISION (Avance), DISBURSEMENT (Débours), FEE (Honoraire)
  /**
   * Date comptable
   * @format date-time ISO 8601
   * @example "2026-01-09T14:30:00Z"
   */
  date: string;
  /**
   * Date de création (pour tri)
   * @format date-time ISO 8601
   * @optional Pour compatibilité legacy data
   */
  createdAt?: string;
}

// CUSTOMS RATES - Dynamic, fetched from backend
// These rates change regularly via government decrees
export interface CustomsRates {
  /** Redevance Terminal Lieu (RTL) - Pourcentage @example 2.5 */
  rtl: number;
  /** Redevance Droits et Licence (RDL) - Pourcentage @example 1.0 */
  rdl: number;
  /** Taxe sur la Valeur (TVA) - Pourcentage @example 18.0 */
  tvs: number;
  /** Droits de Douane (Customs Duty) - Pourcentage @example 5.0 */
  dd: number;
  /** Date dernière mise à jour @format date-time ISO 8601 */
  lastUpdate: string;
  /** Source légale @example "Décret N°2026/001/PRG" */
  source: string;
}

export interface DeliveryInfo {
  driverName: string;
  truckPlate: string;
  /**
   * Date de livraison
   * @format date-time ISO 8601
   * @example "2026-01-15T10:00:00Z"
   */
  deliveryDate: string;
  recipientName: string;
}

export interface Shipment {
  id: string;
  trackingNumber: string;
  /**
   * Client UUID
   * SECURITY: Track client ownership for role-based filtering
   * @format uuid
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  clientId: string;
  clientName: string;
  commodityType: CommodityType;
  description: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  /**
   * Date prévue d'arrivée (Estimated Time of Arrival)
   * @format date-time ISO 8601
   * @example "2026-01-20T08:00:00Z"
   */
  eta: string;
  /**
   * Date d'arrivée réelle au port
   * @format date-time ISO 8601
   */
  arrivalDate?: string;
  freeDays: number; // Demurrage free days allowed
  documents: Document[];
  expenses: Expense[];
  alerts: string[];
  
  // New Technical Fields for Realism
  blNumber: string;
  shippingLine: string; // e.g., 'Maersk', 'CMA CGM'
  containerNumber?: string;
  /**
   * Régime douanier Sydonia
   * - IM4: Importation Définitive
   * - IT: Importation Temporaire
   * - AT: Admission Temporaire
   * - Export: Exportation
   */
  customsRegime: 'IM4' | 'IT' | 'AT' | 'Export';
  declarationNumber?: string; // Sydonia Declaration Number
  
  // Delivery Tracking
  deliveryInfo?: DeliveryInfo;
}

export interface TransitContextType {
  role: Role;
  setRole: (role: Role) => void;
  currentUserId: string; // SECURITY: Track current user for role-based data filtering
  isOffline: boolean;
  toggleOffline: () => void;
  shipments: Shipment[];
  loading: boolean; // ✅ NOUVEAU: État de chargement
  error: string | null; // ✅ NOUVEAU: Gestion d'erreurs
  addDocument: (shipmentId: string, doc: Document) => Promise<void>;
  addExpense: (shipmentId: string, expense: Expense) => Promise<void>;
  addShipment: (shipment: Shipment) => Promise<void>;
  updateShipmentStatus: (shipmentId: string, newStatus: ShipmentStatus, deliveryInfo?: DeliveryInfo) => Promise<void>;
  setArrivalDate: (shipmentId: string, date: string) => void;
  setDeclarationDetails: (shipmentId: string, number: string, amount: number) => void;
  payLiquidation: (shipmentId: string) => Promise<{ success: boolean; message: string }>; // ✅ Async
  /**
   * Mise à jour partielle dossier (immutable fields protégés)
   * SECURITY: Interdit modification id, trackingNumber, clientId, documents, expenses
   */
  updateShipmentDetails: (
    shipmentId: string,
    updates: Omit<Partial<Shipment>, 'id' | 'trackingNumber' | 'clientId' | 'documents' | 'expenses'>
  ) => void;
}
