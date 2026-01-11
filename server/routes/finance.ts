/**
 * ROUTES FINANCE - SÉCURISÉES PAR PERMISSIONS
 * 
 * Exemple d'implémentation avec vérification côté serveur
 */

import express, { Request, Response } from 'express';
import { Permission } from '../utils/permissions';
import { requirePermission, requireAnyPermission } from '../middleware/permissions';
import { authenticateJWT } from './auth';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/finance/overview/:shipmentId
 * Voir le résumé financier d'un dossier
 * 
 * Permissions: VIEW_FINANCE
 */
router.get(
  '/overview/:shipmentId',
  authenticateJWT,
  requirePermission(Permission.VIEW_FINANCE),
  async (req: Request, res: Response) => {
    try {
      const { shipmentId } = req.params;
      
      // TODO: Implémenter requête Prisma vers table Expense
      // const expenses = await prisma.expense.findMany({ where: { shipmentId } });
      
      res.status(501).json({
        success: false,
        message: 'Endpoint non implémenté - Base de données requise',
        todo: 'Implémenter Prisma query vers table Expense'
      });

    } catch (error: any) {
      console.error('[FINANCE] Error fetching overview:', error);
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
  requirePermission(Permission.ADD_EXPENSES),
  async (req: Request, res: Response) => {
    try {
      const { shipmentId, type, amount, description, receiptUrl, id, category, paid, date } = req.body;
      
      // Validation
      if (!shipmentId || !type || !amount) {
        return res.status(400).json({
          success: false,
          message: 'Champs requis manquants'
        });
      }

      // ✅ PERSISTANCE POSTGRESQL avec Prisma
      const expense = await prisma.expense.create({
        data: {
          id: id || undefined, // Laisser Prisma générer si absent
          shipmentId,
          type,
          amount: parseFloat(amount),
          description: description || '',
          category: category || 'Autre',
          paid: paid || false,
          date: date ? new Date(date) : new Date(),
          receiptUrl: receiptUrl || null
        }
      });
      
      console.log('[FINANCE] ✅ Expense saved to DB:', expense);
      
      res.status(200).json({
        success: true,
        message: 'Dépense ajoutée avec succès',
        data: expense
      });

    } catch (error: any) {
      console.error('[FINANCE] Error adding expense:', error);
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

      // ✅ MOCK: Simuler le paiement (en attendant Prisma)
      console.log('[FINANCE] ✅ Liquidation payment (MOCK):', shipmentId);
      
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
      console.error('[FINANCE] Error paying liquidation:', error);
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
  requirePermission(Permission.APPROVE_EXPENSES),
  async (req: Request, res: Response) => {
    try {
      const { expenseId } = req.params;

      // TODO: Mettre à jour DB avec Prisma
      // await prisma.expense.update({ where: { id: expenseId }, data: { approved: true } });
      
      res.status(501).json({
        success: false,
        message: 'Endpoint non implémenté - Base de données requise',
        todo: 'Implémenter Prisma expense.update()'
      });

    } catch (error: any) {
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
  requireAnyPermission([Permission.VIEW_FINANCE, Permission.EXPORT_DATA]),
  async (req: Request, res: Response) => {
    try {
      const { month, year } = req.query;

      // TODO: Générer rapport avec Prisma aggregations
      // const report = await prisma.expense.aggregate({ ... });
      
      res.status(501).json({
        success: false,
        message: 'Endpoint non implémenté - Base de données requise',
        todo: 'Implémenter rapport financier avec Prisma aggregations'
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur génération rapport'
      });
    }
  }
);

export default router;
