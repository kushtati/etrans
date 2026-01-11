# Script de vérification avant déploiement split Vercel + Railway
Write-Host "🔍 Vérification configuration déploiement split..." -ForegroundColor Cyan
Write-Host ""

$hasErrors = $false

# Vérifier fichiers Vercel
Write-Host "📦 Vérification Vercel (Frontend)..." -ForegroundColor Yellow
if (Test-Path "vercel.json") {
    Write-Host "✅ vercel.json présent" -ForegroundColor Green
} else {
    Write-Host "❌ vercel.json manquant" -ForegroundColor Red
    $hasErrors = $true
}

if (Test-Path ".vercelignore") {
    Write-Host "✅ .vercelignore présent" -ForegroundColor Green
} else {
    Write-Host "❌ .vercelignore manquant" -ForegroundColor Red
    $hasErrors = $true
}

# Vérifier fichiers Railway
Write-Host ""
Write-Host "🚂 Vérification Railway (Backend)..." -ForegroundColor Yellow
if (Test-Path "railway.toml") {
    Write-Host "✅ railway.toml présent" -ForegroundColor Green
} else {
    Write-Host "❌ railway.toml manquant" -ForegroundColor Red
    $hasErrors = $true
}

if (Test-Path ".railwayignore") {
    Write-Host "✅ .railwayignore présent" -ForegroundColor Green
} else {
    Write-Host "❌ .railwayignore manquant" -ForegroundColor Red
    $hasErrors = $true
}

if (Test-Path "Procfile") {
    Write-Host "✅ Procfile présent" -ForegroundColor Green
} else {
    Write-Host "❌ Procfile manquant" -ForegroundColor Red
    $hasErrors = $true
}

# Vérifier package.json
Write-Host ""
Write-Host "📄 Vérification package.json..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" -Raw
if ($packageJson -match '"build":') {
    Write-Host "✅ Script build présent" -ForegroundColor Green
} else {
    Write-Host "❌ Script build manquant" -ForegroundColor Red
    $hasErrors = $true
}

if ($packageJson -match '"start:prod":') {
    Write-Host "✅ Script start:prod présent" -ForegroundColor Green
} else {
    Write-Host "❌ Script start:prod manquant" -ForegroundColor Red
    $hasErrors = $true
}

# Vérifier .gitignore
Write-Host ""
Write-Host "🔒 Vérification .gitignore..." -ForegroundColor Yellow
$gitignore = Get-Content ".gitignore" -Raw
if ($gitignore -match '\.env') {
    Write-Host "✅ .env dans .gitignore" -ForegroundColor Green
} else {
    Write-Host "❌ .env PAS dans .gitignore (DANGER!)" -ForegroundColor Red
    $hasErrors = $true
}

# Vérifier vercel.json
Write-Host ""
Write-Host "⚙️  Vérification vercel.json..." -ForegroundColor Yellow
$vercelJson = Get-Content "vercel.json" -Raw
if ($vercelJson -match 'your-backend\.up\.railway\.app') {
    Write-Host "⚠️  vercel.json contient URL placeholder - À MODIFIER!" -ForegroundColor Yellow
    Write-Host "   Remplacer: your-backend.up.railway.app" -ForegroundColor Yellow
    Write-Host "   Par: votre-vraie-url.up.railway.app" -ForegroundColor Yellow
}

# Instructions finales
Write-Host ""
Write-Host "==========================================  " -ForegroundColor Cyan
Write-Host "📚 Prochaines étapes:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. BACKEND (Railway):" -ForegroundColor Yellow
Write-Host "   - Créer projet sur railway.app"
Write-Host "   - Ajouter PostgreSQL + Redis"
Write-Host "   - Configurer variables: NODE_ENV, JWT_SECRET, FRONTEND_URL"
Write-Host "   - Déployer et noter l'URL: https://backend-xxx.up.railway.app"
Write-Host ""
Write-Host "2. FRONTEND (Vercel):" -ForegroundColor Yellow
Write-Host "   - Modifier vercel.json avec URL Railway"
Write-Host "   - Créer projet sur vercel.com"
Write-Host "   - Configurer variable: VITE_API_URL"
Write-Host "   - Déployer et noter l'URL: https://votre-app.vercel.app"
Write-Host ""
Write-Host "3. CONNECTER:" -ForegroundColor Yellow
Write-Host "   - Railway: Mettre à jour FRONTEND_URL avec URL Vercel"
Write-Host "   - Tester sur mobile: Face ID"
Write-Host ""
Write-Host "📖 Lire: DEPLOYMENT_SPLIT.md pour guide détaillé" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if ($hasErrors) {
    Write-Host ""
    Write-Host "❌ ERREURS DÉTECTÉES - Corriger avant déploiement" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "✅ PRÊT POUR LE DÉPLOIEMENT SPLIT !" -ForegroundColor Green
}
