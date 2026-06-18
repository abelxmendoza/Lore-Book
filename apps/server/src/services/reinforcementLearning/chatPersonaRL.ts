import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { ALL_PERSONA_IDS } from '../personas/personaRegistry';

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

  // Canonical ids from personaRegistry — must stay in sync with systemPromptBuilder.
  private readonly PERSONAS = [...ALL_PERSONA_IDS];

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
   * Build context from message and conversation.
   *
   * Instead of a flat bag of boolean flags, we compute a directional signal
   * score for each persona (0–1). The RL engine can learn which signals
   * matter most for *this user* rather than treating every keyword match
   * as equally meaningful.
   */
  async buildContext(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<RLContext> {
    const lower = message.toLowerCase();
    const words = lower.split(/\s+/);
    const wordCount = words.length;
    const hour = new Date().getHours();
    const dow = new Date().getDay(); // 0=Sun … 6=Sat

    // ── Therapist signal ──────────────────────────────────────────────────────
    // Present-moment distress, venting, first-person emotional language.
    // Negation guard: "don't feel" / "not sad" should not spike this.
    const EMOTION_WORDS = [
      'sad', 'upset', 'hurt', 'angry', 'anxious', 'stressed', 'worried', 'scared',
      'overwhelmed', 'lonely', 'frustrated', 'disappointed', 'heartbroken', 'depressed',
      'miserable', 'crying', 'cry', 'exhausted', 'burnt out', 'lost', 'broken',
      'confused', 'hopeless', 'numb', 'guilty', 'ashamed', 'embarrassed',
    ];
    const NEGATIONS = /\b(don't|doesn't|not|never|no longer|didn't)\s+(feel|seem|look|sound|appear)/;
    const hasNegation = NEGATIONS.test(lower);
    const emotionHits = EMOTION_WORDS.filter(w => lower.includes(w)).length;
    const therapistSignal = hasNegation
      ? Math.max(0, emotionHits - 1) / 5          // dampen negated emotion
      : Math.min(emotionHits / 3, 1.0);            // cap at 1.0

    // Late night amplifier: emotional topics hit harder at night
    const isLateNight = hour >= 21 || hour <= 4;
    const therapistScore = Math.min(therapistSignal * (isLateNight ? 1.3 : 1.0), 1.0);

    // ── Strategist signal ─────────────────────────────────────────────────────
    // Future-oriented, goal / planning / decision language.
    const STRATEGY_WORDS = [
      'should i', 'what if', 'plan', 'goal', 'decide', 'decision', 'next step',
      'how do i', 'how should', 'want to', 'trying to', 'need to', 'advice',
      'strategy', 'improve', 'change', 'achieve', 'move forward', 'next week',
      'next month', 'career', 'job', 'opportunity', 'focus on',
    ];
    const strategyHits = STRATEGY_WORDS.filter(w => lower.includes(w)).length;
    // Weekday mornings (Mon–Fri, 7–10am) are planning contexts
    const isWeekdayMorning = dow >= 1 && dow <= 5 && hour >= 7 && hour <= 10;
    const strategistScore = Math.min((strategyHits / 3) * (isWeekdayMorning ? 1.4 : 1.0), 1.0);

    // ── Archivist signal ──────────────────────────────────────────────────────
    // Looking something up, factual recall, "when did / what did / do you remember".
    const RECALL_PATTERNS = [
      /when did i/, /what did i/, /do you remember/, /last time i/, /have i ever/,
      /what happened (when|with|to|in|at|on)/, /how long (ago|have|has)/,
      /can you (find|look up|check|tell me about)/, /search (for|my|through)/,
      /\b(history|record|log|entry|entries|wrote|mentioned|said)\b/,
    ];
    const archivistHits = RECALL_PATTERNS.filter(r => r.test(lower)).length;
    const archivistScore = Math.min(archivistHits / 2, 1.0);

    // ── Gossip Buddy signal ───────────────────────────────────────────────────
    // Third-person pronouns, named references, relationship dynamics.
    const thirdPersonCount = (lower.match(/\b(he|she|they|him|her|them|his|hers|their)\b/g) || []).length;
    const RELATIONSHIP_WORDS = [
      'friend', 'boyfriend', 'girlfriend', 'partner', 'ex', 'crush', 'coworker',
      'boss', 'mom', 'dad', 'sister', 'brother', 'family', 'relationship',
      'said to me', 'told me', 'texted', 'drama', 'fight', 'argument',
    ];
    const relationshipHits = RELATIONSHIP_WORDS.filter(w => lower.includes(w)).length;
    const gossipScore = Math.min((thirdPersonCount / 4 + relationshipHits / 3) / 2, 1.0);

    // ── Biography Writer signal ───────────────────────────────────────────────
    // Storytelling: long message, past-tense verbs, narrative markers.
    const PAST_TENSE = /\b(was|were|had|went|came|did|said|told|felt|thought|knew|saw|heard|realized|started|ended|left|moved|changed)\b/g;
    const pastVerbCount = (lower.match(PAST_TENSE) || []).length;
    const NARRATIVE_WORDS = ['story', 'chapter', 'period', 'phase', 'era', 'looking back', 'back then', 'those days', 'at the time'];
    const narrativeHits = NARRATIVE_WORDS.filter(w => lower.includes(w)).length;
    const isLongMessage = wordCount > 80; // long = telling a story
    const biographyScore = Math.min(
      (pastVerbCount / 8 + narrativeHits / 2 + (isLongMessage ? 0.3 : 0)) / 2,
      1.0
    );

    // ── Soul Capturer signal ──────────────────────────────────────────────────
    // Identity-level questions: who am I, patterns, values, recurring themes.
    // Distinct from Therapist: this is longitudinal self-reflection, not present-moment distress.
    const IDENTITY_WORDS = [
      'who am i', 'what kind of person', 'my values', 'my purpose', 'my identity',
      'always do this', 'always end up', 'keep doing', 'pattern', 'why do i always',
      'my nature', 'deep down', 'at my core', 'consistently', 'over and over',
      'defines me', 'what i believe', 'my character', 'true self',
    ];
    const identityHits = IDENTITY_WORDS.filter(w => lower.includes(w)).length;
    // Long conversation depth (8+ turns) signals someone going deep
    const isDeepConversation = conversationHistory.length >= 8;
    const soulScore = Math.min(identityHits / 2 + (isDeepConversation ? 0.2 : 0), 1.0);

    // ── Temporal & depth context ──────────────────────────────────────────────
    const conversationDepth = Math.min(conversationHistory.length / 10, 1.0); // 0–1

    const recentPersonas = await this.getRecentPersonas(userId, 5);
    const recentActivity = await this.getRecentActivity(userId);

    return {
      type: 'chat_persona',
      features: {
        // Directional per-persona scores (0–1) — primary learning signal for RL
        therapistScore,
        strategistScore,
        archivistScore,
        gossipScore,
        biographyScore,
        soulScore,

        // Retained raw features for backward-compat with stored contexts
        messageLength:        message.length,
        messageWordCount:     wordCount,
        hasQuestion:          message.includes('?'),
        isLateNight,
        isWeekdayMorning,
        isLongMessage,
        isDeepConversation,
        conversationDepth,
        timeOfDay:            hour,
        dayOfWeek:            dow,
        recentPersonas,
        recentActivity,
      },
    };
  }

  /**
   * Build persona blend from selected action and context.
   *
   * Rules:
   * - Max 2 personas total (1 primary + 1 complementary secondary).
   * - Secondary is chosen by which compatible partner has the strongest signal.
   * - Conflicting pairs (Therapist + Strategist) are never blended.
   * - If primary already has the strongest signal, no secondary is added.
   */
  private buildPersonaBlend(action: PersonaAction, context: RLContext): PersonaBlend {
    const primary = action.id;
    const f = context.features;

    const blend: PersonaBlend = {
      primary,
      secondary: [],
      weights: { [primary]: 1.0 },
    };

    // Compatible secondary candidates per primary persona.
    // Key insight: pairs that share a direction (both past-facing, both
    // people-focused) work. Pairs that pull in opposite directions (validate
    // vs advise) actively hurt response quality.
    const COMPATIBLE: Record<string, { partner: string; signalKey: string; threshold: number }[]> = {
      therapist:        [{ partner: 'archivist',        signalKey: 'archivistScore', threshold: 0.4 },
                         { partner: 'soul_capturer',    signalKey: 'soulScore',      threshold: 0.5 }],
      strategist:       [{ partner: 'soul_capturer',    signalKey: 'soulScore',      threshold: 0.4 },
                         { partner: 'archivist',        signalKey: 'archivistScore', threshold: 0.5 }],
      gossip_buddy:     [{ partner: 'archivist',        signalKey: 'archivistScore', threshold: 0.4 },
                         { partner: 'therapist',        signalKey: 'therapistScore', threshold: 0.6 }],
      archivist:        [{ partner: 'gossip_buddy',     signalKey: 'gossipScore',    threshold: 0.4 },
                         { partner: 'biography_writer', signalKey: 'biographyScore', threshold: 0.4 }],
      biography_writer: [{ partner: 'therapist',        signalKey: 'therapistScore', threshold: 0.4 },
                         { partner: 'soul_capturer',    signalKey: 'soulScore',      threshold: 0.4 }],
      soul_capturer:    [{ partner: 'therapist',        signalKey: 'therapistScore', threshold: 0.4 },
                         { partner: 'biography_writer', signalKey: 'biographyScore', threshold: 0.4 }],
    };

    const candidates = COMPATIBLE[primary] || [];
    // Pick the first candidate whose signal clears the threshold
    const chosen = candidates.find(c => (f[c.signalKey] || 0) >= c.threshold);

    if (chosen) {
      blend.secondary = [chosen.partner];
      blend.weights[primary]         = 0.70;
      blend.weights[chosen.partner]  = 0.30;
    }

    return blend;
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
   * Get chat context for a message ID.
   * Returns both the RLContext (for policy updates) and the stored selectedPersona.
   */
  private async getChatContext(
    userId: string,
    messageId: string
  ): Promise<(RLContext & { selectedPersona: string }) | null> {
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
        selectedPersona: data.selected_persona || 'therapist',
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
        selectedPersona: context?.selectedPersona || undefined,
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
