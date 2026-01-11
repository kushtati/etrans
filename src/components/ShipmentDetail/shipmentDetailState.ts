/**
 * SHIPMENT DETAIL - STATE MANAGEMENT
 * 
 * Reducer centralisé pour gérer tous les états du composant ShipmentDetail
 * Remplace les multiples useState par un pattern plus maintenable
 */

import { Shipment } from '../../types';

// ============================================
// TYPES
// ============================================

export interface OCRAnalysisResult {
  text: string;
  confidence: number;
  detectedFields?: Record<string, string>;
  timestamp?: string;
}

// ============================================
// STATE TYPE
// ============================================

export interface ShipmentDetailState {
  // Tab Navigation
  activeTab: 'timeline' | 'docs' | 'finance';
  
  // Scanner
  showScanner: boolean;
  analysisResult: OCRAnalysisResult | null;
  scanContext: {
    type: 'generic' | 'BAE' | 'TRUCK_PHOTO' | 'RECEIPT';
    expenseId?: string;
  };
  
  // Forms
  deliveryForm: {
    driverName: string;
    truckPlate: string;
    recipientName: string;
  };
  declForm: {
    number: string;
    amount: string;
  };
  financeForm: {
    amount: string;
    description: string;
  };
  editForm: Partial<Shipment>;
  
  // UI State
  isEditing: boolean;
  showFinanceInput: 'PROVISION' | 'DISBURSEMENT' | null;
  paymentError: string | null;
}

// ============================================
// ACTIONS
// ============================================

export type ShipmentDetailAction =
  | { type: 'SET_ACTIVE_TAB'; payload: 'timeline' | 'docs' | 'finance' }
  | { type: 'OPEN_SCANNER'; payload: { type: 'generic' | 'BAE' | 'TRUCK_PHOTO' | 'RECEIPT'; expenseId?: string } }
  | { type: 'CLOSE_SCANNER' }
  | { type: 'SET_ANALYSIS_RESULT'; payload: any }
  | { type: 'UPDATE_DELIVERY_FORM'; payload: Partial<ShipmentDetailState['deliveryForm']> }
  | { type: 'UPDATE_DECL_FORM'; payload: Partial<ShipmentDetailState['declForm']> }
  | { type: 'UPDATE_FINANCE_FORM'; payload: Partial<ShipmentDetailState['financeForm']> }
  | { type: 'UPDATE_EDIT_FORM'; payload: Partial<Shipment> }
  | { type: 'TOGGLE_EDITING' }
  | { type: 'SHOW_FINANCE_INPUT'; payload: 'PROVISION' | 'DISBURSEMENT' | null }
  | { type: 'SET_PAYMENT_ERROR'; payload: string | null }
  | { type: 'RESET_FORMS' };

// ============================================
// INITIAL STATE
// ============================================

export const createInitialState = (defaultTab: 'timeline' | 'docs' | 'finance' = 'timeline'): ShipmentDetailState => ({
  activeTab: defaultTab,
  showScanner: false,
  analysisResult: null,
  scanContext: { type: 'generic' },
  deliveryForm: { driverName: '', truckPlate: '', recipientName: '' },
  declForm: { number: '', amount: '' },
  financeForm: { amount: '', description: '' },
  editForm: {},
  isEditing: false,
  showFinanceInput: null,
  paymentError: null,
});

// ============================================
// REDUCER
// ============================================

export const shipmentDetailReducer = (
  state: ShipmentDetailState,
  action: ShipmentDetailAction
): ShipmentDetailState => {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
      
    case 'OPEN_SCANNER':
      return {
        ...state,
        showScanner: true,
        scanContext: action.payload,
      };
      
    case 'CLOSE_SCANNER':
      return { ...state, showScanner: false };
      
    case 'SET_ANALYSIS_RESULT':
      return {
        ...state,
        analysisResult: action.payload,
        showScanner: false,
      };
      
    case 'UPDATE_DELIVERY_FORM':
      return {
        ...state,
        deliveryForm: { ...state.deliveryForm, ...action.payload },
      };
      
    case 'UPDATE_DECL_FORM':
      return {
        ...state,
        declForm: { ...state.declForm, ...action.payload },
      };
      
    case 'UPDATE_FINANCE_FORM':
      return {
        ...state,
        financeForm: { ...state.financeForm, ...action.payload },
      };
      
    case 'UPDATE_EDIT_FORM':
      return {
        ...state,
        editForm: { ...state.editForm, ...action.payload },
      };
      
    case 'TOGGLE_EDITING':
      return { ...state, isEditing: !state.isEditing };
      
    case 'SHOW_FINANCE_INPUT':
      return { ...state, showFinanceInput: action.payload };
      
    case 'SET_PAYMENT_ERROR':
      return { ...state, paymentError: action.payload };
      
    case 'RESET_FORMS':
      return {
        ...state,
        deliveryForm: { driverName: '', truckPlate: '', recipientName: '' },
        declForm: { number: '', amount: '' },
        financeForm: { amount: '', description: '' },
        editForm: {},
        paymentError: null,
      };
      
    default:
      return state;
  }
};
