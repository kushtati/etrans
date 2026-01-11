import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getOrCreateChatSession,
  addMessageToSession,
  getConversationHistory,
  cleanExpiredSessions,
  getChatStats,
  getUserChatSessions,
  getChatSession,
  clearAllSessions
} from '../server/services/chatService';

describe('ChatService', () => {
  beforeEach(() => {
    // Nettoyer toutes les sessions avant chaque test
    clearAllSessions();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOrCreateChatSession', () => {
    it('crée nouvelle session avec UUID unique', () => {
      const session = getOrCreateChatSession(null, 'user123');
      
      expect(session.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      expect(session.userId).toBe('user123');
      expect(session.messages).toHaveLength(0);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivityAt).toBeInstanceOf(Date);
    });

    it('génère des IDs uniques pour chaque session', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(null, 'user123');
      
      expect(session1.id).not.toBe(session2.id);
    });

    it('récupère session existante si valide', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(session1.id, 'user123');
      
      expect(session1.id).toBe(session2.id);
      expect(session1.userId).toBe(session2.userId);
    });

    it('refuse session si userId différent', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(session1.id, 'user456');
      
      expect(session2.id).not.toBe(session1.id);
      expect(session2.userId).toBe('user456');
    });

    it('crée nouvelle session si sessionId inconnu', () => {
      const session = getOrCreateChatSession('unknown-session-id', 'user123');
      
      expect(session.id).not.toBe('unknown-session-id');
      expect(session.userId).toBe('user123');
    });

    it('expire session après 1h d\'inactivité', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      
      // Récupérer la session réelle du store
      const storedSession = getChatSession(session1.id);
      expect(storedSession).toBeDefined();
      
      // Simuler 1h + 1ms d'inactivité
      if (storedSession) {
        storedSession.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1));
      }
      
      const session2 = getOrCreateChatSession(session1.id, 'user123');
      
      expect(session2.id).not.toBe(session1.id);
      expect(session2.messages).toHaveLength(0);
    });

    it('ne expire pas session si moins d\'1h', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      
      // Simuler 30 minutes d'inactivité
      const storedSession = getChatSession(session1.id);
      if (storedSession) {
        storedSession.lastActivityAt = new Date(Date.now() - (30 * 60 * 1000));
      }
      
      const session2 = getOrCreateChatSession(session1.id, 'user123');
      
      expect(session2.id).toBe(session1.id);
    });
  });

  describe('addMessageToSession', () => {
    it('ajoute message utilisateur à la session', () => {
      const session = getOrCreateChatSession(null, 'user123');
      
      addMessageToSession(session.id, 'user', 'Quelle est la question?');
      
      const storedSession = getChatSession(session.id);
      expect(storedSession?.messages).toHaveLength(1);
      expect(storedSession?.messages[0].role).toBe('user');
      expect(storedSession?.messages[0].content).toBe('Quelle est la question?');
      expect(storedSession?.messages[0].timestamp).toBeInstanceOf(Date);
    });

    it('ajoute message assistant à la session', () => {
      const session = getOrCreateChatSession(null, 'user123');
      
      addMessageToSession(session.id, 'assistant', 'Voici la réponse.');
      
      const storedSession = getChatSession(session.id);
      expect(storedSession?.messages).toHaveLength(1);
      expect(storedSession?.messages[0].role).toBe('assistant');
      expect(storedSession?.messages[0].content).toBe('Voici la réponse.');
    });

    it('ajoute plusieurs messages dans l\'ordre', () => {
      const session = getOrCreateChatSession(null, 'user123');
      
      addMessageToSession(session.id, 'user', 'Question 1');
      addMessageToSession(session.id, 'assistant', 'Réponse 1');
      addMessageToSession(session.id, 'user', 'Question 2');
      addMessageToSession(session.id, 'assistant', 'Réponse 2');
      
      const storedSession = getChatSession(session.id);
      expect(storedSession?.messages).toHaveLength(4);
      expect(storedSession?.messages[0].content).toBe('Question 1');
      expect(storedSession?.messages[1].content).toBe('Réponse 1');
      expect(storedSession?.messages[2].content).toBe('Question 2');
      expect(storedSession?.messages[3].content).toBe('Réponse 2');
    });

    it('limite historique à 15 messages (FIFO)', () => {
      const session = getOrCreateChatSession(null, 'user123');
      
      // Ajouter 20 messages
      for (let i = 0; i < 20; i++) {
        addMessageToSession(session.id, 'user', `Message ${i}`);
      }
      
      const storedSession = getChatSession(session.id);
      expect(storedSession?.messages).toHaveLength(15);
      
      // Les 5 premiers messages (0-4) doivent être supprimés
      expect(storedSession?.messages[0].content).toBe('Message 5');
      expect(storedSession?.messages[14].content).toBe('Message 19');
    });

    it('met à jour lastActivityAt lors de l\'ajout', () => {
      const session = getOrCreateChatSession(null, 'user123');
      const initialActivity = session.lastActivityAt.getTime();
      
      // Attendre 10ms
      vi.useFakeTimers();
      vi.advanceTimersByTime(10);
      
      addMessageToSession(session.id, 'user', 'Test message');
      
      const storedSession = getChatSession(session.id);
      expect(storedSession?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(initialActivity);
      
      vi.useRealTimers();
    });

    it('ne fait rien si session introuvable', () => {
      // Capturer les logs console
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      addMessageToSession('unknown-session-id', 'user', 'Test');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session unknown-session-id introuvable')
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getConversationHistory', () => {
    it('retourne chaîne vide pour session sans messages', () => {
      const session = getOrCreateChatSession(null, 'user123');
      
      const history = getConversationHistory(session.id);
      
      expect(history).toBe('');
    });

    it('retourne chaîne vide pour session introuvable', () => {
      const history = getConversationHistory('unknown-session-id');
      
      expect(history).toBe('');
    });

    it('formate un seul message correctement', () => {
      const session = getOrCreateChatSession(null, 'user123');
      addMessageToSession(session.id, 'user', 'Question test');
      
      const history = getConversationHistory(session.id);
      
      expect(history).toBe('User: Question test');
    });

    it('formate conversation avec alternance user/assistant', () => {
      const session = getOrCreateChatSession(null, 'user123');
      addMessageToSession(session.id, 'user', 'Quels documents pour importer du riz?');
      addMessageToSession(session.id, 'assistant', 'Vous avez besoin de: Facture, BL, Certificat origine.');
      addMessageToSession(session.id, 'user', 'Et pour le maïs?');
      addMessageToSession(session.id, 'assistant', 'Documents similaires au riz.');
      
      const history = getConversationHistory(session.id);
      
      expect(history).toBe(
        'User: Quels documents pour importer du riz?\n\n' +
        'Assistant: Vous avez besoin de: Facture, BL, Certificat origine.\n\n' +
        'User: Et pour le maïs?\n\n' +
        'Assistant: Documents similaires au riz.'
      );
    });

    it('préserve contenu multi-lignes', () => {
      const session = getOrCreateChatSession(null, 'user123');
      addMessageToSession(session.id, 'user', 'Question\nsur plusieurs\nlignes');
      
      const history = getConversationHistory(session.id);
      
      expect(history).toBe('User: Question\nsur plusieurs\nlignes');
    });

    it('gère caractères spéciaux', () => {
      const session = getOrCreateChatSession(null, 'user123');
      addMessageToSession(session.id, 'user', 'Test avec émoji 🚢 et accents éàç');
      
      const history = getConversationHistory(session.id);
      
      expect(history).toBe('User: Test avec émoji 🚢 et accents éàç');
    });
  });

  describe('cleanExpiredSessions', () => {
    it('supprime sessions expirées', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(null, 'user456');
      
      // Expirer session1
      const storedSession1 = getChatSession(session1.id);
      if (storedSession1) {
        storedSession1.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1000));
      }
      
      const deletedCount = cleanExpiredSessions();
      
      expect(deletedCount).toBe(1);
      expect(getChatSession(session1.id)).toBeUndefined();
      expect(getChatSession(session2.id)).toBeDefined();
    });

    it('ne supprime pas sessions actives', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(null, 'user456');
      
      const deletedCount = cleanExpiredSessions();
      
      expect(deletedCount).toBe(0);
      expect(getChatSession(session1.id)).toBeDefined();
      expect(getChatSession(session2.id)).toBeDefined();
    });

    it('retourne 0 si aucune session', () => {
      const deletedCount = cleanExpiredSessions();
      
      expect(deletedCount).toBe(0);
    });

    it('supprime toutes les sessions expirées', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(null, 'user456');
      const session3 = getOrCreateChatSession(null, 'user789');
      
      // Expirer toutes les sessions
      for (const sessionId of [session1.id, session2.id, session3.id]) {
        const storedSession = getChatSession(sessionId);
        if (storedSession) {
          storedSession.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1000));
        }
      }
      
      const deletedCount = cleanExpiredSessions();
      
      expect(deletedCount).toBe(3);
    });

    it('log le nombre de sessions supprimées', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const session = getOrCreateChatSession(null, 'user123');
      const storedSession = getChatSession(session.id);
      if (storedSession) {
        storedSession.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1000));
      }
      
      cleanExpiredSessions();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 sessions expirées nettoyées')
      );
      
      consoleLogSpy.mockRestore();
    });
  });

  describe('getChatStats', () => {
    it('retourne stats vides au démarrage', () => {
      const stats = getChatStats();
      
      expect(stats.totalSessions).toBe(0);
      expect(stats.activeSessions).toBe(0);
      expect(stats.totalMessages).toBe(0);
    });

    it('compte sessions actives correctement', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(null, 'user456');
      
      const stats = getChatStats();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.totalMessages).toBe(0);
    });

    it('compte messages totaux', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      addMessageToSession(session1.id, 'user', 'Message 1');
      addMessageToSession(session1.id, 'assistant', 'Réponse 1');
      
      const session2 = getOrCreateChatSession(null, 'user456');
      addMessageToSession(session2.id, 'user', 'Message 2');
      
      const stats = getChatStats();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.totalMessages).toBe(3);
    });

    it('distingue sessions actives vs expirées', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(null, 'user456');
      
      // Expirer session1
      const storedSession1 = getChatSession(session1.id);
      if (storedSession1) {
        storedSession1.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1000));
      }
      
      const stats = getChatStats();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(1);
    });
  });

  describe('getUserChatSessions', () => {
    it('retourne tableau vide si aucune session', () => {
      const sessions = getUserChatSessions('user123');
      
      expect(sessions).toHaveLength(0);
    });

    it('retourne sessions de l\'utilisateur', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(null, 'user456');
      const session3 = getOrCreateChatSession(null, 'user123');
      
      const sessions = getUserChatSessions('user123');
      
      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.id)).toContain(session1.id);
      expect(sessions.map(s => s.id)).toContain(session3.id);
      expect(sessions.map(s => s.id)).not.toContain(session2.id);
    });

    it('trie sessions par lastActivityAt descendant', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);
      
      const session2 = getOrCreateChatSession(null, 'user123');
      
      vi.useRealTimers();
      
      const sessions = getUserChatSessions('user123');
      
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe(session2.id); // Plus récente en premier
      expect(sessions[1].id).toBe(session1.id);
    });

    it('inclut sessions expirées dans résultats', () => {
      const session1 = getOrCreateChatSession(null, 'user123');
      const session2 = getOrCreateChatSession(null, 'user123');
      
      // Expirer session1
      const storedSession1 = getChatSession(session1.id);
      if (storedSession1) {
        storedSession1.lastActivityAt = new Date(Date.now() - (60 * 60 * 1000 + 1000));
      }
      
      const sessions = getUserChatSessions('user123');
      
      expect(sessions).toHaveLength(2);
    });
  });

  describe('getChatSession', () => {
    it('retourne session existante', () => {
      const session = getOrCreateChatSession(null, 'user123');
      
      const retrieved = getChatSession(session.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.userId).toBe('user123');
    });

    it('retourne undefined si session introuvable', () => {
      const retrieved = getChatSession('unknown-session-id');
      
      expect(retrieved).toBeUndefined();
    });
  });
});
