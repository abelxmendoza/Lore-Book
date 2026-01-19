import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type {
  ConversationSession,
  ConversationMessage,
  CreateSessionInput,
  SaveMessageInput
} from '../types';

import { embeddingService } from './embeddingService';
import { supabaseAdmin } from './supabaseClient';

class ConversationService {
  /**
   * Create a new conversation session
   */
  async createSession(input: CreateSessionInput): Promise<ConversationSession> {
    const session: ConversationSession = {
      id: uuid(),
      user_id: input.userId,
      started_at: new Date().toISOString(),
      ended_at: null,
      title: input.title ?? null,
      summary: null,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('conversation_sessions')
      .insert(session);

    if (error) {
      logger.error({ error, userId: input.userId }, 'Failed to create conversation session');
      throw error;
    }

    return session;
  }

  /**
   * Get active session for user (most recent unended session)
   */
  async getActiveSession(userId: string): Promise<ConversationSession | null> {
    const { data, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No active session found
        return null;
      }
      logger.error({ error, userId }, 'Failed to get active session');
      throw error;
    }

    return data as ConversationSession;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string, userId: string): Promise<ConversationSession | null> {
    const { data, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error({ error, sessionId, userId }, 'Failed to get session');
      throw error;
    }

    return data as ConversationSession;
  }

  /**
   * End a conversation session
   * Generates session embedding and extracts topics
   */
  async endSession(sessionId: string, userId: string, summary?: string, queueExtraction: boolean = true): Promise<ConversationSession> {
    const updateData: Partial<ConversationSession> = {
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (summary) {
      updateData.summary = summary;
    }

    // Get session messages for embedding and topic extraction
    const messages = await this.getSessionMessages(sessionId, userId);
    const allContent = messages.map(m => m.content).join('\n');

    // Generate session embedding (in background)
    if (allContent.length > 0) {
      embeddingService
        .embedText(allContent.slice(0, 8000))
        .then(embedding => {
          supabaseAdmin
            .from('conversation_sessions')
            .update({ embeddings: embedding })
            .eq('id', sessionId)
            .then(() => logger.debug({ sessionId }, 'Session embedding generated'));
        })
        .catch(error => {
          logger.debug({ error, sessionId }, 'Failed to generate session embedding');
        });

      // Extract topics (simple keyword extraction)
      const topics = this.extractTopics(allContent);
      if (topics.length > 0) {
        updateData.topics = topics;
      }
    }

    // Queue for memory extraction if requested
    if (queueExtraction) {
      const session = await this.getSession(sessionId, userId);
      const metadata = (session?.metadata as Record<string, unknown>) || {};
      updateData.metadata = {
        ...metadata,
        extractionStatus: 'pending',
        extractionQueuedAt: new Date().toISOString(),
      } as any;
    }

    const { data, error } = await supabaseAdmin
      .from('conversation_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error({ error, sessionId, userId }, 'Failed to end session');
      throw error;
    }

    return data as ConversationSession;
  }

  /**
   * Extract topics from content (simple keyword extraction)
   */
  private extractTopics(content: string): string[] {
    const topics = new Set<string>();
    const lowerContent = content.toLowerCase();

    // Common topic keywords
    const topicPatterns = [
      /\b(work|job|career|project|meeting|colleague|boss|client)\b/gi,
      /\b(family|parent|sibling|child|partner|spouse|relative)\b/gi,
      /\b(friend|friendship|social|party|event|gathering)\b/gi,
      /\b(health|exercise|fitness|doctor|medical|illness|recovery)\b/gi,
      /\b(travel|trip|vacation|journey|destination|flight|hotel)\b/gi,
      /\b(learning|education|course|study|skill|knowledge)\b/gi,
      /\b(hobby|interest|passion|creative|art|music|writing)\b/gi,
      /\b(goal|achievement|milestone|success|accomplishment)\b/gi,
      /\b(challenge|problem|difficulty|struggle|obstacle)\b/gi,
      /\b(reflection|insight|realization|understanding|growth)\b/gi,
    ];

    for (const pattern of topicPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const topic = match.toLowerCase().trim();
          if (topic.length > 2) {
            topics.add(topic);
          }
        });
      }
    }

    return Array.from(topics).slice(0, 10); // Limit to 10 topics
  }

  /**
   * Save a conversation message
   */
  async saveMessage(input: SaveMessageInput): Promise<ConversationMessage> {
    // Verify session exists and belongs to user
    const session = await this.getSession(input.sessionId, input.userId);
    if (!session) {
      throw new Error('Session not found or access denied');
    }

    const message: ConversationMessage = {
      id: uuid(),
      session_id: input.sessionId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      created_at: new Date().toISOString(),
      metadata: input.metadata ?? {},
    };

    const { error } = await supabaseAdmin
      .from('conversation_messages')
      .insert(message);

    if (error) {
      logger.error({ error, sessionId: input.sessionId, userId: input.userId }, 'Failed to save message');
      throw error;
    }

    return message;
  }

  /**
   * Get all messages for a session
   */
  async getSessionMessages(
    sessionId: string,
    userId: string,
    limit?: number
  ): Promise<ConversationMessage[]> {
    // Verify session belongs to user
    const session = await this.getSession(sessionId, userId);
    if (!session) {
      throw new Error('Session not found or access denied');
    }

    let query = supabaseAdmin
      .from('conversation_messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error, sessionId, userId }, 'Failed to get session messages');
      throw error;
    }

    return (data ?? []) as ConversationMessage[];
  }

  /**
   * Get or create active session for user
   */
  async getOrCreateActiveSession(userId: string, title?: string): Promise<ConversationSession> {
    const activeSession = await this.getActiveSession(userId);
    if (activeSession) {
      return activeSession;
    }

    return this.createSession({ userId, title });
  }

  /**
   * Get recent sessions for user
   */
  async getRecentSessions(userId: string, limit: number = 10): Promise<ConversationSession[]> {
    const { data, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, userId }, 'Failed to get recent sessions');
      throw error;
    }

    return (data ?? []) as ConversationSession[];
  }

  /**
   * Get session with messages
   */
  async getSessionWithMessages(
    sessionId: string,
    userId: string
  ): Promise<{ session: ConversationSession; messages: ConversationMessage[] } | null> {
    const session = await this.getSession(sessionId, userId);
    if (!session) {
      return null;
    }

    const messages = await this.getSessionMessages(sessionId, userId);

    return { session, messages };
  }
}

export const conversationService = new ConversationService();

