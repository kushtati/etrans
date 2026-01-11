/**
 * API SERVICE - CLIENT HTTP SÉCURISÉ
 * 
 * Centralise tous les appels API avec gestion d'erreurs
 * et authentification automatique
 */

import { Shipment, Document, Expense, ShipmentStatus, DeliveryInfo } from '../types';
import { logger } from './logger';

const API_BASE_URL = '/api';

/**
 * Retry logic pour réseau 3G instable Guinée
 * Exponential backoff: 1s, 2s, 4s
 */
const retryableFetch = async (
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      const isLastAttempt = attempt === retries - 1;
      
      if (isLastAttempt) {
        logger.error('Fetch failed after retries', { url, attempt, error: err });
        throw err;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(`Retry fetch attempt ${attempt + 1}/${retries}`, { url, delay });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Retry logic exhausted');
};

/**
 * Configuration par défaut des requêtes
 * 
 * ✅ SÉCURITÉ: Authentification via cookie httpOnly
 * Le navigateur envoie automatiquement le cookie avec credentials: 'include'
 */
const getHeaders = (): HeadersInit => {
  return {
    'Content-Type': 'application/json',
  };
};

/**
 * Gestion centralisée des erreurs HTTP
 */
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur réseau' }));
    
    if (response.status === 401) {
      // Token expiré ou invalide - Ne PAS rediriger automatiquement
      // L'AppLayout affichera le LoginScreen via isAuthenticated state
      logger.warn('Unauthorized request - User not authenticated');
      throw new Error('Session expirée');
    }
    
    if (response.status === 403) {
      // Error will be thrown and caught by caller with logger
      throw new Error(error.message || 'Accès refusé');
    }

    throw new Error(error.message || 'Erreur serveur');
  }

  return response.json();
};

// ============================================
// SHIPMENTS API
// ============================================

/**
 * Récupérer tous les dossiers selon permissions
 */
export const fetchShipments = async (): Promise<Shipment[]> => {
  const response = await retryableFetch(`${API_BASE_URL}/shipments`, {
    method: 'GET',
    headers: getHeaders(),
    credentials: 'include', // Envoie cookies httpOnly
  });

  const data = await handleResponse(response);
  return data.shipments;
};

/**
 * Récupérer un dossier spécifique
 */
export const fetchShipment = async (id: string): Promise<Shipment> => {
  const response = await fetch(`${API_BASE_URL}/shipments/${id}`, {
    method: 'GET',
    headers: getHeaders(),
    credentials: 'include',
  });

  const data = await handleResponse(response);
  return data.shipment;
};

/**
 * Créer un nouveau dossier
 */
export const createShipment = async (shipmentData: Partial<Shipment>): Promise<Shipment> => {
  const response = await retryableFetch(`${API_BASE_URL}/shipments`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(shipmentData),
  });

  const data = await handleResponse(response);
  return data.shipment;
};

/**
 * Mettre à jour le statut d'un dossier
 */
export const updateShipmentStatus = async (
  id: string, 
  status: ShipmentStatus, 
  deliveryInfo?: DeliveryInfo
): Promise<Shipment> => {
  const response = await fetch(`${API_BASE_URL}/shipments/${id}/status`, {
    method: 'PUT',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ status, deliveryInfo }),
  });

  const data = await handleResponse(response);
  return data.shipment;
};

/**
 * Ajouter un document à un dossier
 */
export const addDocumentToShipment = async (
  id: string, 
  document: Partial<Document>
): Promise<Document> => {
  const response = await fetch(`${API_BASE_URL}/shipments/${id}/documents`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(document),
  });

  const data = await handleResponse(response);
  return data.document;
};

// ============================================
// FINANCE API
// ============================================

/**
 * Récupérer les données financières d'un dossier
 */
export const fetchFinanceOverview = async (shipmentId: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/finance/overview/${shipmentId}`, {
    method: 'GET',
    headers: getHeaders(),
    credentials: 'include',
  });

  const data = await handleResponse(response);
  return data.data;
};

/**
 * Ajouter une dépense
 */
export const addExpense = async (
  shipmentId: string,
  expense: Partial<Expense>
): Promise<Expense> => {
  const response = await fetch(`${API_BASE_URL}/finance/expenses`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ shipmentId, ...expense }),
  });

  const data = await handleResponse(response);
  return data.data;
};

/**
 * Payer la liquidation douanière
 */
export const payLiquidation = async (shipmentId: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/finance/payments/liquidation`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ shipmentId }),
  });

  const data = await handleResponse(response);
  return data;
};

// ============================================
// AUTH API
// ============================================

/**
 * Login
 * 
 * ✅ SÉCURITÉ: Le token est stocké dans cookie httpOnly
 * Pas de stockage côté client
 */
export const login = async (email: string, password: string): Promise<any> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const data = await handleResponse(response);
  
  // ✅ Le token est automatiquement stocké dans le cookie httpOnly
  // Pas besoin de le gérer manuellement
  
  return data;
};

/**
 * Logout
 * 
 * ✅ SÉCURITÉ: Supprime le cookie httpOnly côté serveur
 */
export const logout = async (): Promise<void> => {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
  });
  
  // ✅ Le cookie httpOnly est supprimé côté serveur
  // Pas de nettoyage côté client nécessaire
};
