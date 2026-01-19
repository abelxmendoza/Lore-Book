import { logger } from '../../logger';
import { openai } from '../openaiClient';

export interface EmotionalState {
  dominantEmotion: string;
  intensity: number; // 0-1
  trend: 'rising' | 'falling' | 'stable';
  emotionalVector: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    excitement: number;
    uncertainty: number;
    pride: number;
    confidence: number;
    doubt: number;
  };
  transitionFrom?: EmotionalState;
  transitionReason?: string;
}

export interface TopicShift {
  detected: boolean;
  oldTopic: string;
  newTopic: string;
  shiftPercentage: number; // 0-1, how different the topics are
  similarity: number; // 0-1, semantic similarity
}

export interface EmotionalTransition {
  detected: boolean;
  from: string;
  to: string;
  intensityChange: number; // positive = more intense, negative = less intense
  direction: 'positive' | 'negative' | 'neutral';
}

export interface ThoughtProcessChange {
  detected: boolean;
  from: string; // e.g., "self-doubt" → "project uncertainty"
  to: string;
  trigger: string; // What caused the change
  type: 'logical' | 'emotional' | 'associative' | 'tangent';
}

export interface IntentEvolution {
  detected: boolean;
  from: string; // e.g., "VENTING" → "REFLECTION"
  to: string;
  evolutionType: 'deepening' | 'shifting' | 'expanding';
}

export interface TransitionAnalysis {
  topicShift: TopicShift;
  emotionalTransition: EmotionalTransition;
  thoughtProcessChange: ThoughtProcessChange;
  intentEvolution: IntentEvolution;
  transitionType: 'TANGENT' | 'EMOTIONAL_SHIFT' | 'THOUGHT_EVOLUTION' | 'NATURAL_FLOW' | 'INTENT_EVOLUTION';
  shouldAcknowledge: boolean;
  confidence: number; // 0-1, how confident we are in the transition detection
  suggestedPersonaBlend?: {
    primary: string;
    secondary: string[];
    weights: Record<string, number>;
  };
}

export interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  previousEmotionalState?: EmotionalState;
  previousIntent?: string;
  previousTopic?: string;
}

/**
 * Detects tangents, emotional transitions, and thought process changes in conversations
 * Inspired by Grok's ability to naturally follow conversational flow
 */
export class TangentTransitionDetector {
  /**
   * Main detection method - analyzes current message against conversation history
   */
  async detectTransitions(
    currentMessage: string,
    context: ConversationContext
  ): Promise<TransitionAnalysis> {
    try {
      // 1. Detect topic shift
      const topicShift = await this.detectTopicShift(currentMessage, context);

      // 2. Detect emotional transition
      const emotionalTransition = await this.detectEmotionalTransition(
        currentMessage,
        context.previousEmotionalState
      );

      // 3. Detect thought process change
      const thoughtProcessChange = await this.detectThoughtProcessChange(
        currentMessage,
        context
      );

      // 4. Detect intent evolution
      const intentEvolution = await this.detectIntentEvolution(
        currentMessage,
        context
      );

      // 5. Classify transition type
      const transitionType = this.classifyTransitionType(
        topicShift,
        emotionalTransition,
        thoughtProcessChange,
        intentEvolution
      );

      // 6. Determine if we should acknowledge
      const shouldAcknowledge = this.shouldAcknowledgeTransition(
        topicShift,
        emotionalTransition,
        thoughtProcessChange,
        intentEvolution
      );

      // 7. Calculate overall confidence
      const confidence = this.calculateConfidence(
        topicShift,
        emotionalTransition,
        thoughtProcessChange,
        intentEvolution
      );

      // 8. Suggest persona blend based on transition
      const suggestedPersonaBlend = this.suggestPersonaBlend(
        transitionType,
        emotionalTransition,
        intentEvolution
      );

      return {
        topicShift,
        emotionalTransition,
        thoughtProcessChange,
        intentEvolution,
        transitionType,
        shouldAcknowledge,
        confidence,
        suggestedPersonaBlend,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to detect transitions');
      // Return neutral analysis on error
      return this.getNeutralAnalysis();
    }
  }

  /**
   * Detect topic shift using semantic similarity
   */
  private async detectTopicShift(
    currentMessage: string,
    context: ConversationContext
  ): Promise<TopicShift> {
    if (!context.previousTopic || context.messages.length < 2) {
      return {
        detected: false,
        oldTopic: '',
        newTopic: this.extractTopic(currentMessage),
        shiftPercentage: 0,
        similarity: 1,
      };
    }

    try {
      // Use LLM to detect topic shift
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are analyzing conversation topics. Identify if there's been a topic shift and how significant it is.
Return JSON with: oldTopic, newTopic, shiftPercentage (0-1, where 1 = completely different), similarity (0-1, where 1 = very similar).`,
          },
          {
            role: 'user',
            content: `Previous topic: "${context.previousTopic}"
Previous message: "${context.messages[context.messages.length - 2]?.content || ''}"
Current message: "${currentMessage}"

Analyze the topic shift.`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      return {
        detected: (analysis.shiftPercentage || 0) > 0.3,
        oldTopic: analysis.oldTopic || context.previousTopic,
        newTopic: analysis.newTopic || this.extractTopic(currentMessage),
        shiftPercentage: analysis.shiftPercentage || 0,
        similarity: analysis.similarity || 0.5,
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to detect topic shift with LLM, using fallback');
      // Fallback: simple keyword-based detection
      return {
        detected: true,
        oldTopic: context.previousTopic,
        newTopic: this.extractTopic(currentMessage),
        shiftPercentage: 0.5,
        similarity: 0.5,
      };
    }
  }

  /**
   * Detect emotional transition
   */
  private async detectEmotionalTransition(
    currentMessage: string,
    previousState?: EmotionalState
  ): Promise<EmotionalTransition> {
    if (!previousState) {
      return {
        detected: false,
        from: 'unknown',
        to: await this.extractDominantEmotion(currentMessage),
        intensityChange: 0,
        direction: 'neutral',
      };
    }

    try {
      const currentEmotion = await this.extractEmotionalState(currentMessage);
      const previousEmotion = previousState.dominantEmotion;
      const currentIntensity = currentEmotion.intensity;
      const previousIntensity = previousState.intensity;

      const intensityChange = currentIntensity - previousIntensity;
      const direction = this.getEmotionalDirection(previousEmotion, currentEmotion.dominantEmotion);

      return {
        detected: previousEmotion !== currentEmotion.dominantEmotion || Math.abs(intensityChange) > 0.2,
        from: previousEmotion,
        to: currentEmotion.dominantEmotion,
        intensityChange,
        direction,
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to detect emotional transition');
      return {
        detected: false,
        from: previousState?.dominantEmotion || 'unknown',
        to: 'unknown',
        intensityChange: 0,
        direction: 'neutral',
      };
    }
  }

  /**
   * Detect thought process change
   */
  private async detectThoughtProcessChange(
    currentMessage: string,
    context: ConversationContext
  ): Promise<ThoughtProcessChange> {
    if (context.messages.length < 2) {
      return {
        detected: false,
        from: '',
        to: '',
        trigger: '',
        type: 'logical',
      };
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Analyze how the user's thinking has evolved. Identify:
1. What they were thinking about before (from)
2. What they're thinking about now (to)
3. What triggered the change (trigger)
4. Type of change: logical, emotional, associative, or tangent

Return JSON with: from, to, trigger, type.`,
          },
          {
            role: 'user',
            content: `Previous messages: ${context.messages.slice(-3).map(m => m.content).join('\n')}
Current message: "${currentMessage}"

Analyze the thought process change.`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      return {
        detected: !!(analysis.from && analysis.to),
        from: analysis.from || '',
        to: analysis.to || '',
        trigger: analysis.trigger || '',
        type: (analysis.type || 'logical') as 'logical' | 'emotional' | 'associative' | 'tangent',
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to detect thought process change');
      return {
        detected: false,
        from: '',
        to: '',
        trigger: '',
        type: 'logical',
      };
    }
  }

  /**
   * Detect intent evolution
   */
  private async detectIntentEvolution(
    currentMessage: string,
    context: ConversationContext
  ): Promise<IntentEvolution> {
    if (!context.previousIntent) {
      return {
        detected: false,
        from: '',
        to: '',
        evolutionType: 'shifting',
      };
    }

    try {
      // Simple keyword-based intent detection
      const currentIntent = this.detectIntent(currentMessage);
      
      if (currentIntent !== context.previousIntent) {
        return {
          detected: true,
          from: context.previousIntent,
          to: currentIntent,
          evolutionType: this.getEvolutionType(context.previousIntent, currentIntent),
        };
      }

      return {
        detected: false,
        from: context.previousIntent,
        to: currentIntent,
        evolutionType: 'shifting',
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to detect intent evolution');
      return {
        detected: false,
        from: context.previousIntent || '',
        to: '',
        evolutionType: 'shifting',
      };
    }
  }

  /**
   * Classify the overall transition type
   */
  private classifyTransitionType(
    topicShift: TopicShift,
    emotionalTransition: EmotionalTransition,
    thoughtProcessChange: ThoughtProcessChange,
    intentEvolution: IntentEvolution
  ): TransitionAnalysis['transitionType'] {
    // Priority order: intent evolution > thought process > emotional > topic shift
    if (intentEvolution.detected) {
      return 'INTENT_EVOLUTION';
    }
    if (thoughtProcessChange.detected && thoughtProcessChange.type === 'tangent') {
      return 'TANGENT';
    }
    if (thoughtProcessChange.detected) {
      return 'THOUGHT_EVOLUTION';
    }
    if (emotionalTransition.detected && Math.abs(emotionalTransition.intensityChange) > 0.3) {
      return 'EMOTIONAL_SHIFT';
    }
    if (topicShift.detected && topicShift.shiftPercentage > 0.5) {
      return 'TANGENT';
    }
    return 'NATURAL_FLOW';
  }

  /**
   * Determine if we should acknowledge the transition
   */
  private shouldAcknowledgeTransition(
    topicShift: TopicShift,
    emotionalTransition: EmotionalTransition,
    thoughtProcessChange: ThoughtProcessChange,
    intentEvolution: IntentEvolution
  ): boolean {
    // Acknowledge if:
    // - Significant topic shift (>50%)
    // - Strong emotional transition (>0.3 intensity change)
    // - Clear thought process change
    // - Intent evolution
    return (
      (topicShift.detected && topicShift.shiftPercentage > 0.5) ||
      (emotionalTransition.detected && Math.abs(emotionalTransition.intensityChange) > 0.3) ||
      (thoughtProcessChange.detected && thoughtProcessChange.type === 'tangent') ||
      intentEvolution.detected
    );
  }

  /**
   * Calculate overall confidence in transition detection
   */
  private calculateConfidence(
    topicShift: TopicShift,
    emotionalTransition: EmotionalTransition,
    thoughtProcessChange: ThoughtProcessChange,
    intentEvolution: IntentEvolution
  ): number {
    const signals = [
      topicShift.detected ? topicShift.shiftPercentage : 0,
      emotionalTransition.detected ? Math.abs(emotionalTransition.intensityChange) : 0,
      thoughtProcessChange.detected ? 0.7 : 0,
      intentEvolution.detected ? 0.8 : 0,
    ];

    // Average of detected signals
    const detectedSignals = signals.filter(s => s > 0);
    return detectedSignals.length > 0
      ? detectedSignals.reduce((a, b) => a + b, 0) / detectedSignals.length
      : 0;
  }

  /**
   * Suggest persona blend based on transition
   */
  private suggestPersonaBlend(
    transitionType: TransitionAnalysis['transitionType'],
    emotionalTransition: EmotionalTransition,
    intentEvolution: IntentEvolution
  ): TransitionAnalysis['suggestedPersonaBlend'] {
    switch (transitionType) {
      case 'EMOTIONAL_SHIFT':
        return {
          primary: 'therapist',
          secondary: ['strategist'],
          weights: { therapist: 0.7, strategist: 0.3 },
        };
      case 'TANGENT':
        return {
          primary: 'gossip_buddy',
          secondary: ['strategist'],
          weights: { gossip_buddy: 0.6, strategist: 0.4 },
        };
      case 'THOUGHT_EVOLUTION':
        return {
          primary: 'soul_capturer',
          secondary: ['therapist'],
          weights: { soul_capturer: 0.7, therapist: 0.3 },
        };
      case 'INTENT_EVOLUTION':
        if (intentEvolution.to === 'REFLECTION') {
          return {
            primary: 'therapist',
            secondary: ['soul_capturer'],
            weights: { therapist: 0.6, soul_capturer: 0.4 },
          };
        }
        if (intentEvolution.to === 'STRATEGIC_THINKING') {
          return {
            primary: 'strategist',
            secondary: ['therapist'],
            weights: { strategist: 0.7, therapist: 0.3 },
          };
        }
        break;
    }
    return undefined;
  }

  /**
   * Extract emotional state from message (public for use in chat service)
   */
  async extractEmotionalState(message: string): Promise<EmotionalState> {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Analyze the emotional state in this message. Return JSON with:
- dominantEmotion (one word: joy, sadness, anger, fear, excitement, uncertainty, pride, confidence, doubt, etc.)
- intensity (0-1)
- trend (rising, falling, stable)
- emotionalVector (object with joy, sadness, anger, fear, excitement, uncertainty, pride, confidence, doubt as 0-1 values)`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      return {
        dominantEmotion: analysis.dominantEmotion || 'neutral',
        intensity: analysis.intensity || 0.5,
        trend: analysis.trend || 'stable',
        emotionalVector: {
          joy: analysis.emotionalVector?.joy || 0,
          sadness: analysis.emotionalVector?.sadness || 0,
          anger: analysis.emotionalVector?.anger || 0,
          fear: analysis.emotionalVector?.fear || 0,
          excitement: analysis.emotionalVector?.excitement || 0,
          uncertainty: analysis.emotionalVector?.uncertainty || 0,
          pride: analysis.emotionalVector?.pride || 0,
          confidence: analysis.emotionalVector?.confidence || 0,
          doubt: analysis.emotionalVector?.doubt || 0,
        },
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to extract emotional state');
      return {
        dominantEmotion: 'neutral',
        intensity: 0.5,
        trend: 'stable',
        emotionalVector: {
          joy: 0,
          sadness: 0,
          anger: 0,
          fear: 0,
          excitement: 0,
          uncertainty: 0,
          pride: 0,
          confidence: 0,
          doubt: 0,
        },
      };
    }
  }

  /**
   * Extract dominant emotion (simplified)
   */
  private async extractDominantEmotion(message: string): Promise<string> {
    const state = await this.extractEmotionalState(message);
    return state.dominantEmotion;
  }

  /**
   * Extract topic from message (simplified)
   */
  private extractTopic(message: string): string {
    // Simple keyword extraction - could be enhanced with LLM
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('lore book') || lowerMessage.includes('lorebook')) return 'Lore Book project';
    if (lowerMessage.includes('work') || lowerMessage.includes('job')) return 'Work/Career';
    if (lowerMessage.includes('relationship') || lowerMessage.includes('friend')) return 'Relationships';
    if (lowerMessage.includes('feel') || lowerMessage.includes('emotion')) return 'Emotions/Feelings';
    if (lowerMessage.includes('build') || lowerMessage.includes('create')) return 'Building/Creating';
    return 'General';
  }

  /**
   * Get emotional direction
   */
  private getEmotionalDirection(from: string, to: string): 'positive' | 'negative' | 'neutral' {
    const positiveEmotions = ['joy', 'excitement', 'pride', 'confidence'];
    const negativeEmotions = ['sadness', 'anger', 'fear', 'uncertainty', 'doubt'];
    
    const fromPositive = positiveEmotions.includes(from);
    const toPositive = positiveEmotions.includes(to);
    const fromNegative = negativeEmotions.includes(from);
    const toNegative = negativeEmotions.includes(to);

    if (fromNegative && toPositive) return 'positive';
    if (fromPositive && toNegative) return 'negative';
    return 'neutral';
  }

  /**
   * Detect intent from message
   */
  private detectIntent(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('why do i') || lowerMessage.includes('i wonder') || lowerMessage.includes('reflecting')) {
      return 'REFLECTION';
    }
    if (lowerMessage.includes('should i') || lowerMessage.includes('what should') || lowerMessage.includes('decision')) {
      return 'DECISION_SUPPORT';
    }
    if (lowerMessage.includes('what') || lowerMessage.includes('when') || lowerMessage.includes('who')) {
      return 'QUESTION';
    }
    if (lowerMessage.includes('feel') && (lowerMessage.includes('bad') || lowerMessage.includes('sad') || lowerMessage.includes('angry'))) {
      return 'VENTING';
    }
    
    return 'GENERAL';
  }

  /**
   * Get evolution type
   */
  private getEvolutionType(from: string, to: string): 'deepening' | 'shifting' | 'expanding' {
    // If moving from venting to reflection, it's deepening
    if (from === 'VENTING' && to === 'REFLECTION') return 'deepening';
    // If moving to decision support, it's expanding
    if (to === 'DECISION_SUPPORT') return 'expanding';
    // Otherwise it's shifting
    return 'shifting';
  }

  /**
   * Get neutral analysis (fallback)
   */
  private getNeutralAnalysis(): TransitionAnalysis {
    return {
      topicShift: {
        detected: false,
        oldTopic: '',
        newTopic: '',
        shiftPercentage: 0,
        similarity: 1,
      },
      emotionalTransition: {
        detected: false,
        from: '',
        to: '',
        intensityChange: 0,
        direction: 'neutral',
      },
      thoughtProcessChange: {
        detected: false,
        from: '',
        to: '',
        trigger: '',
        type: 'logical',
      },
      intentEvolution: {
        detected: false,
        from: '',
        to: '',
        evolutionType: 'shifting',
      },
      transitionType: 'NATURAL_FLOW',
      shouldAcknowledge: false,
      confidence: 0,
    };
  }
}

export const tangentTransitionDetector = new TangentTransitionDetector();
