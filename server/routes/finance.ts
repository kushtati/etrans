/**
 * ROUTES FINANCE - SÉCURISÉES PAR PERMISSIONS
 * 
 * Exemple d'implémentation avec vérification côté serveur
 */

import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import { Permission } from '../utils/permissions';
import { requirePermission, requireAnyPermission } from '../middleware/permissions';
import { authenticateJWT } from './auth';
import { logger, logError } from '../config/logger';
import { prisma } from '../config/prisma';

const router = express.Router();

// 🚦 Rate Limiting : 500 requêtes/15min pour finance (per-user)
const financeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15min
  max: 500,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
  message: { error: 'Limite finance atteinte. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false // ✅ Désactive toutes validations (compatible proxy)
});

// 🔒 CONSTANTES DE SÉCURITÉ
const MAX_AMOUNT = 999999999; // 999M GNF max
const MIN_AMOUNT = 0.01; // 1 centime min

/**
 * GET /api/finance/overview/:shipmentId
 * Voir le résumé financier d'un dossier
 * 
 * Permissions: VIEW_FINANCE
 */
router.get(
  '/overview/:shipmentId',
  authenticateJWT,
  financeLimiter,
  requirePermission(Permission.VIEW_FINANCE),
  async (req: Request, res: Response) => {
    try {
      const { shipmentId } = req.params;
      
      // ✅ Validation UUID shipmentId
      if (!validator.isUUID(shipmentId, 4)) {
        return res.status(400).json({
          success: false,
          message: 'ShipmentId invalide (UUID v4 requis)'
        });
      }
      
      // TODO: Implémenter requête Prisma vers table Expense
      // const expenses = await prisma.expense.findMany({ where: { shipmentId } });
      
      res.status(501).json({
        success: false,
        message: 'Endpoint non implémenté - Base de données requise',
        todo: 'Implémenter Prisma query vers table Expense'
      });

    } catch (error: any) {
      logError('Finance overview error', error as Error, { shipmentId: req.params.shipmentId, userId: req.user?.id });
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des données financières'
      });
    }
  }
);

/**
 * POST /api/finance/expenses
 * Ajouter une dépense
 * 
 * Permissions: ADD_EXPENSES
 */
router.post(
  '/expenses',
  authenticateJWT,
  financeLimiter,
  requirePermission(Permission.ADD_EXPENSES),
  async (req: Request, res: Response) => {
    try {
      const { shipmentId, type, amount, description, receiptUrl, id, category, paid, date } = req.body;
      
      // ✅ Validation champs requis
      if (!shipmentId || !type || !amount) {
        return res.status(400).json({
          success: false,
          message: 'Champs requis manquants'
        });
      }
      
      // ✅ Validation UUID shipmentId
      if (!validator.isUUID(shipmentId, 4)) {
        return res.status(400).json({
          success: false,
          message: 'ShipmentId invalide (UUID v4 requis)'
        });
      }
      
      // ✅ Validation montant (protection NaN/Infinity/négatif)
      if (!validator.isFloat(String(amount), { min: MIN_AMOUNT, max: MAX_AMOUNT })) {
        return res.status(400).json({
          success: false,
          message: `Montant invalide (min ${MIN_AMOUNT}, max ${MAX_AMOUNT})`,
        });
      }
      
      // ✅ Validation type (string non vide)
      if (typeof type !== 'string' || type.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Type de dépense invalide'
        });
      }
      
      // ✅ Sanitization XSS sur description et receiptUrl
      const sanitizedDescription = description ? validator.escape(description) : '';
      const sanitizedReceiptUrl = receiptUrl ? validator.escape(receiptUrl) : null;

      // ✅ PERSISTANCE POSTGRESQL avec Prisma
      const expense = await prisma.expense.create({
        data: {
          id: id || undefined, // Laisser Prisma générer si absent
          shipmentId,
          type: type as any,
          amount: parseFloat(amount),
          description: sanitizedDescription,
          category: category ? validator.escape(category) : 'Autre',
          paid: paid || false,
          date: date ? new Date(date) : new Date(),
          receiptUrl: sanitizedReceiptUrl
        }
      });
      
      logger.info('Expense saved to DB', { expenseId: expense.id, userId: req.user?.id, shipmentId });
      
      res.status(200).json({
        success: true,
        message: 'Dépense ajoutée avec succès',
        data: expense
      });

    } catch (error: any) {
      logError('Finance add expense error', error as Error, { userId: req.user?.id, shipmentId: req.body.shipmentId });
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'ajout de la dépense'
      });
    }
  }
);

/**
 * POST /api/finance/payments/liquidation
 * Payer la liquidation douanière
 * 
 * Permissions: MAKE_PAYMENTS
 */
router.post(
  '/payments/liquidation',
  authenticateJWT,
  financeLimiter,
  requirePermission(Permission.MAKE_PAYMENTS),
  async (req: Request, res: Response) => {
    try {
      const { shipmentId } = req.body;

      if (!shipmentId) {
        return res.status(400).json({
          success: false,
          message: 'ID dossier requis'
        });
      }
      
      // ✅ Validation UUID shipmentId
      if (!validator.isUUID(shipmentId, 4)) {
        return res.status(400).json({
          success: false,
          message: 'ShipmentId invalide (UUID v4 requis)'
        });
      }

      // ✅ MOCK: Simuler le paiement (en attendant Prisma)
      logger.info('Liquidation payment (MOCK)', { shipmentId, userId: req.user?.id });
      
      res.status(200).json({
        success: true,
        message: 'Paiement de liquidation effectué avec succès',
        data: {
          shipmentId,
          paymentId: `pay_${Date.now()}`,
          amount: 0, // À calculer côté frontend
          paidAt: new Date().toISOString()
        }
      });

    } catch (error: any) {
      logError('Finance liquidation payment error', error as Error, { userId: req.user?.id, shipmentId: req.body.shipmentId });
      res.status(500).json({
        success: false,
        message: 'Erreur lors du paiement'
      });
    }
  }
);

/**
 * PUT /api/finance/expenses/:expenseId/approve
 * Approuver une dépense
 * 
 * Permissions: APPROVE_EXPENSES
 */
router.put(
  '/expenses/:expenseId/approve',
  authenticateJWT,
  financeLimiter,
  requirePermission(Permission.APPROVE_EXPENSES),
  async (req: Request, res: Response) => {
    try {
      const { expenseId } = req.params;
      
      // ✅ Validation UUID expenseId
      if (!validator.isUUID(expenseId, 4)) {
        return res.status(400).json({
          success: false,
          message: 'ExpenseId invalide (UUID v4 requis)'
        });
      }

      // TODO: Mettre à jour DB avec Prisma
      // await prisma.expense.update({ where: { id: expenseId }, data: { approved: true } });
      
      res.status(501).json({
        success: false,
        message: 'Endpoint non implémenté - Base de données requise',
        todo: 'Implémenter Prisma expense.update()'
      });

    } catch (error: any) {
      logError('Finance approve expense error', error as Error, { userId: req.user?.id, expenseId: req.params.expenseId });
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'approbation'
      });
    }
  }
);

/**
 * GET /api/finance/reports/monthly
 * Rapport mensuel (DIRECTOR ou ACCOUNTANT)
 * 
 * Permissions: Soit VIEW_FINANCE, soit EXPORT_DATA
 */
router.get(
  '/reports/monthly',
  authenticateJWT,
  financeLimiter,
  requireAnyPermission([Permission.VIEW_FINANCE, Permission.EXPORT_DATA]),
  async (req: Request, res: Response) => {
    try {
      const { month, year } = req.query;
      
      // ✅ Validation month (1-12)
      if (month && !validator.isInt(String(month), { min: 1, max: 12 })) {
        return res.status(400).json({
          success: false,
          message: 'Mois invalide (1-12 requis)'
        });
      }
      
      // ✅ Validation year (2020-2050)
      if (year && !validator.isInt(String(year), { min: 2020, max: 2050 })) {
        return res.status(400).json({
          success: false,
          message: 'Année invalide (2020-2050)'
        });
      }

      // TODO: Générer rapport avec Prisma aggregations
      // const report = await prisma.expense.aggregate({ ... });
      
      res.status(501).json({
        success: false,
        message: 'Endpoint non implémenté - Base de données requise',
        todo: 'Implémenter rapport financier avec Prisma aggregations'
      });

    } catch (error: any) {
      logError('Finance monthly report error', error as Error, { userId: req.user?.id, month: req.query.month, year: req.query.year });
      res.status(500).json({
        success: false,
        message: 'Erreur génération rapport'
      });
    }
  }
);

export default router;
