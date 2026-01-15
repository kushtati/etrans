/**
 * API SERVICE - CLIENT HTTP SÉCURISÉ
 * 
 * Centralise tous les appels API avec gestion d'erreurs
 * et authentification automatique
 */

import { Shipment, Document, Expense, ShipmentStatus, DeliveryInfo } from '../types';
import { logger } from './logger';

// Utiliser Railway backend en production, URL relative seulement en dev avec proxy
const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

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
      
      // Retry uniquement sur 5xx (erreurs serveur), pas 4xx (erreurs client)
      if (response.status >= 500 && attempt < retries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(`Server error ${response.status}, retrying`, { url, attempt: attempt + 1, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (err) {
      // Erreur réseau (NetworkError, Timeout) - retry
      const isLastAttempt = attempt === retries - 1;
      
      if (isLastAttempt) {
        logger.error('Network error after retries', { url, attempt, error: err });
        throw err;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn(`Network error, retrying`, { url, attempt: attempt + 1, delay });
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
      logger.warn('Authentication required', { status: 401 });
      throw new Error('Session expirée');
    }
    
    if (response.status === 403) {
      // Logger pour audit RGPD (tentative accès non autorisé)
      logger.warn('Access forbidden', { status: 403, error: error.message });
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

/**
 * Mettre à jour date d'arrivée
 */
export const updateArrivalDate = async (shipmentId: string, date: string): Promise<Shipment> => {
  const response = await fetch(`${API_BASE_URL}/shipments/${shipmentId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ arrivalDate: date }),
  });

  const data = await handleResponse(response);
  return data.shipment;
};

/**
 * Enregistrer déclaration douanière
 */
export const setDeclaration = async (
  shipmentId: string, 
  declarationNumber: string, 
  liquidationAmount: number
): Promise<Shipment> => {
  const response = await fetch(`${API_BASE_URL}/shipments/${shipmentId}/declaration`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ declarationNumber, liquidationAmount }),
  });

  const data = await handleResponse(response);
  return data.shipment;
};

/**
 * Mettre à jour détails dossier
 */
export const updateShipment = async (
  shipmentId: string, 
  updates: Partial<Shipment>
): Promise<Shipment> => {
  const response = await fetch(`${API_BASE_URL}/shipments/${shipmentId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(updates),
  });

  const data = await handleResponse(response);
  return data.shipment;
};

// ============================================
// AUTH API - Voir authService.ts
// ============================================
// Login/Logout déplacés vers authService.ts pour éviter duplication
