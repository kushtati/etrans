/**
 * 🎨 Génération automatique des icônes PWA
 * 
 * Génère toutes les icônes nécessaires depuis favicon.svg :
 * - Icônes PWA (72, 96, 128, 144, 152, 192, 384, 512px)
 * - Favicons (16, 32, 48px)
 * - Shortcuts (96px)
 */

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const inputSvg = join(__dirname, '../public/favicon.svg');
const outputDir = join(__dirname, '../public');

// Tailles des icônes PWA (obligatoires + recommandées)
const pwaIconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Tailles des favicons (navigateurs)
const faviconSizes = [16, 32, 48];

// Couleur de background (transparent par défaut, ou bleu foncé pour maskable)
const backgroundColor = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a

async function generateIcons() {
  console.log('🎨 Génération des icônes PWA depuis favicon.svg...\n');

  try {
    // Lire le SVG source
    const svgBuffer = readFileSync(inputSvg);
    
    // 1. Générer icônes PWA
    console.log('📱 Icônes PWA :');
    for (const size of pwaIconSizes) {
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent
        })
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(join(outputDir, `icon-${size}.png`));
      
      console.log(`  ✅ icon-${size}.png`);
    }

    // 2. Générer favicons
    console.log('\n🌐 Favicons :');
    for (const size of faviconSizes) {
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(join(outputDir, `favicon-${size}x${size}.png`));
      
      console.log(`  ✅ favicon-${size}x${size}.png`);
    }

    // 3. Générer favicon.png principal (48x48)
    await sharp(svgBuffer)
      .resize(48, 48, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(join(outputDir, 'favicon.png'));
    
    console.log('  ✅ favicon.png (48x48)');

    // 4. Générer favicon.ico (multi-résolutions)
    console.log('\n🖼️  Favicon ICO :');
    await sharp(svgBuffer)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(join(outputDir, 'favicon.ico'));
    
    console.log('  ✅ favicon.ico (32x32)');

    // 5. Générer shortcut icons (96x96)
    console.log('\n⚡ Shortcuts :');
    
    // Shortcut "Créer" - Icône "+"
    const createIconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="48" fill="#3b82f6"/>
        <line x1="20" y1="48" x2="76" y2="48" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>
        <line x1="48" y1="20" x2="48" y2="76" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `;
    
    await sharp(Buffer.from(createIconSvg))
      .png({ quality: 100 })
      .toFile(join(outputDir, 'shortcut-create.png'));
    
    console.log('  ✅ shortcut-create.png (96x96)');

    // Shortcut "Dashboard" - Icône grille
    const dashboardIconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="48" fill="#3b82f6"/>
        <rect x="20" y="20" width="22" height="22" rx="4" fill="#ffffff"/>
        <rect x="54" y="20" width="22" height="22" rx="4" fill="#ffffff"/>
        <rect x="20" y="54" width="22" height="22" rx="4" fill="#ffffff"/>
        <rect x="54" y="54" width="22" height="22" rx="4" fill="#ffffff"/>
      </svg>
    `;
    
    await sharp(Buffer.from(dashboardIconSvg))
      .png({ quality: 100 })
      .toFile(join(outputDir, 'shortcut-dashboard.png'));
    
    console.log('  ✅ shortcut-dashboard.png (96x96)');

    // 6. Générer Apple Touch Icon (180x180)
    console.log('\n🍎 Apple Touch Icon :');
    await sharp(svgBuffer)
      .resize(180, 180, {
        fit: 'contain',
        background: backgroundColor // Background opaque pour iOS
      })
      .png({ quality: 100 })
      .toFile(join(outputDir, 'apple-touch-icon.png'));
    
    console.log('  ✅ apple-touch-icon.png (180x180)');

    // 7. Générer Open Graph image (1200x630)
    console.log('\n📱 Open Graph Preview :');
    const ogImageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0f172a"/><g transform="translate(300, 120)"><rect x="50" y="50" width="500" height="300" rx="20" fill="#3b82f6" stroke="#60a5fa" stroke-width="8"/><line x1="300" y1="50" x2="300" y2="350" stroke="#1e40af" stroke-width="6"/><circle cx="220" cy="200" r="15" fill="#dbeafe"/><circle cx="380" cy="200" r="15" fill="#dbeafe"/></g><text x="600" y="480" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff" text-anchor="middle">TransitGuinee Secure</text><text x="600" y="540" font-family="Arial, sans-serif" font-size="32" fill="#94a3b8" text-anchor="middle">Gestion Transit et Dedouanement</text></svg>`;
    
    await sharp(Buffer.from(ogImageSvg))
      .png({ quality: 90 })
      .toFile(join(outputDir, 'og-image.png'));
    
    console.log('  ✅ og-image.png (1200x630)');

    console.log('\n✅ Génération terminée avec succès !');
    console.log(`\n📦 Total : ${pwaIconSizes.length + faviconSizes.length + 6} icônes générées`);
    console.log('   - PWA icons: 8');
    console.log('   - Favicons: 4');
    console.log('   - Shortcuts: 2');
    console.log('   - Apple Touch Icon: 1');
    console.log('   - Open Graph: 1');

  } catch (error) {
    console.error('❌ Erreur lors de la génération des icônes:', error);
    process.exit(1);
  }
}

// Exécution
generateIcons();
