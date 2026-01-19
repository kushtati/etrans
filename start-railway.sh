#!/bin/bash
# ============================================
# 🚀 RAILWAY START SCRIPT
# Ensures database migrations before server start
# ============================================

set -e  # Exit on error

echo "========================================="
echo "🔍 Railway Startup Script"
echo "========================================="
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL: ${DATABASE_URL:0:30}..."
echo ""

# ============================================
# STEP 1: Database Migration
# ============================================
echo "📊 Running Prisma migrations..."
npx prisma migrate deploy

if [ $? -eq 0 ]; then
  echo "✅ Migrations applied successfully"
else
  echo "❌ Migration failed!"
  exit 1
fi

echo ""

# ============================================
# STEP 2: Verify Database
# ============================================
echo "🔍 Verifying database tables..."
npx prisma db execute --stdin <<EOF
SELECT count(*) as user_count FROM users;
SELECT count(*) as shipment_count FROM shipments;
EOF

echo "✅ Database verification complete"
echo ""

# ============================================
# STEP 3: Start Server
# ============================================
echo "🚀 Starting production server..."
npm run start:prod
