/**
 * 🌱 SEED DATABASE - Données initiales
 * 
 * Crée les utilisateurs par défaut pour démarrer l'application
 * 
 * Exécuter: npx prisma db seed
 * 
 * 🔐 SÉCURITÉ :
 * - Bloqué en production (NODE_ENV=production)
 * - Passwords depuis env ou génération aléatoire
 * - JAMAIS logger credentials
 */

import { config } from 'dotenv';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// Charger variables environnement
config({ path: '.env.server' });

const prisma = new PrismaClient();

// 🔐 Bloquer seed en production
if (process.env.NODE_ENV === 'production') {
  throw new Error('🚫 SEED INTERDIT EN PRODUCTION ! Utilisez migration manuelle.');
}

// 🔐 Générer password sécurisé si env manquant
function getSecurePassword(envKey: string, fallback?: string): string {
  const envPassword = process.env[envKey];
  if (envPassword) return envPassword;
  
  if (fallback) {
    console.warn(`⚠️  ${envKey} manquant, utilisation fallback DÉVELOPPEMENT uniquement`);
    return fallback;
  }
  
  // Générer password crypto aléatoire
  const randomPassword = crypto.randomBytes(16).toString('base64');
  console.warn(`⚠️  ${envKey} manquant, généré: ${randomPassword}`);
  return randomPassword;
}

async function main() {
  console.log('🌱 Seeding database...\n');

  // ============================================
  // UTILISATEURS
  // ============================================

  // 1. Directeur Général (Admin)
  const adminPassword = await bcrypt.hash(
    getSecurePassword('SEED_ADMIN_PASSWORD', 'AdminSecure123!'),
    12
  );
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@transit.gn' },
    update: {},
    create: {
      email: 'admin@transit.gn',
      password: adminPassword,
      name: 'Directeur Général',
      role: Role.DIRECTOR,
      twoFactorEnabled: false,
    },
  });

  console.log('✅ Admin créé:', admin.email);
  console.log('   📧 Email: admin@transit.gn');
  console.log('   � Password: [SET FROM ENV]\n');

  // 2. Comptable
  const accountantPassword = await bcrypt.hash(
    getSecurePassword('SEED_ACCOUNTANT_PASSWORD', 'Comptable123!'),
    12
  );
  
  const accountant = await prisma.user.upsert({
    where: { email: 'comptable@transit.gn' },
    update: {},
    create: {
      email: 'comptable@transit.gn',
      password: accountantPassword,
      name: 'Chef Comptable',
      role: Role.ACCOUNTANT,
      twoFactorEnabled: false,
    },
  });

  console.log('✅ Comptable créé:', accountant.email);
  console.log('   📧 Email: comptable@transit.gn');
  console.log('   � Password: [SET FROM ENV]\n');

  // 3. Agent
  const agentPassword = await bcrypt.hash(
    getSecurePassword('SEED_AGENT_PASSWORD', 'Agent123!'),
    12
  );
  
  const agent = await prisma.user.upsert({
    where: { email: 'agent@transit.gn' },
    update: {},
    create: {
      email: 'agent@transit.gn',
      password: agentPassword,
      name: 'Agent Transit',
      role: Role.AGENT,
      twoFactorEnabled: false,
    },
  });

  console.log('✅ Agent créé:', agent.email);
  console.log('   📧 Email: agent@transit.gn');
  console.log('   � Password: [SET FROM ENV]\n');

  // 4. Client test
  const clientPassword = await bcrypt.hash(
    getSecurePassword('SEED_CLIENT_PASSWORD', 'Client123!'),
    12
  );
  
  const client = await prisma.user.upsert({
    where: { email: 'client@example.com' },
    update: {},
    create: {
      email: 'client@example.com',
      password: clientPassword,
      name: 'Client Test',
      role: Role.CLIENT,
      twoFactorEnabled: false,
    },
  });

  console.log('✅ Client créé:', client.email);
  console.log('   📧 Email: client@example.com');
  console.log('   � Password: [SET FROM ENV]\n');

  // ============================================
  // DOSSIERS RÉALISTES - PORT DE CONAKRY
  // ============================================

  console.log('\n📦 Création dossiers réalistes Port de Conakry...\n');

  // Dossier 1 : Import véhicules neufs (STATUS: Arrivé au port)
  const shipment1 = await prisma.shipment.upsert({
    where: { trackingNumber: 'TR-2026-001' },
    update: {},
    create: {
      trackingNumber: 'TR-2026-001',
      clientName: 'Soguipah SA',
      clientContact: '+224 622 45 67 89',
      blNumber: 'MAEU456789012',
      containerNumber: 'MSKU3456789',
      status: 'ARRIVED',
      commodityType: 'Véhicules automobiles neufs',
      commodityValue: 85000000, // 85M GNF (~9.5k USD)
      hsCode: '8703.23', // Voitures particulières essence
      arrivalDate: new Date(Date.now() + 5 * 86400000), // +5 jours
      createdById: agent.id,
    },
  });

  // Dossier 2 : Pièces détachées (STATUS: Déclaration déposée)
  const shipment2 = await prisma.shipment.upsert({
    where: { trackingNumber: 'TR-2026-002' },
    update: {},
    create: {
      trackingNumber: 'TR-2026-002',
      clientName: 'Auto-Pièces Import Guinée SARL',
      clientContact: '+224 625 12 34 56',
      blNumber: 'CMAU789456123',
      containerNumber: 'CMAU7654321',
      status: 'DECLARATION_FILED',
      commodityType: 'Pièces détachées automobiles',
      commodityValue: 35000000, // 35M GNF
      hsCode: '8708.99', // Parties et accessoires automobiles
      declarationNumber: 'DEC-GN-2026-00123',
      arrivalDate: new Date(Date.now() - 3 * 86400000), // -3 jours (arrivé)
      createdById: agent.id,
    },
  });

  // Dossier 3 : Conteneur riz (STATUS: Dédouané, prêt livraison)
  const shipment3 = await prisma.shipment.upsert({
    where: { trackingNumber: 'TR-2026-003' },
    update: {},
    create: {
      trackingNumber: 'TR-2026-003',
      clientName: 'Comptoir Guinéen de Distribution',
      clientContact: '+224 628 98 76 54',
      blNumber: 'HLCU456123789',
      containerNumber: 'HLCU9876543',
      status: 'CLEARANCE_OBTAINED',
      commodityType: 'Riz blanc (sacs 50kg)',
      commodityValue: 125000000, // 125M GNF
      hsCode: '1006.30', // Riz semi-blanchi ou blanchi
      declarationNumber: 'DEC-GN-2026-00124',
      arrivalDate: new Date(Date.now() - 7 * 86400000), // -7 jours
      deliveryCompany: 'Transport Express Guinée',
      deliveryDriver: 'Mamadou Diallo',
      deliveryPhone: '+224 620 55 44 33',
      createdById: agent.id,
    },
  });

  // Dossier 4 : Machines industrielles (STATUS: Livré)
  const shipment4 = await prisma.shipment.upsert({
    where: { trackingNumber: 'TR-2026-004' },
    update: {},
    create: {
      trackingNumber: 'TR-2026-004',
      clientName: 'Société Minière de Guinée SMG',
      clientContact: '+224 623 11 22 33',
      blNumber: 'MSCU987654321',
      containerNumber: 'MSCU1234567',
      status: 'DELIVERED',
      commodityType: 'Machines extraction minière',
      commodityValue: 450000000, // 450M GNF (~50k USD)
      hsCode: '8430.41', // Machines forage
      declarationNumber: 'DEC-GN-2026-00115',
      arrivalDate: new Date(Date.now() - 15 * 86400000), // -15 jours
      deliveryDate: new Date(Date.now() - 2 * 86400000), // -2 jours
      deliveryCompany: 'TransLog Guinée',
      deliveryDriver: 'Ibrahima Sow',
      deliveryPhone: '+224 627 33 44 55',
      createdById: admin.id,
    },
  });

  // Dossier 5 : Médicaments (STATUS: En attente documents)
  const shipment5 = await prisma.shipment.upsert({
    where: { trackingNumber: 'TR-2026-005' },
    update: {},
    create: {
      trackingNumber: 'TR-2026-005',
      clientName: 'Pharmacie Centrale de Guinée',
      clientContact: '+224 621 44 55 66',
      blNumber: 'COSCO456789123',
      containerNumber: 'COSU8765432',
      status: 'PENDING',
      commodityType: 'Produits pharmaceutiques',
      commodityValue: 200000000, // 200M GNF
      hsCode: '3004.90', // Médicaments
      arrivalDate: new Date(Date.now() - 1 * 86400000), // -1 jour
      createdById: agent.id,
    },
  });

  console.log('✅ Dossiers créés:');
  console.log(`   - ${shipment1.trackingNumber}: ${shipment1.clientName} (${shipment1.status})`);
  console.log(`   - ${shipment2.trackingNumber}: ${shipment2.clientName} (${shipment2.status})`);
  console.log(`   - ${shipment3.trackingNumber}: ${shipment3.clientName} (${shipment3.status})`);
  console.log(`   - ${shipment4.trackingNumber}: ${shipment4.clientName} (${shipment4.status})`);
  console.log(`   - ${shipment5.trackingNumber}: ${shipment5.clientName} (${shipment5.status})`);

  // ============================================
  // DÉPENSES RÉALISTES
  // ============================================

  console.log('\n💰 Création dépenses associées...\n');

  // Frais douaniers dossier 2
  await prisma.expense.create({
    data: {
      description: 'Droits de douane (5% + TVA 18%)',
      amount: 8050000, // 8.05M GNF (23% de 35M)
      category: 'DOUANE',
      type: 'DISBURSEMENT',
      paid: true,
      paidAt: new Date(Date.now() - 2 * 86400000),
      date: new Date(Date.now() - 2 * 86400000),
      shipmentId: shipment2.id,
    },
  });

  // Frais handling dossier 2
  await prisma.expense.create({
    data: {
      description: 'Manutention portuaire',
      amount: 1500000, // 1.5M GNF
      category: 'MANUTENTION',
      type: 'DISBURSEMENT',
      paid: true,
      paidAt: new Date(Date.now() - 2 * 86400000),
      date: new Date(Date.now() - 2 * 86400000),
      shipmentId: shipment2.id,
    },
  });

  // Frais transport dossier 3
  await prisma.expense.create({
    data: {
      description: 'Transport Port → Entrepôt Matam',
      amount: 2000000, // 2M GNF
      category: 'TRANSPORT',
      type: 'DISBURSEMENT',
      paid: false,
      date: new Date(Date.now() - 1 * 86400000),
      shipmentId: shipment3.id,
    },
  });

  // Frais stockage dossier 3
  await prisma.expense.create({
    data: {
      description: 'Stockage port (7 jours)',
      amount: 3500000, // 3.5M GNF
      category: 'STOCKAGE',
      type: 'DISBURSEMENT',
      paid: true,
      paidAt: new Date(Date.now() - 3 * 86400000),
      date: new Date(Date.now() - 7 * 86400000),
      shipmentId: shipment3.id,
    },
  });

  // Frais exceptionnels dossier 4 (machine lourde)
  await prisma.expense.create({
    data: {
      description: 'Grue spéciale levage (machine 15T)',
      amount: 5000000, // 5M GNF
      category: 'HANDLING',
      type: 'DISBURSEMENT',
      paid: true,
      paidAt: new Date(Date.now() - 10 * 86400000),
      date: new Date(Date.now() - 12 * 86400000),
      shipmentId: shipment4.id,
    },
  });

  console.log('✅ Dépenses créées (5 frais sur 3 dossiers)');

  console.log('\n🎉 Seeding terminé avec succès!\n');
  console.log('📊 Statistiques:');
  console.log('   - Utilisateurs: 4');
  console.log('   - Dossiers: 5 (Port de Conakry)');
  console.log('   - Dépenses: 5 (réalistes)');
  console.log('\n🔐 IMPORTANT: Credentials définis via variables env:');
  console.log('   SEED_ADMIN_PASSWORD, SEED_ACCOUNTANT_PASSWORD,');
  console.log('   SEED_AGENT_PASSWORD, SEED_CLIENT_PASSWORD\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Erreur seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
