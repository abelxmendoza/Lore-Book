/**
 * Thought Classification Service
 * 
 * Classifies passing thoughts quickly (<300ms) and determines appropriate response posture.
 * 
 * Thought Types:
 * - passing_thought: fleeting, low commitment
 * - insecurity: self-worth / comparison / fear
 * - belief: "I am X", "People think Y"
 * - emotion_spike: anger, shame, sadness
 * - decision_probe: "Should I..."
 * - memory_ping: recalling past event
 * - mixed: multiple types
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';

export type ThoughtType = 
  | 'passing_thought'
  | 'insecurity'
  | 'belief'
  | 'emotion_spike'
  | 'decision_probe'
  | 'memory_ping'
  | 'mixed';

export interface ThoughtClassification {
  id: string;
  user_id: string;
  entry_id?: string;
  message_id?: string;
  thought_text: string;
  thought_type: ThoughtType;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface InsecurityMatch {
  theme: string;
  domain: string;
  frequency: number;
  intensity_trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  related_themes: string[];
}

class ThoughtClassificationService {
  /**
   * Classify a thought quickly (<300ms target)
   */
  async classifyThought(
    userId: string,
    thoughtText: string,
    options?: {
      entryId?: string;
      messageId?: string;
    }
  ): Promise<ThoughtClassification> {
    const startTime = Date.now();

    try {
      // Fast pattern-based classification first
      const quickClassification = this.quickClassify(thoughtText);
      
      // If high confidence, use it; otherwise use LLM
      let classification: ThoughtClassification;
      
      if (quickClassification.confidence > 0.8) {
        classification = quickClassification;
      } else {
        // Use LLM for nuanced classification (still fast with gpt-4o-mini)
        classification = await this.llmClassify(thoughtText);
      }

      // Store classification
      const record: Omit<ThoughtClassification, 'id' | 'created_at'> = {
        user_id: userId,
        entry_id: options?.entryId,
        message_id: options?.messageId,
        thought_text: thoughtText,
        thought_type: classification.thought_type,
        confidence: classification.confidence,
        metadata: classification.metadata,
      };

      const { data, error } = await supabaseAdmin
        .from('thought_classifications')
        .insert(record)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const elapsed = Date.now() - startTime;
      logger.debug({ elapsed, thoughtType: classification.thought_type }, 'Thought classified');

      return data as ThoughtClassification;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to classify thought');
      throw error;
    }
  }

  /**
   * Quick pattern-based classification (very fast)
   */
  private quickClassify(thoughtText: string): ThoughtClassification {
    const text = thoughtText.toLowerCase();
    let type: ThoughtType = 'passing_thought';
    let confidence = 0.6;
    const metadata: Record<string, unknown> = {};

    // Insecurity patterns
    const insecurityPatterns = [
      /(feel|feeling) (behind|ahead|behind|less|more|worse|better)/gi,
      /(I|I'm|I am) (not|never) (good|enough|smart|fast|successful)/gi,
      /(everyone|others|people) (is|are) (better|ahead|smarter)/gi,
      /(I|I'm) (behind|late|slow|failing)/gi,
      /(compare|comparison|compared to)/gi,
    ];

    if (insecurityPatterns.some(p => p.test(text))) {
      type = 'insecurity';
      confidence = 0.85;
      metadata.pattern = 'insecurity_detected';
    }

    // Belief patterns
    const beliefPatterns = [
      /(I|I'm|I am) (a|an) [a-z]+/gi,
      /(people|they|everyone) (think|believe|see) (I|me|I'm)/gi,
      /(I|I'm) (always|never|usually) [a-z]+/gi,
    ];

    if (beliefPatterns.some(p => p.test(text)) && type === 'passing_thought') {
      type = 'belief';
      confidence = 0.75;
      metadata.pattern = 'belief_detected';
    }

    // Emotion spike patterns
    const emotionPatterns = [
      /(I|I'm) (angry|furious|livid|enraged)/gi,
      /(I|I'm) (ashamed|embarrassed|humiliated)/gi,
      /(I|I'm) (devastated|crushed|destroyed)/gi,
      /(I|I'm) (so|really|extremely) (sad|angry|upset)/gi,
    ];

    if (emotionPatterns.some(p => p.test(text))) {
      type = 'emotion_spike';
      confidence = 0.9;
      metadata.pattern = 'emotion_spike_detected';
    }

    // Decision probe patterns
    const decisionPatterns = [
      /(should|ought|must) I/gi,
      /(what|how) (should|do) I/gi,
      /(I|I'm) (wondering|thinking) (if|whether|about)/gi,
    ];

    if (decisionPatterns.some(p => p.test(text)) && type === 'passing_thought') {
      type = 'decision_probe';
      confidence = 0.8;
      metadata.pattern = 'decision_probe_detected';
    }

    // Memory ping patterns
    const memoryPatterns = [
      /(remember|recall|reminds me|reminds me of)/gi,
      /(back when|when I was|used to)/gi,
      /(that time|that day|that moment)/gi,
    ];

    if (memoryPatterns.some(p => p.test(text)) && type === 'passing_thought') {
      type = 'memory_ping';
      confidence = 0.75;
      metadata.pattern = 'memory_ping_detected';
    }

    return {
      id: crypto.randomUUID(),
      user_id: '',
      thought_text: thoughtText,
      thought_type: type,
      confidence,
      metadata,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * LLM-based classification (more nuanced, still fast)
   */
  private async llmClassify(thoughtText: string): Promise<ThoughtClassification> {
    const prompt = `Classify this thought quickly:

"${thoughtText}"

Types:
- passing_thought: fleeting, low commitment
- insecurity: self-worth / comparison / fear
- belief: "I am X", "People think Y"
- emotion_spike: anger, shame, sadness
- decision_probe: "Should I..."
- memory_ping: recalling past event
- mixed: multiple types

Respond with JSON:
{
  "type": "thought_type",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 150,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      return {
        id: crypto.randomUUID(),
        user_id: '',
        thought_text: thoughtText,
        thought_type: (result.type || 'passing_thought') as ThoughtType,
        confidence: result.confidence || 0.7,
        metadata: { reasoning: result.reasoning, method: 'llm' },
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn({ err: error }, 'LLM classification failed, using pattern matching');
      return this.quickClassify(thoughtText);
    }
  }

  /**
   * Get classification for a thought
   */
  async getClassification(
    userId: string,
    thoughtId: string
  ): Promise<ThoughtClassification | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('thought_classifications')
        .select('*')
        .eq('id', thoughtId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data as ThoughtClassification;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get classification');
      return null;
    }
  }
}

export const thoughtClassificationService = new ThoughtClassificationService();
