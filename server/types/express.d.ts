/**
 * Type Augmentation pour Express
 * Ajoute la propriété user aux Request objects
 */

import 'express';

declare module 'express' {
  export interface Request {
    user?: {
      id: string;
      email: string;
      name?: string;
      role: string;
      permissions: string;
    };
  }
}
