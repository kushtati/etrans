#!/bin/bash

# Script de vérification avant déploiement split Vercel + Railway
echo "🔍 Vérification configuration déploiement split..."
echo ""

# Vérifier fichiers Vercel
echo "📦 Vérification Vercel (Frontend)..."
if [ -f "vercel.json" ]; then
    echo "✅ vercel.json présent"
else
    echo "❌ vercel.json manquant"
fi

if [ -f ".vercelignore" ]; then
    echo "✅ .vercelignore présent"
else
    echo "❌ .vercelignore manquant"
fi

# Vérifier fichiers Railway
echo ""
echo "🚂 Vérification Railway (Backend)..."
if [ -f "railway.toml" ]; then
    echo "✅ railway.toml présent"
else
    echo "❌ railway.toml manquant"
fi

if [ -f ".railwayignore" ]; then
    echo "✅ .railwayignore présent"
else
    echo "❌ .railwayignore manquant"
fi

if [ -f "Procfile" ]; then
    echo "✅ Procfile présent"
else
    echo "❌ Procfile manquant"
fi

# Vérifier package.json
echo ""
echo "📄 Vérification package.json..."
if grep -q '"build":' package.json; then
    echo "✅ Script build présent"
else
    echo "❌ Script build manquant"
fi

if grep -q '"start:prod":' package.json; then
    echo "✅ Script start:prod présent"
else
    echo "❌ Script start:prod manquant"
fi

# Vérifier .gitignore
echo ""
echo "🔒 Vérification .gitignore..."
if grep -q '.env' .gitignore; then
    echo "✅ .env dans .gitignore"
else
    echo "❌ .env PAS dans .gitignore (DANGER!)"
fi

# Instructions finales
echo ""
echo "=========================================="
echo "📚 Prochaines étapes:"
echo ""
echo "1. BACKEND (Railway):"
echo "   - Créer projet sur railway.app"
echo "   - Ajouter PostgreSQL + Redis"
echo "   - Configurer variables: NODE_ENV, JWT_SECRET, FRONTEND_URL"
echo "   - Déployer et noter l'URL: https://backend-xxx.up.railway.app"
echo ""
echo "2. FRONTEND (Vercel):"
echo "   - Modifier vercel.json avec URL Railway"
echo "   - Créer projet sur vercel.com"
echo "   - Configurer variable: VITE_API_URL"
echo "   - Déployer et noter l'URL: https://votre-app.vercel.app"
echo ""
echo "3. CONNECTER:"
echo "   - Railway: Mettre à jour FRONTEND_URL avec URL Vercel"
echo "   - Tester sur mobile: Face ID"
echo ""
echo "📖 Lire: DEPLOYMENT_SPLIT.md pour guide détaillé"
echo "=========================================="
