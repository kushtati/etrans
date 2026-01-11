import { z } from 'zod';
import { CommodityType } from '../types';
import { sanitizeString } from './sanitization';
import { validateBLNumber } from './blValidators';
import { validateContainerNumber } from './containerValidators';

/**
 * VALIDATION RENFORCÉE AVEC :
 * ✅ Sanitization XSS (DOMPurify)
 * ✅ Validation BL par compagnie
 * ✅ Validation conteneur ISO 6346 avec check digit
 * ✅ Support multi-villes Guinée
 */

// Villes principales de Guinée pour les destintations
export const GN_CITIES = [
  'Conakry',
  'Kamsar',
  'Boké',
  'Kankan',
  'Labé',
  'Nzérékoré'
] as const;

const today = new Date();
today.setHours(0, 0, 0, 0);

// ========================================
// SCHÉMA CRÉATION DOSSIER (RENFORCÉ)
// ========================================

export const CreateShipmentSchema = z.object({
  clientName: z.string()
    .min(3, "Le nom du client doit contenir au moins 3 caractères")
    .max(100, "Nom trop long (max 100 caractères)")
    .transform((val) => sanitizeString(val)) // ✅ Protection XSS
    .refine((val) => val.length >= 3, { 
      message: "Nom invalide après nettoyage" 
    })
    .refine((val) => /^[a-zA-ZÀ-ÿ\s'-]+$/.test(val), {
      message: "Le nom ne doit contenir que des lettres, espaces, tirets et apostrophes"
    }),
  
  commodityType: z.nativeEnum(CommodityType),
  
  description: z.string()
    .min(5, "La description doit être détaillée (min 5 car.)")
    .max(500, "Description trop longue (max 500 caractères)")
    .transform((val) => sanitizeString(val)), // ✅ Protection XSS
  
  origin: z.string()
    .min(2, "L'origine est requise")
    .max(100, "Origine trop longue")
    .transform((val) => sanitizeString(val)),
  
  destination: z.string()
    .optional()
    .default('Conakry, GN')
    .refine((val) => GN_CITIES.some(city => val.includes(city)),
      { message: `Destination doit être l'une des villes: ${GN_CITIES.join(', ')}` })
    .transform((val) => sanitizeString(val)),
  
  eta: z.string()
    .refine((date) => {
      const parsed = new Date(date);
      return parsed.toString() !== 'Invalid Date';
    }, { message: "Date ETA invalide" })
    .refine((date) => {
      const parsed = new Date(date);
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() - 7); // Max 7 jours passé
      return parsed >= minDate;
    }, { message: "L'ETA ne peut pas être trop ancienne (max 7 jours)" })
    .refine((date) => {
      const parsed = new Date(date);
      const maxDate = new Date(today);
      maxDate.setFullYear(maxDate.getFullYear() + 1); // Max 1 an futur
      return parsed <= maxDate;
    }, { message: "L'ETA ne peut pas être dans plus d'un an" })
    .transform((date) => {
      // Normaliser au format ISO date
      const d = new Date(date);
      return d.toISOString().split('T')[0];
    }),
  
  blNumber: z.string()
    .min(5, "Numéro BL invalide (min 5 caractères)")
    .max(20, "Numéro BL trop long (max 20 caractères)")
    .transform(val => val.toUpperCase().trim().replace(/[\s\-_]/g, '')), // Normalisation
  
  shippingLine: z.string()
    .min(2, "Compagnie maritime requise"),
  
  containerNumber: z.string()
    .optional()
    .transform(val => val ? val.toUpperCase().trim().replace(/[\s\-_]/g, '') : val),
  
  customsRegime: z.enum(['IM4', 'IT', 'AT', 'Export'])

})
// ✅ VALIDATION BL PAR COMPAGNIE
.refine(
  (data) => {
    const blValidation = validateBLNumber(data.blNumber, data.shippingLine);
    return blValidation.isValid;
  },
  (data) => {
    const blValidation = validateBLNumber(data.blNumber, data.shippingLine);
    return {
      message: blValidation.error || "Format BL invalide pour cette compagnie maritime",
      path: ["blNumber"]
    };
  }
)
// ✅ VALIDATION CONTENEUR ISO 6346 (Check Digit)
.refine(
  (data) => {
    if (!data.containerNumber) return true; // Optionnel
    const containerValidation = validateContainerNumber(data.containerNumber);
    return containerValidation.isValid;
  },
  (data) => {
    if (!data.containerNumber) return { message: "", path: ["containerNumber"] };
    const containerValidation = validateContainerNumber(data.containerNumber);
    return {
      message: containerValidation.error || "Numéro de conteneur invalide",
      path: ["containerNumber"]
    };
  }
)
// Validation contextuelle régimes douaniers
.refine(
  (data) => {
    // IT (Transit) ne peut pas avoir destination Conakry
    if (data.customsRegime === 'IT' && data.destination.toLowerCase().includes('conakry')) {
      return false;
    }
    return true;
  },
  {
    message: "Le régime Transit (IT) nécessite une destination hors Guinée",
    path: ["customsRegime"]
  }
)
.refine(
  (data) => {
    // Export doit partir de Guinée
    if (data.customsRegime === 'Export' && !data.origin.toLowerCase().includes('gn')) {
      return false;
    }
    return true;
  },
  {
    message: "Le régime Export nécessite une origine en Guinée",
    path: ["customsRegime"]
  }
);

// ========================================
// SCHÉMA DÉPENSES FINANCIÈRES (RENFORCÉ)
// ========================================

const MAX_REASONABLE_AMOUNT_GNF = 1000000000; // 1 milliard GNF ≈ 110k EUR

export const ExpenseSchema = z.object({
  description: z.string()
    .min(3, "Description requise (min 3 caractères)")
    .max(200, "Description trop longue (max 200 caractères)")
    .transform((val) => sanitizeString(val)), // ✅ Protection XSS
  
  amount: z.number()
    .positive("Le montant doit être positif")
    .max(MAX_REASONABLE_AMOUNT_GNF, "Montant suspect (max 1 milliard GNF)")
    .int("Le montant doit être un entier (pas de centimes en GNF)")
    .refine(
      (val) => val >= 1000,
      { message: "Montant minimum 1000 GNF" }
    ),
  
  category: z.enum(['Douane', 'Port', 'Logistique', 'Agence', 'Autre']),
  
  type: z.enum(['PROVISION', 'DISBURSEMENT', 'FEE'])
});

// ========================================
// SCHÉMAS AUTHENTIFICATION
// ========================================

export const LoginSchema = z.object({
  email: z.string()
    .email("Email invalide")
    .toLowerCase()
    .trim()
    .transform((val) => sanitizeString(val)),
  
  password: z.string()
    .min(8, "Mot de passe trop court (min 8 caractères)")
    .max(100, "Mot de passe trop long")
});

export const CreateUserSchema = z.object({
  email: z.string()
    .email("Email invalide")
    .toLowerCase()
    .trim()
    .transform((val) => sanitizeString(val)),
  
  name: z.string()
    .min(3, "Nom complet requis (min 3 caractères)")
    .max(100, "Nom trop long")
    .transform((val) => sanitizeString(val)),
  
  role: z.enum(['CLIENT', 'Agent Terrain', 'Chargé de Création', 'Comptable', 'DG / Admin']),
  
  password: z.string()
    .min(12, "Mot de passe minimum 12 caractères")
    .refine(
      (pwd) => /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd),
      { message: "Mot de passe doit contenir majuscule, minuscule et chiffre" }
    ),
  
  confirmPassword: z.string()
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"]
  }
);

export const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  
  newPassword: z.string()
    .min(12, "Nouveau mot de passe minimum 12 caractères")
    .refine(
      (pwd) => /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd) && /[!@#$%^&*]/.test(pwd),
      { message: "Doit contenir majuscule, minuscule, chiffre et caractère spécial" }
    ),
  
  confirmNewPassword: z.string()
}).refine(
  (data) => data.newPassword === data.confirmNewPassword,
  { message: "Confirmation différente", path: ["confirmNewPassword"] }
).refine(
  (data) => data.currentPassword !== data.newPassword,
  { message: "Le nouveau mot de passe doit être différent", path: ["newPassword"] }
);

// ========================================
// TYPES INFÉRÉS
// ========================================

export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;
export type ExpenseInput = z.infer<typeof ExpenseSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;