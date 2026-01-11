/**
 * 💬 Service Chat Conversationnel
 * 
 * Gestion :
 * - Sessions de chat avec historique messages
 * - Persistance mémoire (Map)
 * - Nettoyage automatique sessions expirées
 * - Limite taille historique (15 messages max)
 */

import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * Store en mémoire (pour démo/dev)
 * TODO: Migrer vers Redis/DB pour production
 */
const chatSessions = new Map<string, ChatSession>();

/**
 * 🧹 Fonction pour tests : réinitialiser toutes les sessions
 */
export const clearAllSessions = (): void => {
  chatSessions.clear();
};

/**
 * Durée expiration session (1 heure)
 */
const SESSION_EXPIRATION_MS = 60 * 60 * 1000;

/**
 * Nombre max messages par session (limite contexte)
 */
const MAX_MESSAGES_PER_SESSION = 15;

/**
 * Crée ou récupère session de chat
 */
export const getOrCreateChatSession = (
  sessionId: string | null,
  userId: string
): ChatSession => {
  // Tenter récupération session existante
  if (sessionId) {
    const existingSession = chatSessions.get(sessionId);
    
    if (existingSession) {
      // Vérifier que session appartient à l'utilisateur
      if (existingSession.userId !== userId) {
        console.warn(`[Chat] Session ${sessionId} appartient à un autre utilisateur`);
        // Créer nouvelle session
      } else {
        // Vérifier expiration
        const age = Date.now() - existingSession.lastActivityAt.getTime();
        
        if (age > SESSION_EXPIRATION_MS) {
          console.log(`[Chat] Session ${sessionId} expirée (${Math.round(age / 60000)} min)`);
          chatSessions.delete(sessionId);
          // Créer nouvelle session
        } else {
          // Session valide
          return existingSession;
        }
      }
    }
  }
  
  // Créer nouvelle session
  const newSession: ChatSession = {
    id: uuidv4(),
    userId,
    messages: [],
    createdAt: new Date(),
    lastActivityAt: new Date()
  };
  
  chatSessions.set(newSession.id, newSession);
  console.log(`[Chat] Nouvelle session créée: ${newSession.id} (user: ${userId})`);
  
  return newSession;
};

/**
 * Ajoute message à la session
 */
export const addMessageToSession = (
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): void => {
  const session = chatSessions.get(sessionId);
  
  if (!session) {
    console.error(`[Chat] Session ${sessionId} introuvable`);
    return;
  }
  
  // Ajouter message
  session.messages.push({
    role,
    content,
    timestamp: new Date()
  });
  
  // Limiter taille historique (FIFO)
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    const removed = session.messages.splice(0, session.messages.length - MAX_MESSAGES_PER_SESSION);
    console.log(`[Chat] ${removed.length} anciens messages supprimés de session ${sessionId}`);
  }
  
  // MAJ dernière activité
  session.lastActivityAt = new Date();
};

/**
 * Récupère historique formaté pour Gemini
 */
export const getConversationHistory = (sessionId: string): string => {
  const session = chatSessions.get(sessionId);
  
  if (!session || session.messages.length === 0) {
    return '';
  }
  
  return session.messages
    .map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${m.content}`;
    })
    .join('\n\n');
};

/**
 * Récupère session (sans créer)
 */
export const getChatSession = (sessionId: string): ChatSession | undefined => {
  return chatSessions.get(sessionId);
};

/**
 * Supprime session
 */
export const deleteChatSession = (sessionId: string): boolean => {
  return chatSessions.delete(sessionId);
};

/**
 * Nettoyage sessions expirées (appelé périodiquement)
 */
export const cleanExpiredSessions = (): number => {
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [sessionId, session] of chatSessions.entries()) {
    const age = now - session.lastActivityAt.getTime();
    
    if (age > SESSION_EXPIRATION_MS) {
      chatSessions.delete(sessionId);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    console.log(`[Chat] ${deletedCount} sessions expirées nettoyées`);
  }
  
  return deletedCount;
};

/**
 * Stats sessions actives
 */
export const getChatStats = (): {
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
} => {
  const now = Date.now();
  let activeSessions = 0;
  let totalMessages = 0;
  
  for (const session of chatSessions.values()) {
    const age = now - session.lastActivityAt.getTime();
    
    if (age <= SESSION_EXPIRATION_MS) {
      activeSessions++;
    }
    
    totalMessages += session.messages.length;
  }
  
  return {
    totalSessions: chatSessions.size,
    activeSessions,
    totalMessages
  };
};

/**
 * Récupère toutes les sessions d'un utilisateur
 */
export const getUserChatSessions = (userId: string): ChatSession[] => {
  const sessions: ChatSession[] = [];
  
  for (const session of chatSessions.values()) {
    if (session.userId === userId) {
      sessions.push(session);
    }
  }
  
  return sessions.sort((a, b) => 
    b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
  );
};

/**
 * Démarre le job de nettoyage automatique des sessions expirées
 * À appeler depuis server/index.ts au démarrage
 */
export const startChatCleanupJob = (): void => {
  // Nettoyage automatique toutes les 10 minutes
  setInterval(() => {
    cleanExpiredSessions();
  }, 10 * 60 * 1000);

  // Premier nettoyage après 1 minute
  setTimeout(() => {
    cleanExpiredSessions();
  }, 60 * 1000);
  
  console.log('[Chat] Cleanup job started (every 10 minutes)');
};
