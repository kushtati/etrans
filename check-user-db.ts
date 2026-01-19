/**
 * 🔍 VÉRIFICATION UTILISATEURS EN BASE
 * 
 * Script pour vérifier si des utilisateurs existent dans la DB Railway
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('🔍 Connexion à la base de données...\n');
    
    // Compter les utilisateurs
    const userCount = await prisma.user.count();
    console.log(`📊 Nombre total d'utilisateurs: ${userCount}\n`);
    
    if (userCount === 0) {
      console.log('❌ PROBLÈME: Aucun utilisateur en base !');
      console.log('\n💡 Solution: Créer un utilisateur de test avec:');
      console.log('   npx tsx prisma/seed.ts\n');
      return;
    }
    
    // Lister les utilisateurs
    console.log('👥 Liste des utilisateurs:\n');
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    
    users.forEach((user, index) => {
      const status = user.isActive ? '✅ Actif' : '❌ Inactif';
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Status: ${status}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Créé: ${user.createdAt.toLocaleDateString()}\n`);
    });
    
    // Statistiques par rôle
    console.log('\n📈 Statistiques par rôle:');
    const roleStats = await prisma.user.groupBy({
      by: ['role'],
      _count: { role: true }
    });
    
    roleStats.forEach(stat => {
      console.log(`   ${stat.role}: ${stat._count.role} utilisateur(s)`);
    });
    
  } catch (error) {
    console.error('\n❌ Erreur lors de la vérification:', error);
    
    if ((error as any).code === 'P2021') {
      console.log('\n💡 Table "User" n\'existe pas. Exécutez:');
      console.log('   npx prisma migrate deploy');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
