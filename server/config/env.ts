/**
 * 🔐 CHARGEMENT VARIABLES ENVIRONNEMENT
 * 
 * Ce fichier DOIT être importé en premier dans server/index.ts
 * pour garantir que les variables sont disponibles avant tout autre import
 */

import fs from 'fs';
import path from 'path';

// Charger .env.server si existe
const envPath = path.join(process.cwd(), '.env.server');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    
    // Ignorer commentaires et lignes vides
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    
    // Parser key=value (supporter valeurs avec =)
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      return;
    }
    
    const key = trimmed.substring(0, equalIndex).trim();
    const value = trimmed.substring(equalIndex + 1).trim();
    
    if (key && value) {
      process.env[key] = value;
      
      // 🔐 SÉCURITÉ : Masquer credentials sensibles dans logs
      // Regex générique pour détecter toute variable sensible
      const isSensitive = /(SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL|AUTH|API_KEY|DATABASE|REDIS|PRIVATE|URL|SMTP|WEBHOOK|STRIPE|CLIENT_SECRET|BEARER)/i.test(key);
      
      if (isSensitive) {
        console.log(`[ENV] Loaded: ${key} = [HIDDEN]`);
      } else {
        console.log(`[ENV] Loaded: ${key} = ${value.substring(0, 20)}...`);
      }
    }
  });
  
  console.log('[ENV] ✅ .env.server loaded successfully');
} else {
  // En production, Railway injecte les variables directement (normal)
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[ENV] ⚠️  .env.server not found, using system environment variables');
  }
}

// Export pour permettre import
export {};
