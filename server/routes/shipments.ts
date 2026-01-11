/**
 * ROUTES SHIPMENTS - SÉCURISÉES PAR PERMISSIONS
 * 
 * Routes API pour gérer les dossiers douaniers
 * Filtrage automatique selon le rôle utilisateur
 */

import express, { Request, Response } from 'express';
import { Permission } from '../utils/permissions';
import { requirePermission, requireAnyPermission } from '../middleware/permissions';
import { authenticateJWT } from '../middleware/auth';
import { Role, ShipmentStatus } from '../types';
import { prisma } from '../config/prisma';

const router = express.Router();

// ============================================
// MOCK DATA (⚠️ TO BE REPLACED WITH DATABASE)
// ============================================

const IS_MOCK_MODE = process.env.USE_MOCK_DATA === 'true';

if (IS_MOCK_MODE) {
  console.warn('\n' + '='.repeat(60));
  console.warn('⚠️  AVERTISSEMENT: MODE MOCK ACTIVÉ');
  console.warn('='.repeat(60));
  console.warn('Les données mock sont utilisées.');
  console.warn('✅ Données FICTIVES uniquement (conformité RGPD)');
  console.warn('❌ Ne JAMAIS utiliser en production');
  console.warn('Pour désactiver: USE_MOCK_DATA=false');
  console.warn('='.repeat(60) + '\n');
  
  // 🚨 SÉCURITÉ CRITIQUE: Bloquer démarrage production avec mock data
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 ERREUR FATALE: MOCK_DATA interdit en production');
    console.error('Configurez une vraie base de données PostgreSQL');
    process.exit(1);
  }
}

/**
 * ⚠️ DONNÉES FICTIVES - Développement uniquement
 * Noms d'entreprises totalement fictifs (conformité RGPD)
 */
const MOCK_SHIPMENTS = [
  {
    id: '1',
    trackingNumber: 'TR-8849-XY',
    clientId: 'client-soguiplast',
    clientName: 'Soguiplast SARL',
    commodityType: 'Container 40"',
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
      { id: 'd3', name: 'Déclaration DDI', type: 'DDI', status: 'Verified', uploadDate: '2023-10-15' }
    ],
    expenses: [
      { id: 'e1', description: 'Frais Portuaires', amount: 4500000, paid: true, category: 'Port', type: 'DISBURSEMENT', date: '2023-10-20' },
      { id: 'e2', description: 'Ouverture Dossier', amount: 500000, paid: true, category: 'Agence', type: 'FEE', date: '2023-10-15' },
      { id: 'e3', description: 'Liquidation Douane (C-2023-10502)', amount: 12500000, paid: false, category: 'Douane', type: 'DISBURSEMENT', date: '2023-10-21' }
    ],
    alerts: ['Surestaries (J-1)']
  },
  {
    id: '2',
    trackingNumber: 'TR-9921-AB',
    clientId: 'client-moussa',
    clientName: 'Moussa Electronics',
    commodityType: 'Général (3 palettes)',
    description: '3 Palettes Informatique',
    origin: 'Dubai, UAE',
    destination: 'Conakry, GN',
    status: ShipmentStatus.PRE_CLEARANCE,
    eta: '2023-11-05',
    freeDays: 14,
    blNumber: 'CMA123456789',
    shippingLine: 'CMA CGM',
    containerNumber: 'TGHU123456',
    customsRegime: 'IT',
    documents: [
      { id: 'd5', name: 'Packing List', type: 'Autre', status: 'Verified', uploadDate: '2023-09-28' }
    ],
    expenses: [
      { id: 'p2', description: 'Avance Dédouanement', amount: 5000000, paid: true, category: 'Autre', type: 'PROVISION', date: '2023-10-21' },
      { id: 'e3', description: 'Transport DDI', amount: 100000, paid: true, category: 'Logistique', type: 'DISBURSEMENT', date: '2023-10-21' }
    ],
    alerts: []
  },
  {
    id: 'mock-3',
    trackingNumber: 'TR-7701-DL',
    clientId: 'client-test-3',
    clientName: 'Société Test Gamma Construction', // ✅ Fictif
    commodityType: 'Véhicule/Engin',
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
 * GET /api/shipments
 * Liste des dossiers selon rôle utilisateur
 * 
 * Filtrage automatique:
 * - CLIENT: Voit uniquement ses propres dossiers
 * - AUTRES: Voient tous les dossiers
 */
router.get(
  '/',
  authenticateJWT,
  requireAnyPermission([Permission.VIEW_SHIPMENTS, Permission.VIEW_OWN_SHIPMENTS]),
  async (req: Request, res: Response) => {
    try {
      const { role, id: userId } = req.user!;
      
      // ✅ PAGINATION pour performance
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50; // Max 50 par défaut
      const skip = (page - 1) * limit;

      // ✅ Récupérer depuis la base de données
      const whereClause = role === Role.CLIENT 
        ? { createdById: userId } // Client voit uniquement ses dossiers
        : {}; // Staff voit tous les dossiers

      const [shipments, total] = await Promise.all([
        prisma.shipment.findMany({
          where: whereClause,
          include: {
            expenses: {
              take: 10, // Limiter à 10 expenses récents
              orderBy: { date: 'desc' }
            },
            documents: {
              take: 5, // Limiter à 5 documents récents
              orderBy: { uploadDate: 'desc' }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: skip
        }),
        prisma.shipment.count({ where: whereClause })
      ]);

      // Masquer données sensibles si CLIENT
      const sanitizedShipments = shipments.map(s => {
        // Mapper les données Prisma vers le format frontend
        const mappedShipment = {
          ...s,
          clientId: s.createdById, // ✅ Mapper createdById → clientId pour le frontend
          destination: s.deliveryCompany || 'Non spécifiée',
          deliveryInfo: s.deliveryDriver ? {
            driverName: s.deliveryDriver,
            truckPlate: s.deliveryPhone?.split(' - ')[1] || 'N/A', // Format: "+224... - GN-123-AB"
            deliveryDate: s.deliveryDate?.toISOString() || '',
            recipientName: s.clientContact?.split(' (')[0] || s.clientName
          } : undefined
        };

        if (role === Role.CLIENT) {
          // Clients ne voient PAS les marges agence
          const expenses = mappedShipment.expenses || [];
          const sanitizedExpenses = expenses.filter(e => e.type !== 'FEE');
          return { ...mappedShipment, expenses: sanitizedExpenses };
        }
        return mappedShipment;
      });

      console.log('[SHIPMENTS] Fetched for', role, ':', sanitizedShipments.length, 'shipments (page', page, ')');

      res.json({
        success: true,
        shipments: sanitizedShipments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: skip + sanitizedShipments.length < total
        }
      });

    } catch (error: any) {
      console.error('[SHIPMENTS] Error fetching:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des dossiers'
      });
    }
  }
);

/**
 * GET /api/shipments/:id
 * Détails d'un dossier spécifique
 */
router.get(
  '/:id',
  authenticateJWT,
  requireAnyPermission([Permission.VIEW_SHIPMENTS, Permission.VIEW_OWN_SHIPMENTS]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { role, id: userId } = req.user!;

      // ✅ Récupérer depuis PostgreSQL avec relations
      const shipment = await prisma.shipment.findUnique({
        where: { id },
        include: {
          expenses: true,
          documents: true
        }
      });

      if (!shipment) {
        return res.status(404).json({
          success: false,
          message: 'Dossier non trouvé'
        });
      }

      // Vérifier ownership si CLIENT
      if (role === Role.CLIENT && shipment.createdById !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Accès refusé à ce dossier'
        });
      }

      res.json({
        success: true,
        shipment
      });

    } catch (error: any) {
      console.error('[SHIPMENTS] Error fetching detail:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du dossier'
      });
    }
  }
);

/**
 * POST /api/shipments
 * Créer un nouveau dossier
 */
router.post(
  '/',
  authenticateJWT,
  requirePermission(Permission.EDIT_SHIPMENTS),
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.user!;
      
      // ✅ Créer en base de données avec Prisma
      const newShipment = await prisma.shipment.create({
        data: {
          trackingNumber: req.body.trackingNumber,
          clientName: req.body.clientName,
          commodityType: req.body.commodityType,
          description: req.body.description || '',
          origin: req.body.origin,
          destination: req.body.destination,
          eta: req.body.eta,
          blNumber: req.body.blNumber,
          shippingLine: req.body.shippingLine || 'Maersk',
          containerNumber: req.body.containerNumber || null,
          freeDays: req.body.freeDays || 7,
          status: ShipmentStatus.IN_TRANSIT,
          createdById: userId, // ✅ Utiliser createdById (schéma Prisma)
          // Champs JSON vides par défaut
          alerts: [],
          documents: [],
          expenses: [],
          timeline: [
            {
              date: new Date().toISOString(),
              event: 'Dossier créé',
              actor: req.user!.email || 'System',
              details: `Créé par ${req.user!.role}`
            }
          ]
        }
      });

      console.log('[SHIPMENTS] ✅ Created in DB:', newShipment.trackingNumber);

      res.status(201).json({
        success: true,
        shipment: newShipment
      });

    } catch (error: any) {
      console.error('[SHIPMENTS] Error creating:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du dossier',
        error: error.message
      });
    }
  }
);

/**
 * PUT /api/shipments/:id/status
 * Mettre à jour le statut d'un dossier
 */
router.put(
  '/:id/status',
  authenticateJWT,
  requirePermission(Permission.EDIT_OPERATIONS),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, deliveryInfo } = req.body;

      const shipmentIndex = MOCK_SHIPMENTS.findIndex(s => s.id === id);
      if (shipmentIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Dossier non trouvé'
        });
      }

      // TODO: UPDATE en DB
      MOCK_SHIPMENTS[shipmentIndex] = {
        ...MOCK_SHIPMENTS[shipmentIndex],
        status,
        deliveryInfo: deliveryInfo || MOCK_SHIPMENTS[shipmentIndex].deliveryInfo
      };

      console.log('[SHIPMENTS] Status updated:', id, status);

      res.json({
        success: true,
        shipment: MOCK_SHIPMENTS[shipmentIndex]
      });

    } catch (error: any) {
      console.error('[SHIPMENTS] Error updating status:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour'
      });
    }
  }
);

/**
 * POST /api/shipments/:id/documents
 * Ajouter un document
 */
router.post(
  '/:id/documents',
  authenticateJWT,
  requirePermission(Permission.UPLOAD_DOCUMENTS),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const document = req.body;

      const shipmentIndex = MOCK_SHIPMENTS.findIndex(s => s.id === id);
      if (shipmentIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Dossier non trouvé'
        });
      }

      const newDocument = {
        id: Date.now().toString(),
        ...document,
        uploadDate: new Date().toISOString()
      };

      MOCK_SHIPMENTS[shipmentIndex].documents.push(newDocument);

      console.log('[SHIPMENTS] Document added:', id, newDocument.type);

      res.status(201).json({
        success: true,
        document: newDocument
      });

    } catch (error: any) {
      console.error('[SHIPMENTS] Error adding document:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'ajout du document'
      });
    }
  }
);

export default router;
