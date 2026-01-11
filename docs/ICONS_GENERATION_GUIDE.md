# 🎨 GUIDE GÉNÉRATION ICÔNES PWA

## 📋 Icônes Nécessaires

L'application nécessite les icônes suivantes pour une PWA complète :

### Icônes principales
- `icon-72.png` (72x72) - Petite taille
- `icon-96.png` (96x96) - Moyenne taille
- `icon-128.png` (128x128)
- `icon-144.png` (144x144)
- `icon-152.png` (152x152)
- `icon-192.png` (192x192) - **Minimum requis**
- `icon-384.png` (384x384)
- `icon-512.png` (512x512) - **Minimum requis + Maskable**

### Favicons
- `favicon.svg` - ✅ **CRÉÉ** (version vectorielle)
- `favicon-16x16.png` (16x16)
- `favicon-32x32.png` (32x32)
- `favicon.png` (48x48)

### Open Graph
- `og-image.png` (1200x630) - Preview WhatsApp/Facebook/LinkedIn

### Screenshots (optionnel mais recommandé)
- `screenshot-mobile.png` (540x720) - App Store preview mobile
- `screenshot-desktop.png` (1280x720) - App Store preview desktop

### Shortcuts (optionnel)
- `shortcut-create.png` (96x96) - Raccourci "Créer dossier"
- `shortcut-dashboard.png` (96x96) - Raccourci "Mes dossiers"

---

## 🛠️ Génération Automatique

### Option 1: PWA Asset Generator (Recommandé)

```bash
# Installer l'outil
npm install -g pwa-asset-generator

# Générer depuis le SVG
pwa-asset-generator public/favicon.svg public/ \
  --favicon \
  --mstile \
  --opaque false \
  --background "#0f172a" \
  --padding "10%" \
  --type png \
  --quality 100
```

### Option 2: ImageMagick (Ligne de commande)

```bash
# Depuis le SVG, générer toutes les tailles
for size in 72 96 128 144 152 192 384 512; do
  convert public/favicon.svg -resize ${size}x${size} public/icon-${size}.png
done

# Favicons
convert public/favicon.svg -resize 16x16 public/favicon-16x16.png
convert public/favicon.svg -resize 32x32 public/favicon-32x32.png
convert public/favicon.svg -resize 48x48 public/favicon.png
```

### Option 3: Online Tools

**RealFaviconGenerator** (Gratuit + Complet)
1. Aller sur https://realfavicongenerator.net/
2. Upload `public/favicon.svg`
3. Ajuster options:
   - iOS: Oui
   - Android Chrome: Oui
   - Windows Metro: Non
   - macOS Safari: Oui
4. Télécharger package complet
5. Extraire dans `public/`

**PWA Builder** (Microsoft - Gratuit)
1. https://www.pwabuilder.com/imageGenerator
2. Upload logo haute résolution (512x512 minimum)
3. Télécharger toutes les icônes générées

---

## 🎨 Design Guidelines

### Couleurs
- **Background**: `#0f172a` (slate-900)
- **Primary**: `#3b82f6` (blue-600)
- **Accent**: `#60a5fa` (blue-400)
- **Text**: `#ffffff` (white)

### Symboles suggérés
- 🚢 Bateau / Conteneur maritime
- 📦 Carton / Package
- 🇬🇳 Drapeau Guinée (discret)
- ⚓ Ancre
- 🏭 Port / Grue

### Padding
- **Standard icons**: 10-15% padding
- **Maskable icons**: 20% padding (safe zone Android)

---

## ✅ Checklist Validation

Après génération, vérifier :

### PWA Lighthouse
```bash
npm run build
npm run preview
# Ouvrir Chrome DevTools > Lighthouse > Progressive Web App
```

**Score attendu** : 100/100

### Critères
- [ ] ✅ Manifest.json valide
- [ ] ✅ Service Worker enregistré
- [ ] ✅ Icons 192x192 et 512x512 présents
- [ ] ✅ Favicon visible dans navigateur
- [ ] ✅ Theme color appliqué (barre d'adresse Android)
- [ ] ✅ Splash screen généré automatiquement
- [ ] ✅ Installable sur mobile (banner "Ajouter à l'écran d'accueil")
- [ ] ✅ Fonctionne offline

### Test iOS
- Safari > Partager > Ajouter à l'écran d'accueil
- Vérifier icône + nom + splash screen

### Test Android
- Chrome > Menu > Installer l'application
- Vérifier icône adaptative (maskable)

---

## 🚀 Commandes Rapides

### Générer icônes avec Sharp (Node.js)

Créer `scripts/generate-icons.js`:

\`\`\`javascript
const sharp = require('sharp');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputSvg = 'public/favicon.svg';

async function generateIcons() {
  for (const size of sizes) {
    await sharp(inputSvg)
      .resize(size, size)
      .png({ quality: 100 })
      .toFile(\`public/icon-\${size}.png\`);
    console.log(\`✅ Generated icon-\${size}.png\`);
  }

  // Favicons
  await sharp(inputSvg).resize(16, 16).png().toFile('public/favicon-16x16.png');
  await sharp(inputSvg).resize(32, 32).png().toFile('public/favicon-32x32.png');
  await sharp(inputSvg).resize(48, 48).png().toFile('public/favicon.png');

  console.log('✅ All icons generated!');
}

generateIcons();
\`\`\`

Puis:
```bash
npm install -D sharp
node scripts/generate-icons.js
```

---

## 📱 Preview Final

Une fois icônes générées, tester :

```bash
npm run build
npm run preview

# Ouvrir sur mobile ou DevTools mode mobile
# Ouvrir DevTools > Application > Manifest
```

**Expected result**:
- ✅ Manifest valide
- ✅ Toutes icônes chargées
- ✅ Service Worker actif
- ✅ Banner installation PWA apparaît

---

## 🇬🇳 Considérations Guinée

### Taille optimale
- Garder icônes < 50 KB chacune
- Compresser avec TinyPNG ou Squoosh
- Format PNG préféré (meilleur support)

### Offline
- Service Worker cache icônes automatiquement
- Splash screen généré par navigateur depuis icônes

### WhatsApp Preview
L'image `og-image.png` (1200x630) sera utilisée quand l'app est partagée :
- Inclure logo + tagline
- Couleurs brand
- Texte lisible sur mobile

---

**Status actuel** :
- ✅ favicon.svg créé (vectoriel)
- ✅ manifest.json configuré
- ✅ Service Worker prêt
- ⏳ Icônes PNG à générer (utiliser un des outils ci-dessus)
