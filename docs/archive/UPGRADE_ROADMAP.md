# 🚀 Roadmap Upgrades Breaking Changes

**Date**: Janvier 2026  
**Objectif**: Migration versions majeures (Prisma 7, Zod 4, Vite 7, bcrypt 6)  
**Effort estimé**: 12-16 heures  
**Priorité**: Sprint 3 (après audit sécurité complet)

---

## ⚠️ Upgrades Disponibles (npm outdated)

| Package | Version Actuelle | Latest | Type | Breaking | Effort |
|---------|-----------------|--------|------|----------|--------|
| `@prisma/client` | 5.22.0 | **7.2.0** | Major | ✅ Oui | 4-6h |
| `prisma` | 5.22.0 | **7.2.0** | Major | ✅ Oui | (synchronisé) |
| `zod` | 3.25.76 | **4.3.5** | Major | ✅ Oui | 4-8h |
| `bcrypt` | 5.1.1 | **6.0.0** | Major | ⚠️ Possible | 1h |
| `vite` | 6.4.1 | **7.3.1** | Major | ✅ Oui | 2h |
| `@types/node` | 22.19.3 | **25.0.3** | Major | ❌ Non | 30min |
| `typescript` | 5.8.3 | **5.9.3** | Minor | ❌ Non | 15min |
| `happy-dom` | 20.0.11 | **20.1.0** | Patch | ❌ Non | 5min |

---

## 🔴 P0 - Critique (Semaine 1)

### ✅ 1. bcrypt 5.1.1 → 6.0.0 - COMPLÉTÉ
**Effort**: 1 heure  
**Statut**: ✅ **UPGRADE TERMINÉ (Janvier 2026)**

**Résultats** :
- ✅ bcrypt 6.0.0 installé
- ✅ 5 packages deprecated éliminés :
  - inflight (memory leak critique)
  - npmlog
  - glob@7
  - rimraf@3
  - are-we-there-yet
- ✅ Hash compatibility vérifiée (backwards compatible)
- ✅ Performance hashSync() maintenue (~100ms pour 10 rounds)
- ✅ Tests unitaires passent (authService.test.ts)
- ✅ npm audit : 0 vulnerabilities

**Breaking changes** : Aucun (backwards compatible)

**Documentation** : https://github.com/kelektiv/node.bcrypt.js/releases/tag/v6.0.0

**Avant** :
```bash
npm list bcrypt
bcrypt@5.1.1
  └─ 5 deprecated packages (inflight, npmlog, glob@7, rimraf@3, are-we-there-yet)
```

**Après** :
```bash
npm list bcrypt
bcrypt@6.0.0
  └─ 0 deprecated packages ✅
```

---

## 🟠 P1 - Important (Semaine 2-3)

### 2. Prisma 5.22.0 → 7.2.0
**Effort**: 4-6 heures  
**Breaking**: Migrations schema, API changes, typed queries

```bash
# Branch isolée
git checkout -b prisma-7-upgrade
npm install @prisma/client@7.2.0 prisma@7.2.0

# Review migrations breaking
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
npx prisma generate

# Tests
npm test -- prisma/
npm run dev:server # Vérifier démarrage
```

**Breaking Changes Prisma 7**:
- `prisma.$transaction()` signature changes (callback vs array)
- Typed queries: `Prisma.UserSelect` → `Prisma.UserGetPayload<{select: ...}>`
- JSON protocol (performances +30%)
- `@@index` → `@@index([fields], map: "custom_name")`

**Tests critiques**:
- ✅ 40+ requêtes Prisma (server/services/*.ts)
- ✅ Migrations apply sans erreur
- ✅ Seed data `npx prisma db seed`
- ✅ Tests integration context/transitContext.tsx

**Documentation**: https://www.prisma.io/docs/guides/upgrade-guides/upgrading-to-prisma-7

---

### 3. Zod 3.25.76 → 4.3.5
**Effort**: 4-8 heures  
**Breaking**: `.optional()`, `.refine()` async, error messages

```bash
git checkout -b zod-4-upgrade
npm install zod@4.3.5

# Rechercher usages
grep -r "z\.optional()" --include="*.ts" --include="*.tsx"
grep -r "z\.refine(" --include="*.ts" --include="*.tsx"
```

**Breaking Changes Zod 4**:
1. `.optional()` → `.nullish()` (null + undefined)
   ```typescript
   // Avant (Zod 3)
   z.string().optional() // undefined uniquement
   
   // Après (Zod 4)
   z.string().nullish() // null + undefined
   z.string().optional() // DEPRECATED warning
   ```

2. `.refine()` async changes
   ```typescript
   // Avant (Zod 3)
   .refine(val => asyncCheck(val), { message: "..." })
   
   // Après (Zod 4)
   .refine(async (val) => await asyncCheck(val), { message: "..." })
   ```

3. Error messages format
   ```typescript
   // Zod 4: path array vs string
   error.issues[0].path // ['user', 'email'] vs 'user.email'
   ```

**Fichiers à refactor** (estimé 10+ schemas):
- `utils/validators.ts` (ISO 6346, MRZ, regex)
- `context/transitContext.tsx` (shipment validation)
- `services/customsRatesService.ts` (tariff calculation)
- `server/routes/*.ts` (request validation)
- Tests: `validators.test.ts`, `paymentLogic.test.ts`

**Tests critiques**:
- ✅ 15+ tests validators (npm test validators.test.ts)
- ✅ API validation endpoints (Postman collection)
- ✅ Forms CreateShipmentForm (validation UX)

**Documentation**: https://zod.dev/migration-guide-v4

---

## 🔵 P2 - Souhaitable (Semaine 4)

### 4. Vite 6.4.1 → 7.3.1
**Effort**: 2 heures  
**Breaking**: Config plugins, ESM changes

```bash
git checkout -b vite-7-upgrade
npm install vite@7.3.1

# Vérifier plugins compatibilité
npm outdated | grep vite-plugin
npm install vite-plugin-pwa@latest # Si nécessaire

# Config changes
code vite.config.ts
```

**Breaking Changes Vite 7**:
- Plugins API: `configResolved()` hook signature
- ESM only (no CommonJS)
- CSS modules: `*.module.css` naming strict
- PWA plugin: vite-plugin-pwa@1.x → 2.x (check compatibility)

**Tests critiques**:
- ✅ Build production: `npm run build`
- ✅ PWA Service Worker génération (public/service-worker.js)
- ✅ Dev server: `npm run dev` (HMR)
- ✅ Preview: `npm run preview`

**Documentation**: https://vitejs.dev/guide/migration

---

### 5. @types/node 22.19.3 → 25.0.3
**Effort**: 30 minutes  
**Breaking**: Types Node.js (check Express 5.2 compatibility)

```bash
npm install -D @types/node@25.0.3
npm run build # Vérifier compilation TypeScript
```

**Tests critiques**:
- ✅ Compilation: `tsc --noEmit`
- ✅ Server build: `npm run build:server`
- ✅ Express types: `server/index.ts`

---

## 🟢 P3 - Optionnel (Maintenance)

### 6. TypeScript 5.8.3 → 5.9.3
```bash
npm install -D typescript@5.9.3
npm run build
```

### 7. happy-dom 20.0.11 → 20.1.0
```bash
npm install -D happy-dom@20.1.0
npm test
```

---

## 📋 Checklist Migration

### Avant upgrade
- [ ] Commit git clean: `git status`
- [ ] Branch isolée: `git checkout -b upgrade-<package>`
- [ ] Backup production database (si Prisma)
- [ ] Tests passent: `npm test`
- [ ] Build OK: `npm run build`

### Pendant upgrade
- [ ] Lire CHANGELOG package
- [ ] Installer version: `npm install <package>@<version>`
- [ ] Corriger breaking changes code
- [ ] Tests unitaires: `npm test`
- [ ] Tests integration: `npm run dev:all`

### Après upgrade
- [ ] Build production: `npm run build`
- [ ] Performance check (Lighthouse)
- [ ] Déploiement staging
- [ ] Smoke tests production
- [ ] Rollback plan documenté

---

## 🎯 Ordre Recommandé

1. **bcrypt 6.0** (P0) → Tests authService → Deploy staging
2. **@types/node 25** (P2) → Compilation TypeScript
3. **TypeScript 5.9** (P3) → Quick win
4. **happy-dom 20.1** (P3) → Quick win
5. **Prisma 7** (P1) → Branch isolée → Tests exhaustifs → Deploy
6. **Zod 4** (P1) → Refactor schemas → Tests validators
7. **Vite 7** (P2) → Config plugins → Build production

---

## ⚠️ Risks & Mitigation

| Risk | Probabilité | Impact | Mitigation |
|------|------------|--------|------------|
| Prisma 7 migrations fail | Moyenne | 🔴 Critique | Backup DB, rollback migrations, branch isolée |
| Zod 4 schemas cassés | Haute | 🟠 Important | Tests coverage 60%+, validation manuelle forms |
| bcrypt 6 hashes incompatibles | Faible | 🔴 Critique | Tests regression, migration progressive dual-hash |
| Vite 7 build fail | Moyenne | 🟠 Important | Rollback package.json, check plugins compatibility |

---

## 📊 Estimation Totale

- **P0 (bcrypt)**: 1h
- **P1 (Prisma + Zod)**: 8-14h
- **P2 (Vite + @types/node)**: 2.5h
- **P3 (TypeScript + happy-dom)**: 20min

**Total**: **12-16 heures** sur 4 semaines (Sprint 3)

---

## 📚 Ressources

- Prisma 7: https://www.prisma.io/docs/guides/upgrade-guides/upgrading-to-prisma-7
- Zod 4: https://zod.dev/migration-guide-v4
- Vite 7: https://vitejs.dev/guide/migration
- bcrypt 6: https://github.com/kelektiv/node.bcrypt.js/releases

---

**Note**: Upgrades bcrypt/Prisma/Zod/Vite = breaking changes confirmés. Tests exhaustifs requis. Rollback plan mandatory.
