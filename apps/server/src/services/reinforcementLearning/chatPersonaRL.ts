import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { RLEngine, type RLContext, type Action } from './rlEngine';

/**
 * Persona blend configuration
 */
export interface PersonaBlend {
  primary: string;
  secondary: string[];
  weights: Record<string, number>;
}

/**
 * Persona action for RL
 */
interface PersonaAction extends Action {
  id: string; // Persona ID
}

/**
 * Chat session context for reward calculation
 */
interface ChatSession {
  sessionId: string;
  messageCount: number;
  hasFollowUpQuestions: boolean;
  averageResponseTime?: number;
  context?: RLContext;
  selectedPersona?: string;
}

/**
 * RL-powered Chat Persona Selection
 * Highest priority: This is the primary user interface
 */
export class ChatPersonaRL {
  private rlEngine: RLEngine;
  private explorationRate: number = 0.15; // Start with 15% exploration

  // Available personas
  private readonly PERSONAS = [
    'therapist',
    'strategist',
    'gossip_buddy',
    'historian',
    'soul_capturer',
    'memory_bank',
  ];

  constructor() {
    this.rlEngine = new RLEngine();
    this.rlEngine.setExplorationRate(this.explorationRate);
  }

  /**
   * Select optimal persona blend using RL
   * This is called BEFORE generating chat response
   */
  async selectPersonaBlend(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<PersonaBlend> {
    try {
      // Extract context features
      const context = await this.buildContext(userId, message, conversationHistory);

      // Available persona actions
      const personaActions: PersonaAction[] = this.PERSONAS.map(id => ({ id }));

      // Use RL to select optimal persona
      const selectedAction = await this.rlEngine.selectAction(
        userId,
        context,
        personaActions
      );

      // Build persona blend (can be multi-persona)
      const blend = this.buildPersonaBlend(selectedAction, context);

      logger.debug(
        { userId, primaryPersona: blend.primary, contextFeatures: Object.keys(context.features) },
        'RL: Selected persona blend'
      );

      return blend;
    } catch (error) {
      logger.error({ error, userId, message }, 'RL: Failed to select persona, using default');
      // Fallback to therapist (safe default)
      return {
        primary: 'therapist',
        secondary: [],
        weights: { therapist: 1.0 },
      };
    }
  }

  /**
   * Record reward when user gives feedback
   * This is the KEY learning signal
   */
  async recordFeedbackReward(
    userId: string,
    messageId: string,
    feedback: 'positive' | 'negative',
    conversationContext?: Array<{ role: string; content: string }>
  ): Promise<void> {
    try {
      // Calculate reward
      const reward = feedback === 'positive' ? 1.0 : -0.8;

      // Get context from when message was generated
      const context = await this.getChatContext(userId, messageId);

      if (!context) {
        logger.warn({ messageId }, 'RL: Could not find chat context for RL update');
        return;
      }

      // Get the selected persona from context
      const selectedPersona = context.selectedPersona || 'therapist';

      // Update RL policy
      await this.rlEngine.updatePolicy(
        userId,
        context,
        { id: selectedPersona, type: 'chat_persona' },
        reward
      );

      logger.info(
        { userId, messageId, feedback, reward, persona: selectedPersona },
        'RL: Recorded chat feedback reward'
      );
    } catch (error) {
      logger.error({ error, userId, messageId, feedback }, 'RL: Failed to record feedback reward');
    }
  }

  /**
   * Record implicit rewards from user behavior
   * This is called automatically after chat interactions
   */
  async recordImplicitRewards(userId: string, sessionId: string, actionData?: {
    messageId?: string;
    actionType?: 'copy' | 'source_click' | 'regenerate' | 'save_entry' | 'follow_up';
    timeSpent?: number; // milliseconds
    messageLength?: number;
  }): Promise<void> {
    try {
      const session = await this.getChatSession(userId, sessionId);

      if (!session || session.messageCount < 2) {
        return; // Need at least 2 messages for a meaningful session
      }

      // Reward signals:
      // 1. Session length (longer = better, up to 0.5)
      const sessionLengthReward = Math.min(session.messageCount / 10, 0.5);

      // 2. User continued conversation (follow-up messages)
      const continuationReward = session.messageCount > 3 ? 0.3 : 0;

      // 3. User asked follow-up questions (engagement)
      const engagementReward = session.hasFollowUpQuestions ? 0.2 : 0;

      // 4. User action rewards (if actionData provided)
      let actionReward = 0;
      if (actionData) {
        switch (actionData.actionType) {
          case 'copy':
            actionReward = 0.15; // User copied = found useful
            break;
          case 'source_click':
            actionReward = 0.2; // User clicked source = engaged
            break;
          case 'save_entry':
            actionReward = 0.3; // User saved = very valuable
            break;
          case 'follow_up':
            actionReward = 0.1; // User sent follow-up = engaged
            break;
          case 'regenerate':
            actionReward = -0.1; // User regenerated = not satisfied (small negative)
            break;
        }

        // Time spent reward (user read the response)
        if (actionData.timeSpent && actionData.timeSpent > 5000) {
          // User spent >5 seconds = likely reading/processing
          actionReward += Math.min(actionData.timeSpent / 30000, 0.1); // Up to 0.1 for 30+ seconds
        }

        // Message length reward (longer follow-up = more engaged)
        if (actionData.messageLength && actionData.messageLength > 50) {
          actionReward += Math.min(actionData.messageLength / 500, 0.1); // Up to 0.1 for 500+ chars
        }
      }

      const totalReward = sessionLengthReward + continuationReward + engagementReward + actionReward;

      if (totalReward > 0 && session.context && session.selectedPersona) {
        await this.rlEngine.updatePolicy(
          userId,
          session.context,
          { id: session.selectedPersona, type: 'chat_persona' },
          totalReward
        );

        logger.debug(
          { userId, sessionId, totalReward, persona: session.selectedPersona, actionData },
          'RL: Recorded implicit rewards'
        );
      }
    } catch (error) {
      logger.error({ error, userId, sessionId }, 'RL: Failed to record implicit rewards');
    }
  }

  /**
   * Record action-based reward (called when user takes specific actions)
   */
  async recordActionReward(
    userId: string,
    messageId: string,
    actionType: 'copy' | 'source_click' | 'regenerate' | 'save_entry',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Get context from when message was generated
      const context = await this.getChatContext(userId, messageId);
      if (!context) {
        logger.debug({ messageId }, 'RL: No context found for action reward');
        return;
      }

      // Get session ID from context
      const { data } = await supabaseAdmin
        .from('rl_chat_contexts')
        .select('session_id, selected_persona')
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .single();

      if (!data) return;

      // Calculate reward based on action
      let reward = 0;
      switch (actionType) {
        case 'copy':
          reward = 0.15;
          break;
        case 'source_click':
          reward = 0.2;
          break;
        case 'save_entry':
          reward = 0.3;
          break;
        case 'regenerate':
          reward = -0.1; // Negative = user wasn't satisfied
          break;
      }

      if (reward !== 0 && data.selected_persona) {
        await this.rlEngine.updatePolicy(
          userId,
          context,
          { id: data.selected_persona, type: 'chat_persona' },
          reward
        );

        logger.debug(
          { userId, messageId, actionType, reward, persona: data.selected_persona },
          'RL: Recorded action reward'
        );
      }
    } catch (error) {
      logger.error({ error, userId, messageId, actionType }, 'RL: Failed to record action reward');
    }
  }

  /**
   * Build context from message and conversation
   */
  async buildContext(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<RLContext> {
    const features: Record<string, any> = {
      // Message features
      messageLength: message.length,
      hasQuestion: message.includes('?'),
      hasEmotion: this.detectEmotionKeywords(message),
      messageWordCount: message.split(/\s+/).length,

      // Temporal features
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),

      // Conversation features
      conversationLength: conversationHistory.length,
      conversationSentiment: this.analyzeConversationSentiment(conversationHistory),
    };

    // Get recent personas used (last 5 messages)
    const recentPersonas = await this.getRecentPersonas(userId, 5);
    features.recentPersonas = recentPersonas;

    // Get user activity level
    const recentActivity = await this.getRecentActivity(userId);
    features.recentActivity = recentActivity;

    return {
      type: 'chat_persona',
      features,
    };
  }

  /**
   * Build persona blend from selected action and context
   */
  private buildPersonaBlend(action: PersonaAction, context: RLContext): PersonaBlend {
    // Start with RL-selected persona as primary
    const primaryPersona = action.id;

    const blend: PersonaBlend = {
      primary: primaryPersona,
      secondary: [],
      weights: { [primaryPersona]: 0.7 },
    };

    // Context-based blending rules (can be learned via RL later)
    const features = context.features;

    // Add therapist if emotional content detected
    if (features.hasEmotion) {
      blend.secondary.push('therapist');
      blend.weights['therapist'] = 0.2;
      blend.weights[primaryPersona] = 0.5; // Reduce primary weight
    }

    // Add memory_bank if question and longer message
    if (features.hasQuestion && features.messageLength > 50) {
      blend.secondary.push('memory_bank');
      const memoryWeight = 0.1;
      blend.weights['memory_bank'] = memoryWeight;
      // Adjust other weights proportionally
      const totalOtherWeights = Object.values(blend.weights).reduce((a, b) => a + b, 0) - memoryWeight;
      if (totalOtherWeights > 0) {
        Object.keys(blend.weights).forEach(key => {
          if (key !== 'memory_bank') {
            blend.weights[key] = (blend.weights[key] / totalOtherWeights) * (1 - memoryWeight);
          }
        });
      }
    }

    // Normalize weights to sum to 1.0
    const totalWeight = Object.values(blend.weights).reduce((a, b) => a + b, 0);
    if (totalWeight > 0) {
      Object.keys(blend.weights).forEach(key => {
        blend.weights[key] = blend.weights[key] / totalWeight;
      });
    }

    return blend;
  }

  /**
   * Detect emotion keywords in message
   */
  private detectEmotionKeywords(message: string): boolean {
    const emotionKeywords = [
      'feel', 'feeling', 'emotion', 'sad', 'happy', 'angry', 'anxious', 'worried',
      'stressed', 'excited', 'nervous', 'frustrated', 'disappointed', 'proud',
      'grateful', 'lonely', 'overwhelmed', 'confused', 'hurt', 'betrayed',
    ];
    const lowerMessage = message.toLowerCase();
    return emotionKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Analyze conversation sentiment (simple heuristic)
   */
  private analyzeConversationSentiment(
    conversationHistory: Array<{ role: string; content: string }>
  ): 'positive' | 'neutral' | 'negative' {
    if (conversationHistory.length === 0) return 'neutral';

    const positiveWords = ['good', 'great', 'happy', 'excited', 'love', 'amazing', 'wonderful'];
    const negativeWords = ['bad', 'sad', 'angry', 'frustrated', 'hate', 'terrible', 'awful'];

    let positiveCount = 0;
    let negativeCount = 0;

    conversationHistory.forEach(msg => {
      const content = msg.content.toLowerCase();
      positiveWords.forEach(word => {
        if (content.includes(word)) positiveCount++;
      });
      negativeWords.forEach(word => {
        if (content.includes(word)) negativeCount++;
      });
    });

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Get recent personas used by user
   */
  private async getRecentPersonas(userId: string, limit: number): Promise<string[]> {
    try {
      const { data } = await supabaseAdmin
        .from('rl_chat_contexts')
        .select('selected_persona')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return (data || []).map(row => row.selected_persona).filter(Boolean);
    } catch (error) {
      logger.debug({ error }, 'RL: Failed to get recent personas');
      return [];
    }
  }

  /**
   * Get recent user activity level
   */
  private async getRecentActivity(userId: string): Promise<number> {
    try {
      // Count journal entries in last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { count } = await supabaseAdmin
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo.toISOString());

      // Normalize to 0-1 scale (0-10 entries = 0-1)
      return Math.min((count || 0) / 10, 1.0);
    } catch (error) {
      logger.debug({ error }, 'RL: Failed to get recent activity');
      return 0.5; // Default moderate activity
    }
  }

  /**
   * Get chat context for a message ID
   */
  private async getChatContext(userId: string, messageId: string): Promise<RLContext | null> {
    try {
      const { data } = await supabaseAdmin
        .from('rl_chat_contexts')
        .select('*')
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .single();

      if (!data) return null;

      return {
        type: 'chat_persona',
        features: data.context_features || {},
      };
    } catch (error) {
      logger.debug({ error, messageId }, 'RL: Failed to get chat context');
      return null;
    }
  }

  /**
   * Get chat session data
   */
  private async getChatSession(userId: string, sessionId: string): Promise<ChatSession | null> {
    try {
      // Get messages in session
      const { data: messages } = await supabaseAdmin
        .from('conversation_messages')
        .select('*')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!messages || messages.length === 0) return null;

      // Get context from first message
      const firstMessage = messages[0];
      const context = await this.getChatContext(userId, firstMessage.id);

      // Check for follow-up questions
      const hasFollowUpQuestions = messages.some(
        (msg, idx) => idx > 0 && msg.role === 'user' && msg.content.includes('?')
      );

      return {
        sessionId,
        messageCount: messages.length,
        hasFollowUpQuestions,
        context: context || undefined,
        selectedPersona: context?.features?.selectedPersona || undefined,
      };
    } catch (error) {
      logger.debug({ error, sessionId }, 'RL: Failed to get chat session');
      return null;
    }
  }

  /**
   * Save chat context for later reward updates
   */
  async saveChatContext(
    userId: string,
    messageId: string,
    sessionId: string,
    context: RLContext,
    selectedPersona: string
  ): Promise<void> {
    try {
      await supabaseAdmin.from('rl_chat_contexts').insert({
        user_id: userId,
        message_id: messageId,
        session_id: sessionId,
        context_features: context.features,
        selected_persona: selectedPersona,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.debug({ error, messageId }, 'RL: Failed to save chat context (non-critical)');
    }
  }
}
