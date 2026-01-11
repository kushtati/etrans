/**
 * 🌱 SEED REALISTIC DATA - Données ultra-réalistes
 * 
 * Crée des dossiers de transit complets avec:
 * - Informations de livraison détaillées
 * - Données financières réalistes
 * - Documents variés
 * - Statuts progressifs
 * 
 * Exécuter: npx dotenv -e .env.server -- tsx prisma/seed-realistic.ts
 */

import { config } from 'dotenv';
import { PrismaClient, ShipmentStatus } from '@prisma/client';

config({ path: '.env.server' });

const prisma = new PrismaClient();

// Données ultra-réalistes
const REAL_CLIENTS = [
  'SOTRA Conakry SARL',
  'Société Guinéenne de Commerce (SGC)',
  'Entreprise BAKAYOKO & Fils',
  'DIAM Transport International',
  'MAMADOU Trading Company',
  'Guinée Express Logistique'
];

const DESTINATIONS = [
  'Conakry - Kaloum, Avenue de la République',
  'Conakry - Matoto, Zone Industrielle',
  'Kamsar - Port Zone',
  'Kindia - Centre Commercial',
  'Mamou - Quartier Centilitre',
  'Kankan - Marché Central'
];

const DRIVERS = [
  { name: 'Mamadou BARRY', phone: '+224 620 45 67 89', plate: 'GN-123-AB' },
  { name: 'Ibrahima DIALLO', phone: '+224 621 98 76 54', plate: 'GN-456-CD' },
  { name: 'Alpha Oumar SOW', phone: '+224 622 33 44 55', plate: 'GN-789-EF' },
  { name: 'Amadou CAMARA', phone: '+224 623 11 22 33', plate: 'GN-321-GH' },
  { name: 'Thierno BAH', phone: '+224 624 55 66 77', plate: 'GN-654-IJ' },
  { name: 'Mohamed CONTE', phone: '+224 625 88 99 00', plate: 'GN-987-KL' }
];

const RECIPIENTS = [
  'Mme DIALLO Fatoumata (Directrice Administrative)',
  'M. CAMARA Aboubacar (Responsable Logistique)',
  'M. TOURÉ Sékou (Chef de Dépôt)',
  'Mme BAH Aissatou (Gestionnaire Stock)',
  'M. SYLLA Mamadou (Directeur Général)',
  'M. KANTE Alseny (Comptable Principal)'
];

const COMMODITIES = [
  { type: 'Véhicules', desc: '1 Toyota Hilux 4x4 Double Cabine, Diesel, 2024', value: 35000, hsCode: '8704.31' },
  { type: 'Denrées Alimentaires', desc: 'Riz Parfumé Thai 25kg x 800 sacs', value: 18000, hsCode: '1006.30' },
  { type: 'Électroménager', desc: 'Réfrigérateurs Samsung 250L x 50 unités', value: 12500, hsCode: '8418.10' },
  { type: 'Matériaux de Construction', desc: 'Ciment Portland 50kg x 1000 sacs', value: 8000, hsCode: '2523.29' },
  { type: 'Équipements Industriels', desc: 'Groupe électrogène 100kVA Caterpillar', value: 28000, hsCode: '8502.11' },
  { type: 'Produits Pharmaceutiques', desc: 'Médicaments génériques assortis', value: 22000, hsCode: '3004.90' }
];

const SHIPPING_LINES = ['Maersk Line', 'CMA CGM', 'MSC Mediterranean', 'Hapag-Lloyd', 'COSCO Shipping'];

async function main() {
  console.log('🌱 Creating realistic data...\n');

  // Récupérer un utilisateur existant
  const director = await prisma.user.findFirst({
    where: { role: 'DIRECTOR' }
  });

  if (!director) {
    throw new Error('Aucun directeur trouvé dans la base de données. Lancez d\'abord le seed principal.');
  }

  console.log(`✅ Using director: ${director.email}\n`);

  // Créer 15 dossiers ultra-réalistes
  for (let i = 0; i < 15; i++) {
    const clientIndex = i % REAL_CLIENTS.length;
    const commodityIndex = i % COMMODITIES.length;
    const driverIndex = i % DRIVERS.length;
    const recipientIndex = i % RECIPIENTS.length;
    const destinationIndex = i % DESTINATIONS.length;
    const shippingLineIndex = i % SHIPPING_LINES.length;

    const commodity = COMMODITIES[commodityIndex];
    const driver = DRIVERS[driverIndex];
    const client = REAL_CLIENTS[clientIndex];
    const destination = DESTINATIONS[destinationIndex];
    const recipient = RECIPIENTS[recipientIndex];
    const shippingLine = SHIPPING_LINES[shippingLineIndex];

    // Générer dates réalistes
    const arrivalDate = new Date();
    arrivalDate.setDate(arrivalDate.getDate() - (15 - i)); // Étalé sur 15 jours

    const deliveryDate = new Date(arrivalDate);
    deliveryDate.setDate(deliveryDate.getDate() + Math.floor(Math.random() * 5) + 3); // 3-8 jours après arrivée

    // Générer numéros réalistes
    const trackingNumber = `TGN-2026-${String(2000 + i).padStart(4, '0')}`;
    const blNumber = `${shippingLine.substring(0, 3).toUpperCase()}${String(arrivalDate.getFullYear()).substring(2)}${String(Math.floor(Math.random() * 900000) + 100000)}`;
    const containerNumber = `${['MSCU', 'TCLU', 'CMAU', 'HLCU'][i % 4]}${Math.floor(Math.random() * 9000000) + 1000000}`;
    const declarationNumber = `GN/DDI/2026/${String(1000 + i).padStart(4, '0')}`;

    // Déterminer statut progressif
    let status: ShipmentStatus;
    if (i < 3) {
      status = 'ARRIVED'; // Récemment arrivés
    } else if (i < 6) {
      status = 'DECLARATION_FILED'; // En cours de dédouanement
    } else if (i < 9) {
      status = 'CUSTOMS_PAID'; // Liquidation payée
    } else if (i < 12) {
      status = 'CLEARANCE_OBTAINED'; // BAE obtenu
    } else {
      status = i % 2 === 0 ? 'IN_DELIVERY' : 'DELIVERED'; // En livraison ou livrés
    }

    console.log(`📦 Creating shipment ${i + 1}/15: ${trackingNumber} (${status})`);

    // Créer le dossier
    const shipment = await prisma.shipment.create({
      data: {
        trackingNumber,
        blNumber,
        containerNumber,
        clientName: client,
        clientContact: `+224 620 ${String(Math.floor(Math.random() * 900000) + 100000).substring(0, 2)} ${String(Math.floor(Math.random() * 900000) + 100000).substring(2, 4)} ${String(Math.floor(Math.random() * 900000) + 100000).substring(4, 6)}`,
        arrivalDate,
        status,
        declarationNumber: status !== 'ARRIVED' ? declarationNumber : null,
        hsCode: commodity.hsCode,
        commodityType: commodity.type,
        commodityValue: commodity.value,
        deliveryCompany: destination.split(' - ')[0], // Ville de destination
        deliveryDate: status === 'DELIVERED' || status === 'IN_DELIVERY' ? deliveryDate : null,
        deliveryDriver: status === 'DELIVERED' || status === 'IN_DELIVERY' ? driver.name : null,
        deliveryPhone: status === 'DELIVERED' || status === 'IN_DELIVERY' ? `${driver.phone} - ${driver.plate}` : null, // Format: "PHONE - PLATE"
        createdById: director.id
      }
    });

    // Ajouter documents réalistes
    const documents = [];
    
    // Documents de base (toujours présents)
    documents.push(
      { type: 'BL', name: `BL-${blNumber}.pdf` },
      { type: 'Facture', name: `Facture-${trackingNumber}.pdf` },
      { type: 'Packing List', name: `Packing-${trackingNumber}.pdf` }
    );

    // Documents selon statut
    if (status !== 'ARRIVED') {
      documents.push(
        { type: 'DDI', name: `DDI-${declarationNumber}.pdf` },
        { type: 'BSC', name: `BSC-${declarationNumber}.pdf` }
      );
    }

    if (status === 'CUSTOMS_PAID' || status === 'CLEARANCE_OBTAINED' || status === 'IN_DELIVERY' || status === 'DELIVERED') {
      documents.push({ type: 'Quittance', name: `Quittance-${declarationNumber}.pdf` });
    }

    if (status === 'CLEARANCE_OBTAINED' || status === 'IN_DELIVERY' || status === 'DELIVERED') {
      documents.push({ type: 'BAE', name: `BAE-${declarationNumber}.pdf` });
    }

    if (status === 'IN_DELIVERY' || status === 'DELIVERED') {
      documents.push({ type: 'Photo Camion', name: `Camion-${driver.plate}.jpg` });
    }

    for (const doc of documents) {
      await prisma.document.create({
        data: {
          type: doc.type,
          name: doc.name,
          url: `/documents/${shipment.id}/${doc.name}`,
          shipmentId: shipment.id
        }
      });
    }

    // Ajouter dépenses réalistes
    const expenses = [];

    // Provision (avance client)
    const provisionAmount = Math.floor(commodity.value * 0.15 * 10000); // 15% de la valeur en GNF
    expenses.push({
      description: 'Provision client (avance)',
      amount: provisionAmount,
      category: 'Agence',
      type: 'PROVISION',
      paid: true,
      paidAt: new Date(arrivalDate.getTime() - 2 * 24 * 60 * 60 * 1000) // 2 jours avant arrivée
    });

    // Frais de port
    expenses.push({
      description: 'Frais de terminal portuaire',
      amount: Math.floor(Math.random() * 5000000) + 2000000, // 2M - 7M GNF
      category: 'Port',
      type: 'DISBURSEMENT',
      paid: status !== 'ARRIVED'
    });

    // Frais de dédouanement
    if (status !== 'ARRIVED') {
      const douaneAmount = Math.floor(commodity.value * 0.18 * 10000); // TVA + droits
      expenses.push({
        description: 'Liquidation douane (droits + TVA)',
        amount: douaneAmount,
        category: 'Douane',
        type: 'DISBURSEMENT',
        paid: status === 'CUSTOMS_PAID' || status === 'CLEARANCE_OBTAINED' || status === 'IN_DELIVERY' || status === 'DELIVERED',
        paidAt: status === 'CUSTOMS_PAID' || status === 'CLEARANCE_OBTAINED' || status === 'IN_DELIVERY' || status === 'DELIVERED' 
          ? new Date(arrivalDate.getTime() + 3 * 24 * 60 * 60 * 1000) 
          : undefined
      });
    }

    // Frais de logistique
    if (status === 'IN_DELIVERY' || status === 'DELIVERED') {
      expenses.push({
        description: `Transport Conakry → ${destination.split(' - ')[0]}`,
        amount: Math.floor(Math.random() * 3000000) + 1000000, // 1M - 4M GNF
        category: 'Logistique',
        type: 'DISBURSEMENT',
        paid: status === 'DELIVERED'
      });
    }

    // Honoraires agence
    expenses.push({
      description: 'Honoraires agence transit',
      amount: Math.floor(commodity.value * 0.05 * 10000), // 5% de la valeur
      category: 'Agence',
      type: 'DISBURSEMENT',
      paid: status === 'DELIVERED'
    });

    for (const exp of expenses) {
      await prisma.expense.create({
        data: {
          ...exp,
          date: exp.paidAt || new Date(),
          shipmentId: shipment.id
        }
      });
    }

    console.log(`   ✅ ${trackingNumber}: ${documents.length} docs, ${expenses.length} expenses\n`);
  }

  console.log('\n🎉 Seed completed! Created 15 ultra-realistic shipments.\n');
  console.log('📊 Statistics:');
  console.log(`   - 3 ARRIVED (récemment arrivés)`);
  console.log(`   - 3 DECLARATION_FILED (en dédouanement)`);
  console.log(`   - 3 CUSTOMS_PAID (liquidation payée)`);
  console.log(`   - 3 CLEARANCE_OBTAINED (BAE obtenu)`);
  console.log(`   - 3 IN_DELIVERY/DELIVERED (en livraison/livrés)\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
