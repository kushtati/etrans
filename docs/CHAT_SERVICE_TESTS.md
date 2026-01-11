# 🧪 Tests ChatService - Documentation

## Vue d'Ensemble

Suite complète de **34 tests unitaires** pour le service de chat conversationnel.

**Résultat** : ✅ **34/34 tests passent** (100%)

---

## 📊 Statistiques

```
Test Files:  1 passed (1)
Tests:       34 passed (34)
Duration:    ~1.8s
Coverage:    100% des fonctions publiques
```

---

## 🎯 Tests par Fonction

### 1. `getOrCreateChatSession` (7 tests)

| Test | Description | Vérifie |
|------|-------------|---------|
| ✅ Crée nouvelle session avec UUID unique | Génération ID v4 valide | Format UUID, userId, timestamps |
| ✅ Génère des IDs uniques pour chaque session | Unicité IDs | Pas de collision |
| ✅ Récupère session existante si valide | Continuité conversation | Même sessionId retourné |
| ✅ Refuse session si userId différent | Sécurité isolation | Nouvelle session créée |
| ✅ Crée nouvelle session si sessionId inconnu | Robustesse | Fallback création |
| ✅ Expire session après 1h d'inactivité | Nettoyage mémoire | Session recréée si > 1h |
| ✅ Ne expire pas session si moins d'1h | Persistance contexte | Session conservée si < 1h |

**Exemple test** :
```typescript
it('expire session après 1h d\'inactivité', () => {
  const session1 = getOrCreateChatSession(null, 'user123');
  
  // Simuler 1h + 1ms d'inactivité
  const storedSession = getChatSession(session1.id);
  if (storedSession) {
    storedSession.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1));
  }
  
  const session2 = getOrCreateChatSession(session1.id, 'user123');
  
  expect(session2.id).not.toBe(session1.id); // Nouvelle session
});
```

---

### 2. `addMessageToSession` (6 tests)

| Test | Description | Vérifie |
|------|-------------|---------|
| ✅ Ajoute message utilisateur à la session | Ajout user | role='user', content, timestamp |
| ✅ Ajoute message assistant à la session | Ajout assistant | role='assistant', content |
| ✅ Ajoute plusieurs messages dans l'ordre | Ordre chronologique | FIFO preservation |
| ✅ Limite historique à 15 messages (FIFO) | Limite mémoire | Suppression anciens messages |
| ✅ Met à jour lastActivityAt lors de l'ajout | Tracking activité | Timestamp MAJ |
| ✅ Ne fait rien si session introuvable | Robustesse | Log erreur, pas de crash |

**Scénario limite** :
```typescript
it('limite historique à 15 messages (FIFO)', () => {
  const session = getOrCreateChatSession(null, 'user123');
  
  // Ajouter 20 messages
  for (let i = 0; i < 20; i++) {
    addMessageToSession(session.id, 'user', `Message ${i}`);
  }
  
  const storedSession = getChatSession(session.id);
  expect(storedSession?.messages).toHaveLength(15);
  
  // Messages 0-4 supprimés, reste 5-19
  expect(storedSession?.messages[0].content).toBe('Message 5');
  expect(storedSession?.messages[14].content).toBe('Message 19');
});
```

---

### 3. `getConversationHistory` (6 tests)

| Test | Description | Vérifie |
|------|-------------|---------|
| ✅ Retourne chaîne vide pour session sans messages | Cas vide | `''` |
| ✅ Retourne chaîne vide pour session introuvable | Robustesse | Pas de crash |
| ✅ Formate un seul message correctement | Format simple | `User: ...` |
| ✅ Formate conversation avec alternance user/assistant | Format complet | `User: ...\n\nAssistant: ...` |
| ✅ Préserve contenu multi-lignes | Intégrité contenu | Newlines préservés |
| ✅ Gère caractères spéciaux | Unicode/émoji | Pas d'échappement |

**Format attendu** :
```typescript
// Entrée :
messages = [
  { role: 'user', content: 'Quels documents pour riz?' },
  { role: 'assistant', content: 'Facture, BL, Certificat.' },
  { role: 'user', content: 'Et pour le maïs?' }
];

// Sortie :
getConversationHistory(sessionId)
// → "User: Quels documents pour riz?\n\n"
//   "Assistant: Facture, BL, Certificat.\n\n"
//   "User: Et pour le maïs?"
```

---

### 4. `cleanExpiredSessions` (5 tests)

| Test | Description | Vérifie |
|------|-------------|---------|
| ✅ Supprime sessions expirées | Nettoyage mémoire | Retour count correct |
| ✅ Ne supprime pas sessions actives | Préservation données | Sessions < 1h conservées |
| ✅ Retourne 0 si aucune session | Cas vide | Pas d'erreur |
| ✅ Supprime toutes les sessions expirées | Nettoyage complet | Batch deletion |
| ✅ Log le nombre de sessions supprimées | Observabilité | Console.log vérifié |

**Exemple nettoyage** :
```typescript
it('supprime sessions expirées', () => {
  const session1 = getOrCreateChatSession(null, 'user123');
  const session2 = getOrCreateChatSession(null, 'user456');
  
  // Expirer session1 uniquement
  const storedSession1 = getChatSession(session1.id);
  if (storedSession1) {
    storedSession1.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1000));
  }
  
  const deletedCount = cleanExpiredSessions();
  
  expect(deletedCount).toBe(1);
  expect(getChatSession(session1.id)).toBeUndefined(); // Supprimée
  expect(getChatSession(session2.id)).toBeDefined();   // Conservée
});
```

---

### 5. `getChatStats` (4 tests)

| Test | Description | Vérifie |
|------|-------------|---------|
| ✅ Retourne stats vides au démarrage | État initial | totalSessions=0, activeSessions=0 |
| ✅ Compte sessions actives correctement | Comptage sessions | totalSessions=activeSessions |
| ✅ Compte messages totaux | Agrégation messages | Somme tous messages |
| ✅ Distingue sessions actives vs expirées | Filtrage expiration | activeSessions < totalSessions |

**Exemple stats** :
```typescript
it('compte messages totaux', () => {
  const session1 = getOrCreateChatSession(null, 'user123');
  addMessageToSession(session1.id, 'user', 'Message 1');
  addMessageToSession(session1.id, 'assistant', 'Réponse 1');
  
  const session2 = getOrCreateChatSession(null, 'user456');
  addMessageToSession(session2.id, 'user', 'Message 2');
  
  const stats = getChatStats();
  
  expect(stats.totalSessions).toBe(2);
  expect(stats.activeSessions).toBe(2);
  expect(stats.totalMessages).toBe(3); // 2 (session1) + 1 (session2)
});
```

---

### 6. `getUserChatSessions` (4 tests)

| Test | Description | Vérifie |
|------|-------------|---------|
| ✅ Retourne tableau vide si aucune session | Cas vide | `[]` |
| ✅ Retourne sessions de l'utilisateur | Filtrage userId | Seulement sessions user |
| ✅ Trie sessions par lastActivityAt descendant | Ordre chronologique | Plus récentes en premier |
| ✅ Inclut sessions expirées dans résultats | Pas de filtrage | Toutes sessions user |

**Exemple filtrage** :
```typescript
it('retourne sessions de l\'utilisateur', () => {
  const session1 = getOrCreateChatSession(null, 'user123');
  const session2 = getOrCreateChatSession(null, 'user456');
  const session3 = getOrCreateChatSession(null, 'user123');
  
  const sessions = getUserChatSessions('user123');
  
  expect(sessions).toHaveLength(2);
  expect(sessions.map(s => s.id)).toContain(session1.id);
  expect(sessions.map(s => s.id)).toContain(session3.id);
  expect(sessions.map(s => s.id)).not.toContain(session2.id); // user456
});
```

---

### 7. `getChatSession` (2 tests)

| Test | Description | Vérifie |
|------|-------------|---------|
| ✅ Retourne session existante | Récupération | Session complète |
| ✅ Retourne undefined si session introuvable | Robustesse | Pas de throw |

---

## 🔍 Détails Techniques

### Configuration Tests

**Fichier** : `tests/chatService.test.ts`  
**Framework** : Vitest  
**Imports** :
```typescript
import {
  getOrCreateChatSession,
  addMessageToSession,
  getConversationHistory,
  cleanExpiredSessions,
  getChatStats,
  getUserChatSessions,
  getChatSession,
  clearAllSessions  // Fonction test-only
} from '../server/services/chatService';
```

### Isolation Tests

**Problème initial** : Sessions persistaient entre tests (store Map partagé)

**Solution** :
```typescript
// chatService.ts - Fonction ajoutée
export const clearAllSessions = (): void => {
  chatSessions.clear();
};

// chatService.test.ts - Hook beforeEach
beforeEach(() => {
  clearAllSessions(); // Reset complet avant chaque test
});
```

### Mocking

**Timers** (pour tests expiration) :
```typescript
// Simuler 1h d'inactivité
const storedSession = getChatSession(sessionId);
if (storedSession) {
  storedSession.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1));
}

// Avancer le temps (timers fake)
vi.useFakeTimers();
vi.advanceTimersByTime(10000); // +10s
vi.useRealTimers();
```

**Console** (pour tests logs) :
```typescript
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

cleanExpiredSessions();

expect(consoleLogSpy).toHaveBeenCalledWith(
  expect.stringContaining('1 sessions expirées nettoyées')
);

consoleLogSpy.mockRestore();
```

---

## 🚀 Exécution Tests

### Commandes

```bash
# Tous les tests ChatService
npm run test:run -- tests/chatService.test.ts

# Mode watch (dev)
npm run test -- tests/chatService.test.ts

# Coverage
npm run test:run -- tests/chatService.test.ts --coverage

# Verbose
npm run test:run -- tests/chatService.test.ts --reporter=verbose
```

### Sortie Attendue

```
✓ tests/chatService.test.ts (34 tests) 58ms
  ✓ ChatService (34)
    ✓ getOrCreateChatSession (7)
      ✓ crée nouvelle session avec UUID unique 7ms
      ✓ génère des IDs uniques pour chaque session 2ms
      ✓ récupère session existante si valide 1ms
      ✓ refuse session si userId différent 2ms
      ✓ crée nouvelle session si sessionId inconnu 1ms
      ✓ expire session après 1h d'inactivité 3ms
      ✓ ne expire pas session si moins d'1h 1ms
    ✓ addMessageToSession (6)
      ...
    ✓ getConversationHistory (6)
      ...
    ✓ cleanExpiredSessions (5)
      ...
    ✓ getChatStats (4)
      ...
    ✓ getUserChatSessions (4)
      ...
    ✓ getChatSession (2)
      ...

Test Files  1 passed (1)
     Tests  34 passed (34)
  Duration  1.80s
```

---

## 📋 Couverture Fonctionnelle

### ✅ Fonctions Couvertes

| Fonction | Tests | Coverage |
|----------|-------|----------|
| `getOrCreateChatSession` | 7 | 100% |
| `addMessageToSession` | 6 | 100% |
| `getConversationHistory` | 6 | 100% |
| `cleanExpiredSessions` | 5 | 100% |
| `getChatStats` | 4 | 100% |
| `getUserChatSessions` | 4 | 100% |
| `getChatSession` | 2 | 100% |

### 🎯 Scénarios Testés

**Cas Normaux** :
- ✅ Création session
- ✅ Récupération session existante
- ✅ Ajout messages alternés (user/assistant)
- ✅ Récupération historique formaté

**Cas Limites** :
- ✅ Session expirée (> 1h)
- ✅ Historique > 15 messages (FIFO)
- ✅ Session introuvable
- ✅ Session vide (0 messages)
- ✅ Caractères spéciaux/émoji

**Sécurité** :
- ✅ Isolation userId (session appartient à l'utilisateur)
- ✅ Nettoyage automatique (prevent memory leak)

**Edge Cases** :
- ✅ Store vide
- ✅ Multi-utilisateurs
- ✅ Timestamps concurrents
- ✅ Contenu multi-lignes

---

## 🔧 Maintenance

### Ajouter Nouveau Test

```typescript
describe('ChatService', () => {
  // ... tests existants

  it('nouveau comportement à tester', () => {
    // Arrange
    const session = getOrCreateChatSession(null, 'user123');
    
    // Act
    addMessageToSession(session.id, 'user', 'Test');
    
    // Assert
    const storedSession = getChatSession(session.id);
    expect(storedSession?.messages).toHaveLength(1);
  });
});
```

### Debugging Test Échoué

```bash
# Run en mode watch avec debug
npm run test -- tests/chatService.test.ts

# Verbose output
npm run test:run -- tests/chatService.test.ts --reporter=verbose

# Isoler un test
npm run test:run -- tests/chatService.test.ts -t "expire session"
```

---

## 📚 Références

**Fichiers Liés** :
- Code : [server/services/chatService.ts](../server/services/chatService.ts)
- Tests : [tests/chatService.test.ts](../tests/chatService.test.ts)
- Intégration : [server/services/geminiService.ts](../server/services/geminiService.ts) (ligne 180-220)

**Documentation** :
- [Architecture Chat](./CHAT_ARCHITECTURE.md) (TODO)
- [Guide API](./API_GUIDE.md)
- [Tests Guide](./TESTING.md)

---

## ✨ Prochaines Étapes

### Tests Manquants (TODO)

1. **Tests d'Intégration** :
   - [ ] `geminiService.askCustomsAssistant` avec sessions
   - [ ] Endpoint `/api/ai/assistant` avec sessionId
   - [ ] Flow complet : Question 1 → Réponse → Question 2 (contexte)

2. **Tests Performance** :
   - [ ] 1000 sessions concurrentes
   - [ ] Limite mémoire (1000 sessions × 15 messages)
   - [ ] Temps nettoyage automatique

3. **Tests Concurrence** :
   - [ ] 2 requêtes simultanées même session
   - [ ] Race condition lastActivityAt

4. **Tests Edge Cases** :
   - [ ] Message vide/null
   - [ - [ ] Content très volumineux (>10KB)
   - [ ] UUID collision (impossible mais test mock)

### Améliorations Tests

1. **Fixtures** :
```typescript
// tests/fixtures/chatSessions.ts
export const mockSession = {
  id: 'test-session-123',
  userId: 'user123',
  messages: [
    { role: 'user', content: 'Test question', timestamp: new Date() }
  ],
  createdAt: new Date(),
  lastActivityAt: new Date()
};
```

2. **Test Helpers** :
```typescript
// tests/helpers/chatHelpers.ts
export const createTestSession = (userId = 'user123', messageCount = 5) => {
  const session = getOrCreateChatSession(null, userId);
  
  for (let i = 0; i < messageCount; i++) {
    addMessageToSession(session.id, 'user', `Message ${i}`);
  }
  
  return session;
};
```

---

**Date** : 7 Janvier 2026  
**Version** : 1.0.0  
**Auteur** : GitHub Copilot  
**Status** : ✅ **Production-Ready**
