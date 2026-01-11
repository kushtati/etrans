// @prisma/client n'exporte pas defineConfig (utilisé uniquement pour schema.prisma)
import * as dotenv from 'dotenv'
import * as path from 'path'

// Charger .env.server
dotenv.config({ path: path.join(__dirname, '..', '.env.server') })

// 🔐 SÉCURITÉ : Pas de fallback avec credentials hardcodés
if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL manquant dans .env.server ! Impossible de démarrer.');
}

// Configuration Prisma (utilisée par le client, pas besoin de defineConfig ici)
export const prismaConfig = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
}
