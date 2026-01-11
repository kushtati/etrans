/**
 * Test de connexion Prisma
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('🔍 Test connexion Prisma...');
    
    // Test 1: Count users
    const userCount = await prisma.user.count();
    console.log(`✅ Nombre d'utilisateurs: ${userCount}`);
    
    // Test 2: Find admin
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@transit.gn' }
    });
    
    if (admin) {
      console.log(`✅ Admin trouvé: ${admin.email} (${admin.role})`);
    } else {
      console.log('❌ Admin non trouvé');
    }
    
    // Test 3: List all users
    const users = await prisma.user.findMany({
      select: {
        email: true,
        role: true,
        createdAt: true
      }
    });
    
    console.log(`\n📋 Liste des utilisateurs (${users.length}):`);
    users.forEach(user => {
      console.log(`   - ${user.email} (${user.role})`);
    });
    
  } catch (error) {
    console.error('❌ Erreur Prisma:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
