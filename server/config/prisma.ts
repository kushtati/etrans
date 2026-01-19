/**
 * 🗄️ PRISMA CLIENT SINGLETON
 * 
 * Garantit une seule instance de PrismaClient dans l'application
 * Évite les fuites de connexions et améliore les performances
 */
import { PrismaClient } from '@prisma/client';

// Singleton global (survit au hot-reload en dev)
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Instance Prisma partagée
 * 
 * - En dev: réutilise l'instance globale (hot-reload friendly)
 * - En prod: crée une nouvelle instance avec pool de connexions optimisé
 */
export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// En dev, conserver l'instance globale
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
