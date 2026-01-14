#!/usr/bin/env pwsh
# ============================================
# 🚀 PRE-DEPLOY CHECK - Production Ready
# ============================================
#
# Vérifie que le code est prêt pour déploiement
# À exécuter AVANT de push vers Railway/Vercel
#
# ============================================

Write-Host "`n🔍 PRÉ-DÉPLOIEMENT - Vérification complète`n" -ForegroundColor Cyan

$errors = 0
$warnings = 0

# ============================================
# 1. VÉRIFIER FICHIERS DÉPLOIEMENT
# ============================================

Write-Host "📋 Fichiers de configuration..." -ForegroundColor Yellow

$requiredFiles = @(
    @{ Path = "railway.toml"; Desc = "Configuration Railway" },
    @{ Path = "nixpacks.toml"; Desc = "Build Nixpacks" },
    @{ Path = "Procfile"; Desc = "Process Railway/Heroku" },
    @{ Path = "vercel.json"; Desc = "Configuration Vercel" },
    @{ Path = ".railwayignore"; Desc = "Exclusions Railway" },
    @{ Path = "prisma/schema.prisma"; Desc = "Schema Prisma" },
    @{ Path = "package.json"; Desc = "Dependencies" },
    @{ Path = "tsconfig.json"; Desc = "TypeScript config" },
    @{ Path = "tsconfig.server.json"; Desc = "TypeScript server" }
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file.Path) {
        Write-Host "  ✅ $($file.Desc)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($file.Desc) manquant" -ForegroundColor Red
        $errors++
    }
}

# ============================================
# 2. VÉRIFIER SCRIPTS PACKAGE.JSON
# ============================================

Write-Host "`n📦 Scripts npm..." -ForegroundColor Yellow

$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$requiredScripts = @("build:frontend", "build:server", "start:prod")

foreach ($script in $requiredScripts) {
    if ($packageJson.scripts.$script) {
        Write-Host "  ✅ npm run $script" -ForegroundColor Green
    } else {
        Write-Host "  ❌ npm run $script manquant" -ForegroundColor Red
        $errors++
    }
}

# ============================================
# 3. VÉRIFIER VARIABLES SENSIBLES
# ============================================

Write-Host "`n🔐 Sécurité secrets..." -ForegroundColor Yellow

# Vérifier .env.server pas commité
$gitStatus = git status --porcelain 2>$null
if ($gitStatus -match "\.env\.server") {
    Write-Host "  ⚠️  .env.server modifié (ne pas commit)" -ForegroundColor Yellow
    $warnings++
}

# Vérifier .gitignore
if (Test-Path ".gitignore") {
    $gitignore = Get-Content ".gitignore" -Raw
    if ($gitignore -match "\.env\.server") {
        Write-Host "  ✅ .env.server dans .gitignore" -ForegroundColor Green
    } else {
        Write-Host "  ❌ .env.server absent de .gitignore" -ForegroundColor Red
        $errors++
    }
}

# Vérifier pas de secrets hardcodés
Write-Host "`n🔍 Recherche secrets hardcodés..." -ForegroundColor Yellow
$secretPatterns = @(
    "AIzaSy[a-zA-Z0-9_-]{33}",  # Gemini API key
    "sk-[a-zA-Z0-9]{48}",        # OpenAI key
    "postgres://.*:.*@"          # Database URL avec password
)

$foundSecrets = $false
foreach ($pattern in $secretPatterns) {
    $matches = Get-ChildItem -Recurse -Include "*.ts","*.tsx","*.js" -Exclude "node_modules","dist" | 
               Select-String -Pattern $pattern -ErrorAction SilentlyContinue
    
    if ($matches) {
        Write-Host "  ⚠️  Secret potentiel trouvé : $pattern" -ForegroundColor Yellow
        $foundSecrets = $true
        $warnings++
    }
}

if (-not $foundSecrets) {
    Write-Host "  ✅ Aucun secret hardcodé détecté" -ForegroundColor Green
}

# ============================================
# 4. VÉRIFIER BUILD
# ============================================

Write-Host "`n🔨 Test build production..." -ForegroundColor Yellow

# Build frontend
Write-Host "  Building frontend..." -ForegroundColor Gray
$frontendBuild = npm run build:frontend 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Frontend build OK" -ForegroundColor Green
} else {
    Write-Host "  ❌ Frontend build FAILED" -ForegroundColor Red
    $errors++
}

# Build backend
Write-Host "  Building backend..." -ForegroundColor Gray
$backendBuild = npm run build:server 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Backend build OK" -ForegroundColor Green
} else {
    Write-Host "  ❌ Backend build FAILED" -ForegroundColor Red
    $errors++
}

# ============================================
# 5. VÉRIFIER PRISMA
# ============================================

Write-Host "`n🗄️  Prisma..." -ForegroundColor Yellow

# Vérifier schema
if (Test-Path "prisma/schema.prisma") {
    Write-Host "  ✅ schema.prisma présent" -ForegroundColor Green
    
    # Vérifier Prisma Client généré
    if (Test-Path "node_modules/@prisma/client") {
        Write-Host "  ✅ Prisma Client généré" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Prisma Client non généré (npx prisma generate)" -ForegroundColor Yellow
        $warnings++
    }
} else {
    Write-Host "  ❌ schema.prisma manquant" -ForegroundColor Red
    $errors++
}

# ============================================
# 6. VÉRIFIER DÉPENDANCES
# ============================================

Write-Host "`n📚 Dépendances..." -ForegroundColor Yellow

# Audit sécurité
Write-Host "  Audit npm..." -ForegroundColor Gray
$auditResult = npm audit --json 2>&1 | ConvertFrom-Json

if ($auditResult.metadata.vulnerabilities.high -gt 0 -or 
    $auditResult.metadata.vulnerabilities.critical -gt 0) {
    Write-Host "  ⚠️  Vulnérabilités HIGH/CRITICAL détectées" -ForegroundColor Yellow
    Write-Host "     Exécuter: npm audit fix" -ForegroundColor Gray
    $warnings++
} else {
    Write-Host "  ✅ Aucune vulnérabilité critique" -ForegroundColor Green
}

# ============================================
# 7. VÉRIFIER CONFIGURATION DÉPLOIEMENT
# ============================================

Write-Host "`n⚙️  Configuration déploiement..." -ForegroundColor Yellow

# Vercel
if (Test-Path "vercel.json") {
    $vercelConfig = Get-Content "vercel.json" -Raw | ConvertFrom-Json
    if ($vercelConfig.buildCommand -match "build:frontend") {
        Write-Host "  ✅ Vercel buildCommand correct" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Vercel buildCommand à vérifier" -ForegroundColor Yellow
        $warnings++
    }
}

# Railway
if (Test-Path "railway.toml") {
    $railwayConfig = Get-Content "railway.toml" -Raw
    if ($railwayConfig -match "build:server") {
        Write-Host "  ✅ Railway buildCommand correct" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Railway buildCommand à vérifier" -ForegroundColor Yellow
        $warnings++
    }
}

# ============================================
# 8. VÉRIFIER TESTS
# ============================================

Write-Host "`n🧪 Tests..." -ForegroundColor Yellow

if (Test-Path "tests") {
    Write-Host "  Exécution tests..." -ForegroundColor Gray
    $testResult = npm run test:run 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Tests passent" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Certains tests échouent" -ForegroundColor Yellow
        $warnings++
    }
} else {
    Write-Host "  ⚠️  Pas de tests trouvés" -ForegroundColor Yellow
}

# ============================================
# 9. VÉRIFIER GIT
# ============================================

Write-Host "`n📝 Git..." -ForegroundColor Yellow

# Branch
$currentBranch = git branch --show-current 2>$null
if ($currentBranch -eq "main" -or $currentBranch -eq "master") {
    Write-Host "  ✅ Branch: $currentBranch" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Branch: $currentBranch (pas main/master)" -ForegroundColor Yellow
    $warnings++
}

# Uncommitted changes
$uncommitted = git status --porcelain 2>$null
if ($uncommitted) {
    Write-Host "  ⚠️  Modifications non commitées" -ForegroundColor Yellow
    $warnings++
} else {
    Write-Host "  ✅ Aucune modification non commitée" -ForegroundColor Green
}

# ============================================
# RÉSUMÉ
# ============================================

Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "RÉSUMÉ PRÉ-DÉPLOIEMENT" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

if ($errors -eq 0 -and $warnings -eq 0) {
    Write-Host "`n✅ PRÊT POUR DÉPLOIEMENT !`n" -ForegroundColor Green
    Write-Host "Prochaines étapes:" -ForegroundColor Cyan
    Write-Host "  1. git push origin main" -ForegroundColor Gray
    Write-Host "  2. Railway auto-déploie le backend" -ForegroundColor Gray
    Write-Host "  3. Vercel auto-déploie le frontend" -ForegroundColor Gray
    Write-Host "  4. Vérifier logs: railway logs && vercel logs`n" -ForegroundColor Gray
    exit 0
} elseif ($errors -eq 0) {
    Write-Host "`n⚠️  DÉPLOIEMENT POSSIBLE (avec $warnings warnings)`n" -ForegroundColor Yellow
    Write-Host "Recommandations:" -ForegroundColor Cyan
    Write-Host "  - Corriger les warnings si possible" -ForegroundColor Gray
    Write-Host "  - Tester localement: npm run dev" -ForegroundColor Gray
    Write-Host "  - Vérifier variables Railway/Vercel`n" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "`n❌ CORRECTIONS REQUISES ($errors erreurs, $warnings warnings)`n" -ForegroundColor Red
    Write-Host "À faire avant déploiement:" -ForegroundColor Cyan
    Write-Host "  - Corriger les erreurs ci-dessus" -ForegroundColor Gray
    Write-Host "  - Re-exécuter: .\pre-deploy-production.ps1" -ForegroundColor Gray
    Write-Host "  - Consulter: DEPLOYMENT_PRODUCTION.md`n" -ForegroundColor Gray
    exit 1
}
