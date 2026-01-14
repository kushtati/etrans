/**
 * ROUTES SHIPMENTS - SÉCURISÉES PAR PERMISSIONS
 * 
 * Routes API pour gérer les dossiers douaniers
 * Filtrage automatique selon le rôle utilisateur
 */

import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import { Permission } from '../utils/permissions';
import { requirePermission, requireAnyPermission } from '../middleware/permissions';
import { authenticateJWT } from '../middleware/auth';
import { Role } from '../types';
import { ShipmentStatus, ExpenseType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger, logError } from '../config/logger';

const router = express.Router();

// 🚦 Rate Limiting : 300 requêtes/15min pour shipments (per-user)
const shipmentsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15min
  max: 300,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
  message: { error: 'Limite shipments atteinte. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// 🔒 CONSTANTES DE SÉCURITÉ
const MAX_PAGE_SIZE = 100;
const MAX_PAGE_NUMBER = 10000;

// ============================================
// MOCK DATA (⚠️ TO BE REPLACED WITH DATABASE)
// ============================================

const IS_MOCK_MODE = process.env.USE_MOCK_DATA === 'true';

if (IS_MOCK_MODE) {
  logger.warn('\n' + '='.repeat(60));
  logger.warn('⚠️  AVERTISSEMENT: MODE MOCK ACTIVÉ');
  logger.warn('='.repeat(60));
  logger.warn('Les données mock sont utilisées.');
  logger.warn('✅ Données FICTIVES uniquement (conformité RGPD)');
  logger.warn('❌ Ne JAMAIS utiliser en production');
  logger.warn('Pour désactiver: USE_MOCK_DATA=false');
  logger.warn('='.repeat(60) + '\n');
  
  // 🚨 SÉCURITÉ CRITIQUE: Bloquer démarrage production avec mock data
  if (process.env.NODE_ENV === 'production') {
    logger.error('🚨 ERREUR FATALE: MOCK_DATA interdit en production');
    logger.error('Configurez une vraie base de données PostgreSQL');
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
    status: ShipmentStatus.CUSTOMS_PAID,
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
    status: ShipmentStatus.DECLARATION_FILED,
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
  shipmentsLimiter,
  requireAnyPermission([Permission.VIEW_SHIPMENTS, Permission.VIEW_OWN_SHIPMENTS]),
  async (req: Request, res: Response) => {
    try {
      const { role, id: userId } = req.user!;
      
      // ✅ PAGINATION avec validation stricte
      let page = parseInt(req.query.page as string) || 1;
      let limit = parseInt(req.query.limit as string) || 50;
      
      // Validation page (min 1, max 10000)
      if (!validator.isInt(String(page), { min: 1, max: MAX_PAGE_NUMBER })) {
        page = 1;
      }
      
      // Validation limit (min 1, max 100)
      if (!validator.isInt(String(limit), { min: 1, max: MAX_PAGE_SIZE })) {
        limit = 50;
      }
      
      // Clamp limit à MAX_PAGE_SIZE
      limit = Math.min(limit, MAX_PAGE_SIZE);
      
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
          const sanitizedExpenses = expenses.filter(e => e.type === ExpenseType.PROVISION);
          return { ...mappedShipment, expenses: sanitizedExpenses };
        }
        return mappedShipment;
      });

      logger.info('Shipments fetched', { role, count: sanitizedShipments.length, page, userId });

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
      logError('Shipments fetch error', error as Error, { userId: req.user?.id, role: req.user?.role });
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
  shipmentsLimiter,
  requireAnyPermission([Permission.VIEW_SHIPMENTS, Permission.VIEW_OWN_SHIPMENTS]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { role, id: userId } = req.user!;
      
      // ✅ Validation UUID
      if (!validator.isUUID(id, 4)) {
        return res.status(400).json({
          success: false,
          message: 'ID dossier invalide (UUID v4 requis)'
        });
      }

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
      
      // ✅ Filtrage CLIENT : masquer DISBURSEMENT expenses (frais agence)
      let sanitizedShipment = shipment;
      if (role === Role.CLIENT) {
        const expenses = shipment.expenses || [];
        const sanitizedExpenses = expenses.filter(e => e.type === ExpenseType.PROVISION);
        sanitizedShipment = { ...shipment, expenses: sanitizedExpenses };
      }

      res.json({
        success: true,
        shipment: sanitizedShipment
      });

    } catch (error: any) {
      logError('Shipment detail fetch error', error as Error, { shipmentId: req.params.id, userId: req.user?.id });
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
  shipmentsLimiter,
  requirePermission(Permission.EDIT_SHIPMENTS),
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.user!;
      const { trackingNumber, clientName, origin, commodityType, description, shippingLine, containerNumber, destination } = req.body;
      
      // ✅ Validation champs requis
      if (!trackingNumber || !clientName || !origin) {
        return res.status(400).json({
          success: false,
          message: 'Champs requis manquants (trackingNumber, clientName, origin)'
        });
      }
      
      // ✅ Validation types
      if (typeof trackingNumber !== 'string' || trackingNumber.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'trackingNumber invalide'
        });
      }
      
      // ✅ Sanitization XSS
      const sanitizedData = {
        trackingNumber: validator.escape(trackingNumber),
        clientName: validator.escape(clientName),
        commodityType: commodityType ? validator.escape(commodityType) : '',
        description: description ? validator.escape(description) : '',
        origin: validator.escape(origin),
        destination: destination ? validator.escape(destination) : '',
        shippingLine: shippingLine ? validator.escape(shippingLine) : 'Maersk',
        containerNumber: containerNumber ? validator.escape(containerNumber) : null
      };
      
      // ✅ Créer en base de données avec Prisma
      const newShipment = await prisma.shipment.create({
        data: {
          trackingNumber: sanitizedData.trackingNumber,
          clientName: sanitizedData.clientName,
          commodityType: sanitizedData.commodityType,
          blNumber: req.body.blNumber,
          containerNumber: sanitizedData.containerNumber,
          status: ShipmentStatus.PENDING,
          createdById: userId
        }
      });

      logger.info('Shipment created', { trackingNumber: newShipment.trackingNumber, userId });

      res.status(201).json({
        success: true,
        shipment: newShipment
      });

    } catch (error: any) {
      logError('Shipment creation error', error as Error, { userId: req.user?.id });
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
  shipmentsLimiter,
  requirePermission(Permission.EDIT_OPERATIONS),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, deliveryInfo } = req.body;
      
      // ✅ Validation UUID
      if (!validator.isUUID(id, 4)) {
        return res.status(400).json({
          success: false,
          message: 'ID dossier invalide (UUID v4 requis)'
        });
      }
      
      // ✅ Validation status (whitelist)
      if (status && !Object.values(ShipmentStatus).includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status invalide',
          allowedValues: Object.values(ShipmentStatus)
        });
      }

      // ✅ UPDATE en DB avec Prisma
      const updatedShipment = await prisma.shipment.update({
        where: { id },
        data: {
          status: status || undefined,
          deliveryDriver: deliveryInfo?.driverName || undefined,
          deliveryDate: deliveryInfo?.deliveryDate ? new Date(deliveryInfo.deliveryDate) : undefined
        }
      });

      logger.info('Shipment status updated', { shipmentId: id, status, userId: req.user?.id });

      res.json({
        success: true,
        shipment: updatedShipment
      });

    } catch (error: any) {
      logError('Shipment status update error', error as Error, { shipmentId: req.params.id, userId: req.user?.id });
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
  shipmentsLimiter,
  requirePermission(Permission.UPLOAD_DOCUMENTS),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const document = req.body;
      
      // ✅ Validation UUID
      if (!validator.isUUID(id, 4)) {
        return res.status(400).json({
          success: false,
          message: 'ID dossier invalide (UUID v4 requis)'
        });
      }

      // ✅ CREATE en DB avec Prisma
      const newDocument = await prisma.document.create({
        data: {
          shipmentId: id,
          name: document.name,
          type: document.type,
          url: document.url || '',
          uploadDate: new Date()
        }
      });

      logger.info('Document added to shipment', { shipmentId: id, documentType: newDocument.type, userId: req.user?.id });

      res.status(201).json({
        success: true,
        document: newDocument
      });

    } catch (error: any) {
      logError('Document add error', error as Error, { shipmentId: req.params.id, userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'ajout du document'
      });
    }
  }
);

export default router;
