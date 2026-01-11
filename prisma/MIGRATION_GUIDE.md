<!-- 🗄️ MIGRATIONS PRISMA - GUIDE COMPLET
     
     Ce fichier explique comment migrer depuis mock data vers PostgreSQL + Prisma
-->

# 🗄️ Migrations Prisma - Guide Complet

# ============================================
# 📋 PRÉREQUIS
# ============================================

## 1. Installer PostgreSQL

### Windows (WSL2 recommandé)
```bash
# Via WSL2
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo service postgresql start

# ⚠️ SÉCURITÉ: Générer mot de passe fort (JAMAIS hardcoder)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> ~/.env.postgres

# Créer utilisateur et base
sudo -u postgres psql
CREATE USER transit_user WITH PASSWORD '$POSTGRES_PASSWORD';
CREATE DATABASE transit_guinee OWNER transit_user;
GRANT ALL PRIVILEGES ON DATABASE transit_guinee TO transit_user;
\q
```

### macOS
```bash
brew install postgresql@15
brew services start postgresql@15
createdb transit_guinee
```

### Docker (Recommandé pour dev)
```bash
# ⚠️ SÉCURITÉ: JAMAIS hardcoder mot de passe
# Option 1: Variables environnement
export POSTGRES_PASSWORD=$(openssl rand -base64 32)

docker run --name transit-postgres \
  -e POSTGRES_USER=transit_user \
  -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
  -e POSTGRES_DB=transit_guinee \
  -p 5432:5432 \
  -d postgres:15-alpine

# Option 2: Docker secrets (production)
echo $POSTGRES_PASSWORD | docker secret create postgres_password -
```

## 2. Configuration .env.server

⚠️ **CRITIQUE**: `.env.server` DOIT être dans `.gitignore`

```bash
# Vérifier .gitignore
grep ".env.server" .gitignore || echo ".env.server" >> .gitignore

# Créer .env.server (JAMAIS commit Git)
DATABASE_URL="postgresql://transit_user:${POSTGRES_PASSWORD}@localhost:5432/transit_guinee?schema=public"
```

**Template `.env.server.example`** (sans credentials):
```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/transit_guinee?schema=public"
```

# ============================================
# 🚀 ÉTAPES MIGRATION
# ============================================

## Étape 1: Générer le client Prisma
```bash
npx prisma generate
```

## Étape 2: Créer la première migration
```bash
npx prisma migrate dev --name init
```

Ceci va:
- Créer toutes les tables dans PostgreSQL
- Générer les types TypeScript
- Créer le dossier prisma/migrations/

## Étape 3: Vérifier la base de données
```bash
# Ouvrir Prisma Studio (GUI web)
npx prisma studio

# Ou se connecter à PostgreSQL
psql postgresql://transit_user:secure_password@localhost:5432/transit_guinee
\dt  # Liste des tables
```

## Étape 4: Seed données (optionnel)
Créer `prisma/seed.ts`:

```typescript
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as readline from 'readline';

const prisma = new PrismaClient();

// ⚠️ SÉCURITÉ: Prompts interactifs pour production
async function promptPassword(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  // Mode développement: credentials par défaut
  // Mode production: prompt interactif
  const isProduction = process.env.NODE_ENV === 'production';
  
  const adminPassword = isProduction 
    ? await promptPassword('Mot de passe admin (min 12 caractères): ')
    : 'DevAdmin123!'; // ⚠️ DEV UNIQUEMENT
  
  if (isProduction && adminPassword.length < 12) {
    throw new Error('⚠️ Mot de passe trop court (min 12 caractères)');
  }
  
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@transit.gn',
      password: hashedPassword,
      name: 'Administrateur',
      role: Role.DIRECTOR,
      twoFactorEnabled: false
    }
  });
  
  console.log('✅ Admin créé:', admin.email);
  
  // ⚠️ Agent test DEV uniquement
  if (!isProduction) {
    const agent = await prisma.user.create({
      data: {
        email: 'agent@transit.gn',
        password: await bcrypt.hash('DevAgent123!', 12), // DEV uniquement
        name: 'Agent Test',
        role: Role.AGENT
      }
    });
    console.log('✅ Agent test créé (DEV):', agent.email);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Ajouter dans `package.json`:
```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Exécuter:
```bash
npx prisma db seed
```

# ============================================
# 🔧 REFACTORISATION CODE
# ============================================

## Remplacer server/routes/auth.ts

### Avant (Mock)
```typescript
async function findUserByEmail(email: string): Promise<User | null> {
  if (email === 'admin@transit.gn') {
    return {
      id: '1',
      email: 'admin@transit.gn',
      password: ADMIN_PASSWORD_HASH,
      role: Role.DIRECTOR,
      // ...
    };
  }
  return null;
}
```

### Après (Prisma)
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findUserByEmail(email: string): Promise<User | null> {
  try {
    // ⚠️ SÉCURITÉ: trim() + toLowerCase() pour éviter bypass
    const normalizedEmail = email.trim().toLowerCase();
    
    // Validation format email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      logger.warn('Invalid email format', { email: normalizedEmail });
      return null;
    }
    
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });
    return user;
  } catch (error) {
    logger.error('Database query failed', { error });
    throw new Error('Erreur base de données');
  }
}

async function updateLastLogin(userId: string): Promise<void> {
  // ⚠️ SÉCURITÉ: Transaction pour éviter race condition
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { 
        lastLogin: new Date(),
        failedAttempts: 0 // Reset atomique
      }
    });
  });
}
```

# ============================================
# 📊 COMMANDES PRISMA UTILES
# ============================================

## Développement
```bash
# Créer nouvelle migration
npx prisma migrate dev --name add_new_field

# ⚠️ DANGER: Reset database (EFFACE TOUTES LES DONNÉES)
# UNIQUEMENT EN DÉVELOPPEMENT - JAMAIS EN PRODUCTION
# Demande confirmation interactive
npx prisma migrate reset

# Alternative production: Créer migration pour rollback
npx prisma migrate dev --name rollback_changes

# Voir le schéma SQL généré
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

## Production
```bash
# Appliquer migrations en prod (sans prompt)
npx prisma migrate deploy

# Générer client Prisma (après clone repo)
npx prisma generate
```

## Debug
```bash
# Voir état migrations
npx prisma migrate status

# Format schéma
npx prisma format

# Valider schéma
npx prisma validate
```

# ============================================
# � BACKUP & RESTORE
# ============================================

## Backup Production

### PostgreSQL natif
```bash
# Backup complet (structure + données)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup compressé (recommandé)
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Backup automatique quotidien (cron)
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/transit_$(date +\%Y\%m\%d).sql.gz
```

### Render.com
```bash
# Via dashboard: Database > Backups > Manual Backup
# Ou CLI
render-cli pg:backups:create transit-postgres
```

### Supabase
- Dashboard > Database > Backups > Take backup
- Rétention 7 jours (gratuit), 30 jours (Pro)

## Restore

```bash
# Restore depuis fichier SQL
psql $DATABASE_URL < backup_20260110.sql

# Restore depuis .gz
gunzip -c backup_20260110.sql.gz | psql $DATABASE_URL

# ⚠️ Ou via Prisma (efface données existantes)
npx prisma migrate reset
psql $DATABASE_URL < backup.sql
```

## Stratégie Backup Recommandée

- **Développement**: Backup avant migrations majeures
- **Staging**: Backup quotidien (rétention 7 jours)
- **Production**: 
  - Backup automatique quotidien 2h du matin
  - Rétention 30 jours minimum
  - Test restore mensuel obligatoire

# ============================================
# �🐛 TROUBLESHOOTING
# ============================================

## Erreur: Can't reach database server
```bash
# Vérifier PostgreSQL actif
sudo service postgresql status  # Linux
brew services list              # macOS
docker ps                       # Docker

# Tester connexion
psql $DATABASE_URL
```

## Erreur: SSL required
Modifier DATABASE_URL:
```bash
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
```

## Erreur: Prisma Client not generated
```bash
npx prisma generate --force
```

## Migrations en conflit
```bash
# Marquer migration comme appliquée
npx prisma migrate resolve --applied <migration_name>

# Tout recommencer (⚠️ perte données)
npx prisma migrate reset
```

# ============================================
# 🚀 DÉPLOIEMENT PRODUCTION
# ============================================

## Render.com
1. Créer PostgreSQL Database
2. Copier Internal Database URL
3. Ajouter dans Environment Variables:
   - DATABASE_URL=<internal_url>
4. Build Command: `npm run build && npx prisma migrate deploy`

## Railway.app
1. Add PostgreSQL plugin
2. Variable DATABASE_URL créée automatiquement
3. Build: `npm run build && npx prisma migrate deploy`

## Vercel + Supabase
1. Créer projet Supabase
2. Copier Connection String (Direct)
3. Vercel Environment Variables:
   - DATABASE_URL=<supabase_url>
4. Ajouter dans vercel.json:
```json
{
  "build": {
    "env": {
      "PRISMA_GENERATE_SKIP_AUTOINSTALL": "1"
    }
  }
}
```

# ============================================
# 📚 RESSOURCES
# ============================================

- Documentation: https://www.prisma.io/docs
- Guides: https://www.prisma.io/docs/getting-started
- Exemples: https://github.com/prisma/prisma-examples
- Discord: https://pris.ly/discord
