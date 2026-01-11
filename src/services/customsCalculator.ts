/**
 * Customs Calculator - Guinea (Guinée)
 * 
 * Centralizes all customs duties calculations using decimal.js
 * for financial precision (no floating-point errors)
 * 
 * Formula (Guinea 2026):
 * - CAF = FOB + Freight + Insurance
 * - DD (Droits de Douane): CAF * dd_rate
 * - RTL (Redevance Terminal Lieu): CAF * rtl_rate
 * - RDL (Redevance Droits et Licence): CAF * rdl_rate
 * - TVS (Taxe Valeur Spécifique): (CAF + DD) * tvs_rate
 * - Total Duties: DD + RTL + RDL + TVS
 */

import Decimal from 'decimal.js';
import { CustomsRates } from '../types';

// Configure Decimal.js for financial precision (2 decimal places)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface CustomsDutiesBreakdown {
  valueCAF: number;        // Cost + Freight + Insurance (GNF)
  dd: number;              // Droits de Douane (GNF)
  rtl: number;             // Redevance Terminal Lieu (GNF)
  rdl: number;             // Redevance Droits et Licence (GNF)
  tvs: number;             // Taxe de Valeur Spécifique (GNF)
  totalDuties: number;     // Total (GNF)
  taxableBaseTVS: number;  // CAF + DD (base for TVS calculation)
}

/**
 * Calculate all customs duties for a shipment
 * 
 * @param valueFOB - Free On Board value (GNF)
 * @param freight - Freight cost (GNF)
 * @param insurance - Insurance cost (GNF)
 * @param rates - Current customs rates
 * @returns Detailed breakdown of all duties
 */
export function calculateCustomsDuties(
  valueFOB: number,
  freight: number,
  insurance: number,
  rates: CustomsRates
): CustomsDutiesBreakdown {
  // Convert to Decimal for precision
  const fob = new Decimal(valueFOB);
  const frg = new Decimal(freight);
  const ins = new Decimal(insurance);

  // Step 1: Calculate CAF (Cost + Assurance + Fret)
  const caf = fob.plus(frg).plus(ins);

  // Step 2: Calculate duties on CAF
  const dd = caf.times(rates.dd);
  const rtl = caf.times(rates.rtl);
  const rdl = caf.times(rates.rdl);

  // Step 3: Calculate TVS on (CAF + DD) only
  const taxableBaseTVS = caf.plus(dd);
  const tvs = taxableBaseTVS.times(rates.tvs);

  // Step 4: Calculate total
  const totalDuties = dd.plus(rtl).plus(rdl).plus(tvs);

  // Return as numbers (rounded to 2 decimals for GNF)
  return {
    valueCAF: caf.toDecimalPlaces(2).toNumber(),
    dd: dd.toDecimalPlaces(2).toNumber(),
    rtl: rtl.toDecimalPlaces(2).toNumber(),
    rdl: rdl.toDecimalPlaces(2).toNumber(),
    tvs: tvs.toDecimalPlaces(2).toNumber(),
    totalDuties: totalDuties.toDecimalPlaces(2).toNumber(),
    taxableBaseTVS: taxableBaseTVS.toDecimalPlaces(2).toNumber(),
  };
}

/**
 * Validate that rates are within acceptable bounds
 * 
 * @param rates - Customs rates to validate
 * @returns true if valid, false otherwise
 */
export function validateCustomsRates(rates: CustomsRates): boolean {
  // All rates must be between 0 and 100%
  const ratesArray = [rates.dd, rates.rtl, rates.rdl, rates.tvs];
  return ratesArray.every(rate => rate >= 0 && rate <= 1);
}

/**
 * Calculate percentage of CAF represented by total duties
 * Typical range: 40-60% for Guinea
 * 
 * @param breakdown - Customs duties breakdown
 * @returns Percentage (0-1)
 */
export function calculateDutiesPercentage(breakdown: CustomsDutiesBreakdown): number {
  if (breakdown.valueCAF === 0) return 0;
  return new Decimal(breakdown.totalDuties)
    .dividedBy(breakdown.valueCAF)
    .toDecimalPlaces(4)
    .toNumber();
}
