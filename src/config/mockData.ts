/**
 * DONNÉES MOCK - DÉVELOPPEMENT UNIQUEMENT
 * 
 * ⚠️ AVERTISSEMENT CRITIQUE:
 * - Ces données sont FICTIVES et destinées au développement UNIQUEMENT
 * - Ne contiennent AUCUNE donnée réelle (conformité RGPD)
 * - Ne JAMAIS utiliser en production
 * - Import conditionné par IS_MOCK_MODE
 * 
 * Noms d'entreprises: Totalement fictifs, aucune ressemblance avec des entités réelles
 */

import { Shipment, ShipmentStatus, CommodityType } from '../types';
import { IS_MOCK_MODE } from './environment';

// Validation: Ne doit être importé qu'en mode développement
if (!IS_MOCK_MODE) {
  throw new Error(
    '🚨 ERREUR FATALE: mockData.ts ne doit être importé qu\'en mode développement!\n' +
    'Ce fichier contient des données fictives et ne doit JAMAIS être chargé en production.\n' +
    'Vérifiez que VITE_USE_MOCK=true et que vous êtes en développement.'
  );
}

/**
 * Générer dates dynamiques pour données mock
 */
export const getMockDates = () => {
  const now = Date.now();
  return {
    today: new Date(now).toISOString(),
    yesterday: new Date(now - 86400000).toISOString(),
    lastWeek: new Date(now - 7 * 86400000).toISOString(),
  };
};

const { today, yesterday, lastWeek } = getMockDates();

/**
 * ⚠️ DONNÉES FICTIVES - Ne pas utiliser en production
 */
export const MOCK_SHIPMENTS: Shipment[] = [
  {
    id: 'mock-1',
    trackingNumber: 'TR-8849-XY',
    clientId: 'client-test-1',
    clientName: 'Société Test Alpha SARL', // ✅ Nom fictif
    commodityType: CommodityType.CONTAINER,
    description: '40" - Granulés Plastiques',
    origin: 'Anvers, BE',
    destination: 'Conakry, GN',
    status: ShipmentStatus.CUSTOMS_LIQUIDATION,
    eta: '2023-10-20',
    arrivalDate: '2023-10-21',
    freeDays: 7,
    blNumber: 'MSKU90123456',
    shippingLine: 'Maersk',
    containerNumber: 'MSKU4567890',
    customsRegime: 'IM4',
    declarationNumber: 'C-2023-10502',
    documents: [
      { id: 'd1', name: 'Bill of Lading', type: 'BL', status: 'Verified', uploadDate: '2023-10-01' },
      { id: 'd2', name: 'Facture Commerciale', type: 'Facture', status: 'Verified', uploadDate: '2023-10-02' },
      { id: 'd3', name: 'Déclaration DDI', type: 'DDI', status: 'Verified', uploadDate: '2023-10-15' },
      { id: 'd4', name: 'Bordereau BSC', type: 'BSC', status: 'Verified', uploadDate: '2023-10-15' }
    ],
    expenses: [
      { id: 'p1', description: 'Avance Client', amount: 10000000, paid: true, category: 'Autre', type: 'PROVISION', date: lastWeek },
      { id: 'e1', description: 'Frais Portuaires', amount: 4500000, paid: true, category: 'Port', type: 'DISBURSEMENT', date: yesterday },
      { id: 'e2', description: 'Ouverture Dossier', amount: 500000, paid: true, category: 'Agence', type: 'FEE', date: lastWeek },
      { id: 'e3', description: 'Liquidation Douane (C-2023-10502)', amount: 12500000, paid: false, category: 'Douane', type: 'DISBURSEMENT', date: today }
    ],
    alerts: ['Surestaries (J-1)']
  },
  {
    id: 'mock-2',
    trackingNumber: 'TR-9921-AB',
    clientId: 'client-test-2',
    clientName: 'Entreprise Test Beta', // ✅ Nom fictif
    commodityType: CommodityType.GENERAL,
    description: '3 Palettes Informatique',
    origin: 'Dubai, UAE',
    destination: 'Conakry, GN',
    status: ShipmentStatus.PRE_CLEARANCE,
    eta: '2023-11-05',
    arrivalDate: undefined,
    freeDays: 14,
    blNumber: 'CMA123456789',
    shippingLine: 'CMA CGM',
    containerNumber: 'TGHU123456',
    customsRegime: 'IT',
    documents: [
      { id: 'd5', name: 'Packing List', type: 'Autre', status: 'Verified', uploadDate: '2023-09-28' }
    ],
    expenses: [
      { id: 'p2', description: 'Avance Dédouanement', amount: 5000000, paid: true, category: 'Autre', type: 'PROVISION', date: today },
      { id: 'e3', description: 'Transport DDI', amount: 100000, paid: true, category: 'Logistique', type: 'DISBURSEMENT', date: today }
    ],
    alerts: []
  },
  {
    id: 'mock-3',
    trackingNumber: 'TR-7701-DL',
    clientId: 'client-test-3',
    clientName: 'Société Test Gamma Construction', // ✅ Nom fictif
    commodityType: CommodityType.VEHICLE,
    description: 'Pelle Hydraulique CAT 320',
    origin: 'Le Havre, FR',
    destination: 'Conakry, GN',
    status: ShipmentStatus.DELIVERED,
    eta: '2023-09-10',
    arrivalDate: '2023-09-12',
    freeDays: 10,
    blNumber: 'MSC987654321',
    shippingLine: 'MSC',
    containerNumber: 'Vrac / RORO',
    customsRegime: 'IM4',
    declarationNumber: 'C-2023-09100',
    documents: [
      { id: 'd6', name: 'Bill of Lading', type: 'BL', status: 'Verified', uploadDate: '2023-08-25' },
      { id: 'd7', name: 'Facture Commerciale', type: 'Facture', status: 'Verified', uploadDate: '2023-08-25' },
      { id: 'd8', name: 'DDI', type: 'DDI', status: 'Verified', uploadDate: '2023-09-01' },
      { id: 'd9', name: 'Quittance Douane', type: 'Quittance', status: 'Verified', uploadDate: '2023-09-15' },
      { id: 'd10', name: 'Bon à Enlever', type: 'BAE', status: 'Verified', uploadDate: '2023-09-16' },
      { id: 'd11', name: 'Photo Chargement', type: 'Photo Camion', status: 'Verified', uploadDate: '2023-09-17' }
    ],
    expenses: [
      { id: 'p3', description: 'Avance Totale', amount: 65000000, paid: true, category: 'Autre', type: 'PROVISION', date: '2023-09-01T10:00:00Z' },
      { id: 'e4', description: 'Liquidation Douane', amount: 58000000, paid: true, category: 'Douane', type: 'DISBURSEMENT', date: '2023-09-15T14:00:00Z' },
      { id: 'e5', description: 'Frais Manutention RORO', amount: 3500000, paid: true, category: 'Port', type: 'DISBURSEMENT', date: '2023-09-16T09:00:00Z' },
      { id: 'e6', description: 'Livraison Site (Km 36)', amount: 2000000, paid: true, category: 'Logistique', type: 'DISBURSEMENT', date: '2023-09-17T15:00:00Z' }
    ],
    deliveryInfo: {
      driverName: 'Test Driver',
      truckPlate: 'TEST-123',
      deliveryDate: '2023-09-17T14:30:00Z',
      recipientName: 'Test Recipient'
    },
    alerts: []
  }
];

/**
 * Bannière d'avertissement à afficher en mode mock
 */
export const MOCK_WARNING_BANNER = {
  visible: true,
  message: '⚠️ MODE DÉVELOPPEMENT - Données fictives chargées',
  details: 'Ces données sont uniquement pour le développement. En production, seules les données réelles de la base de données seront utilisées.',
  color: 'warning' as const
};
