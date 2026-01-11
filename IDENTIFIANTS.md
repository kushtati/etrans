# 🔐 Identifiants de Connexion - TransitGuinée

## 📋 Comptes par Défaut (Développement)

### 👨‍💼 Directeur Général (Admin)
- **Email**: `admin@transit.gn`
- **Mot de passe**: `AdminSecure123!`
- **Rôle**: DIRECTOR (Accès complet)
- **Permissions**: 
  - Gestion utilisateurs
  - Validation dossiers
  - Accès comptabilité
  - Configuration système

### 👨‍💻 Comptable
- **Email**: `comptable@transit.gn`
- **Mot de passe**: `Comptable123!`
- **Rôle**: ACCOUNTANT
- **Permissions**:
  - Gestion paiements
  - Rapports financiers
  - Facturation
  - Suivi des coûts

### 👷 Agent Transit
- **Email**: `agent@transit.gn`
- **Mot de passe**: `Agent123!`
- **Rôle**: AGENT
- **Permissions**:
  - Création dossiers
  - Suivi expéditions
  - Gestion documents
  - Mise à jour statuts

### 👤 Client Test
- **Email**: `client@example.com`
- **Mot de passe**: `Client123!`
- **Rôle**: CLIENT
- **Permissions**:
  - Consultation dossiers
  - Suivi expéditions
  - Téléchargement documents

## 🚀 Première Connexion

### Étape 1: Créer les comptes
```bash
# Exécuter le seed pour créer les utilisateurs
npx prisma db seed
```

### Étape 2: Se connecter
1. Ouvrir: http://localhost:5173
2. Utiliser un des identifiants ci-dessus
3. Cliquer sur "Connexion"

### Étape 3: Tester
- ✅ Dashboard accessible
- ✅ Liste des dossiers visible
- ✅ Création nouveau dossier (selon rôle)

## 🔐 Sécurité

### ⚠️ IMPORTANT - Développement Uniquement
Ces identifiants sont pour **DÉVELOPPEMENT LOCAL UNIQUEMENT**.

**NE JAMAIS utiliser en production!**

### Production
Pour la production, créez des comptes avec:
- Mots de passe complexes (16+ caractères)
- 2FA activé
- Emails professionnels vérifiés

## 🛠️ Commandes Utiles

### Créer les utilisateurs
```bash
# Seed la base de données
npx prisma db seed
```

### Réinitialiser la DB
```bash
# Supprimer toutes les données
npx prisma migrate reset

# Re-seed
npx prisma db seed
```

### Créer un nouvel utilisateur manuellement
```bash
# Via Prisma Studio (interface graphique)
npx prisma studio

# Puis créer l'utilisateur dans l'interface web
```

## 📝 Personnaliser les Mots de Passe

Vous pouvez définir vos propres mots de passe via variables d'environnement:

### Créer `.env` (à la racine)
```bash
# Mots de passe personnalisés pour seed
SEED_ADMIN_PASSWORD=VotreMotDePasseAdmin123!
SEED_ACCOUNTANT_PASSWORD=VotreMotDePasseComptable123!
SEED_AGENT_PASSWORD=VotreMotDePasseAgent123!
SEED_CLIENT_PASSWORD=VotreMotDePasseClient123!
```

Puis exécutez:
```bash
npx prisma db seed
```

## 🔄 Réinitialiser un Mot de Passe

### Via Script (À créer)
```javascript
// scripts/reset-password.js
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetPassword(email, newPassword) {
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword }
  });
  console.log(`✅ Mot de passe réinitialisé pour ${email}`);
}

resetPassword('admin@transit.gn', 'NouveauMotDePasse123!');
```

## ❓ Problèmes Courants

### "Email ou mot de passe incorrect"
1. Vérifiez que vous avez exécuté `npx prisma db seed`
2. Vérifiez l'orthographe de l'email
3. Vérifiez le mot de passe (sensible à la casse)
4. Consultez les logs backend pour plus de détails

### "401 Unauthorized"
C'est normal si vous n'êtes pas connecté. Utilisez un des comptes ci-dessus.

### "Base de données vide"
```bash
# Créer les tables
npx prisma migrate dev

# Créer les utilisateurs
npx prisma db seed
```

## 🎯 Résumé Rapide

**Pour commencer immédiatement:**

1. **Créer les comptes**:
   ```bash
   npx prisma db seed
   ```

2. **Se connecter**:
   - URL: http://localhost:5173
   - Email: `admin@transit.gn`
   - Password: `AdminSecure123!`

3. **Tester l'application** ✅

---

**Bon développement! 🚀**
