# 📊 Guide du Calculateur Douanier Guinéen

## Vue d'ensemble

Le calculateur douanier est un outil contextualisé pour la Guinée, basé sur :
- **Code des Douanes Guinée** (version 2023-2024)
- **Tarif Extérieur Commun CEDEAO** (TEC)
- **Loi de Finances en vigueur**

---

## 🏛️ Taxes en Guinée

### 1. Droit de Douane (DD)
Variable selon le Code SH (Système Harmonisé) :

| Catégorie | Taux DD | Exemples |
|-----------|---------|----------|
| **CAT 0** | 0% | Médicaments essentiels, Riz, Blé |
| **CAT 1** | 5% | Matières premières, Équipements industriels |
| **CAT 2** | 10% | Biens intermédiaires |
| **CAT 3** | 20% | Biens de consommation (voitures, TV) |
| **CAT 4** | 35% | Produits spécifiques (tabac, alcool, luxe) |

### 2. RTL (Redevance Télédiffusion)
- **Taux** : 2% de la valeur CAF
- **Base** : Valeur CAF (FOB + Fret + Assurance)
- **Applicabilité** : Toutes importations (sauf transit/export)

### 3. RDL (Redevance Développement Local)
- **Taux** : 1.5% de la valeur CAF
- **Base** : Valeur CAF
- **Destination** : Financement collectivités locales

### 4. TVS (Taxe sur Valeur ajoutée et Services)
- **Taux** : 18%
- **Base** : Valeur Fiscale (CAF + DD + RTL + RDL)
- **Particularité** : Se calcule APRÈS les autres taxes

---

## 🔢 Formule de Calcul

```
1. Valeur CAF = FOB + Fret + Assurance

2. DD = Valeur CAF × Taux DD (selon code SH)

3. RTL = Valeur CAF × 2%

4. RDL = Valeur CAF × 1.5%

5. Valeur Fiscale = CAF + DD + RTL + RDL

6. TVS = Valeur Fiscale × 18%

7. TOTAL TAXES = DD + RTL + RDL + TVS

8. COÛT TOTAL = CAF + TOTAL TAXES
```

---

## 📦 Codes SH (Système Harmonisé)

### Qu'est-ce qu'un code SH ?

Le **Système Harmonisé** (HS Code) est une nomenclature internationale de classification des marchandises :
- **4 premiers chiffres** : Catégorie générale (ex: 8703 = Voitures)
- **6 chiffres** : Sous-catégorie (ex: 8703.23 = Voitures essence 1500-3000 cm³)
- **8-10 chiffres** : Détail national

### Exemples de codes courants

| Code SH | Description | DD | Secteur |
|---------|-------------|-----|---------|
| **3002** | Médicaments (vaccins, sérums) | 0% | Santé |
| **1006** | Riz | 0% | Alimentaire |
| **3920** | Plaques plastiques | 5% | Industrie |
| **7208** | Fer/Acier laminé | 5% | Construction |
| **8471** | Ordinateurs | 5% | Technologie |
| **8703** | Voitures tourisme | 20% | Automobile |
| **8528** | Téléviseurs | 20% | Électronique |
| **2402** | Cigarettes | 35% | Tabac |
| **2208** | Alcools | 35% | Boissons |

### Comment trouver votre code SH ?

1. **Dans l'application** : Utilisez la recherche par mot-clé
2. **Site officiel Douanes** : [www.douanes.gov.gn](http://www.douanes.gov.gn)
3. **Base CEDEAO** : Tarif Extérieur Commun
4. **Commissionnaire agrée** : Assistance professionnelle

---

## 🛂 Régimes Douaniers

### IM4 - Import pour Consommation
- **Usage** : Marchandise destinée au marché guinéen
- **Taxes** : Toutes (DD + RTL + RDL + TVS)
- **Documents** : Facture, BL, Certificats

### IT - Transit International
- **Usage** : Marchandise en transit vers pays tiers (Mali, Burkina, etc.)
- **Taxes** : **AUCUNE** (suspension totale)
- **Obligation** : Caution bancaire + Engagement réexport
- **Destination** : DOIT être hors Guinée

### AT - Admission Temporaire
- **Usage** : Import temporaire (matériel chantier, équipement foires)
- **Taxes** : **SUSPENSION** (caution requise)
- **Durée** : Maximum 1 an
- **Obligation** : Engagement réexport obligatoire

### Export
- **Usage** : Marchandise guinéenne vers étranger
- **Taxes** : Aucune taxe d'importation
- **Documents** : Certificat origine, Autorisation export

---

## 🎫 Exonérations

### Types d'exonérations disponibles

#### 1. Diplomatique
- **Bénéficiaires** : Ambassades, consulats, organisations internationales
- **Taxes exemptées** : Toutes (DD + RTL + RDL + TVS)
- **Documents** :
  - Carte diplomatique
  - Attestation Ministère Affaires Étrangères
  - Liste marchandises validée

#### 2. Humanitaire
- **Bénéficiaires** : PAM, UNHCR, ONG agréées
- **Taxes exemptées** : Toutes
- **Documents** :
  - Certificat exonération DND
  - Convention avec État
  - Attestation Ministère Plan

#### 3. Secteur Minier
- **Bénéficiaires** : Sociétés minières sous convention
- **Taxes exemptées** : DD uniquement
- **Base légale** : Code Minier 2011
- **Documents** :
  - Convention minière
  - Programme investissement validé

#### 4. Agriculture
- **Bénéficiaires** : Importateurs intrants agricoles
- **Taxes exemptées** : DD + TVS
- **Produits** : Semences, engrais, tracteurs, équipements
- **Documents** :
  - Autorisation Ministère Agriculture
  - Certificat phytosanitaire

#### 5. Médicaments
- **Bénéficiaires** : Pharmacies, hôpitaux
- **Taxes exemptées** : DD + TVS
- **Produits** : Liste OMS médicaments essentiels
- **Documents** :
  - Autorisation Pharmacie Nationale
  - Certificat conformité OMS

#### 6. CEDEAO
- **Bénéficiaires** : Produits originaires CEDEAO
- **Taxes exemptées** : DD uniquement
- **Documents** :
  - **Certificat origine CEDEAO (Forme C)**
  - Facture commerciale
  - Attestation chambre commerce

---

## 💡 Exemples Pratiques

### Exemple 1 : Import Conteneur Plastique (Standard)

**Données** :
- FOB : 10,000,000 GNF
- Fret : 500,000 GNF
- Assurance : 100,000 GNF
- Code SH : 3920 (Plastiques)
- Régime : IM4

**Calcul** :
```
CAF = 10,000,000 + 500,000 + 100,000 = 10,600,000 GNF

DD (5%) = 10,600,000 × 0.05 = 530,000 GNF
RTL (2%) = 10,600,000 × 0.02 = 212,000 GNF
RDL (1.5%) = 10,600,000 × 0.015 = 159,000 GNF

Valeur Fiscale = 10,600,000 + 530,000 + 212,000 + 159,000 = 11,501,000 GNF

TVS (18%) = 11,501,000 × 0.18 = 2,070,180 GNF

TOTAL TAXES = 530,000 + 212,000 + 159,000 + 2,070,180 = 2,971,180 GNF

COÛT TOTAL = 10,600,000 + 2,971,180 = 13,571,180 GNF
```

### Exemple 2 : Import Riz (Bien Essentiel)

**Données** :
- FOB : 8,000,000 GNF
- Fret : 400,000 GNF
- Assurance : 80,000 GNF
- Code SH : 1006 (Riz)
- Régime : IM4

**Calcul** :
```
CAF = 8,480,000 GNF

DD (0%) = 0 GNF           ← Bien essentiel
RTL (2%) = 169,600 GNF
RDL (1.5%) = 127,200 GNF

Valeur Fiscale = 8,776,800 GNF

TVS (18%) = 1,579,824 GNF

TOTAL TAXES = 1,876,624 GNF
```

### Exemple 3 : Transit vers Mali

**Données** :
- FOB : 15,000,000 GNF
- Fret : 800,000 GNF
- Assurance : 200,000 GNF
- Régime : IT (Transit)
- Destination : Bamako, Mali

**Calcul** :
```
CAF = 16,000,000 GNF

DD = 0 GNF    ← Suspension
RTL = 0 GNF   ← Suspension
RDL = 0 GNF   ← Suspension
TVS = 0 GNF   ← Suspension

TOTAL TAXES = 0 GNF

⚠️ CAUTION BANCAIRE OBLIGATOIRE
📋 Engagement réexport + Itinéraire défini
```

---

## ⚠️ Points d'Attention

### 1. Valeurs Déclarées
- Les valeurs doivent correspondre à la **facture commerciale**
- Sous-évaluation = Pénalités + Redressement
- Sur-évaluation = Taxes excessives payées

### 2. Origine des Marchandises
- **CEDEAO** : Certificat origine obligatoire pour exonération DD
- **Hors CEDEAO** : Taux pleins appliqués
- Vérification par services douaniers

### 3. Documents Requis (Minimum)
- ✅ Facture commerciale (original)
- ✅ Bill of Lading (BL)
- ✅ Certificat d'origine
- ✅ Liste de colisage (Packing List)
- ✅ Certificats sanitaires/phytosanitaires (si applicable)

### 4. Délais & Pénalités
- **Jours francs** : Variable selon terminal (7-14 jours)
- **Surestaries** : ~15,000 GNF/jour/conteneur après jours francs
- **Majorations** : 5% par mois de retard sur taxes

### 5. Contrôle Physique
- Inspection aléatoire : ~20% des envois
- Inspection ciblée : Valeurs élevées, produits sensibles
- Scanner obligatoire : Tous conteneurs

---

## 🔧 Utilisation de l'Application

### Calcul Simple

1. Entrer **Valeur FOB** (prix marchandise)
2. Entrer **Fret** (transport maritime)
3. Entrer **Assurance**
4. Résultat affiché instantanément

### Calcul Avancé

1. Cliquer **"Options Avancées"**
2. Rechercher **Code SH** par mot-clé
3. Sélectionner **Régime douanier**
4. Cocher **Exonération** si applicable
5. Voir détails complets + warnings

### Interprétation des Résultats

- **Valeur CAF** : Base de calcul
- **Valeur Fiscale** : Base TVS
- **Total Taxes** : Montant à payer Douanes
- **Warnings** : Alertes importantes (haute valeur, documents, etc.)

---

## 📞 Support & Ressources

### Contacts Officiels

- **Direction Nationale Douanes (DND)** : +224 XXX XX XX XX
- **Guichet Unique Commerce Extérieur** : [www.guichet-unique.gov.gn](http://www.guichet-unique.gov.gn)
- **CEDEAO Tarifs** : [www.ecowas.int](http://www.ecowas.int)

### Mise à Jour des Taux

⚠️ **IMPORTANT** : Les taux affichés sont basés sur la **Loi de Finances 2024**. Vérifier annuellement :
- Loi de Finances (publiée décembre chaque année)
- Arrêtés modificatifs DND
- Conventions internationales

### Disclaimer

> 📋 Ce calculateur fournit des **estimations**. Les montants définitifs sont déterminés par la **Direction Nationale des Douanes** lors de la liquidation officielle. Consulter un commissionnaire agréé pour dossiers complexes.

---

## 🆕 Changelog

### Version 2.0 (Janvier 2025)
- ✅ Ajout base codes SH complète
- ✅ Gestion exonérations par type
- ✅ Régimes douaniers (IT, AT, Export)
- ✅ Recherche intelligente codes SH
- ✅ Warnings contextuels
- ✅ Documentation complète

### Version 1.0
- Calcul simple (DD fixe 20%)
- Pas de codes SH
- Pas d'exonérations

---

**Dernière mise à jour** : Janvier 2025  
**Basé sur** : Code Douanes Guinée 2024, TEC CEDEAO 2024
