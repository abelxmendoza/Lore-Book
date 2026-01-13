import OpenAI from 'openai';
import { logger } from '../../logger';
import { config } from '../../config';
import { WillStorage } from './willStorage';
import { memoryService } from '../memoryService';
import type { WillEvent, WillProcessingContext } from './types';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * Will Engine
 * Detects moments where action != impulse (agency/will)
 */
export class WillEngine {
  private storage: WillStorage;

  constructor() {
    this.storage = new WillStorage();
  }

  /**
   * Process entry to detect will events
   */
  async process(
    entry: { id: string; content: string; date: string; user_id: string },
    context: WillProcessingContext
  ): Promise<WillEvent[]> {
    try {
      logger.debug({ userId: entry.user_id, entryId: entry.id }, 'Processing will events');

      // Infer impulse (what emotion/habit/identity would suggest)
      const impulse = await this.inferImpulse({
        entry_text: entry.content,
        emotions: context.emotion_events || [],
        identity: context.identity_statements || [],
        past_patterns: context.past_patterns || [],
      });

      // Infer action (what actually happened)
      const action = await this.inferAction({
        entry_text: entry.content,
        follow_up_entries: context.follow_up_entries || [],
      });

      // Check if action != impulse (this is will)
      const similarity = await this.computeSimilarity(impulse, action);
      const confidence = this.computeConfidence(entry.content, impulse, action, similarity);

      if (similarity < 0.6 && confidence > 0.6) {
        // This is a will event - action differs from impulse
        const willEvent = await this.createWillEvent(entry, context, impulse, action, confidence);
        const saved = await this.storage.saveWillEvent(entry.user_id, willEvent);
        
        logger.info(
          { userId: entry.user_id, entryId: entry.id, willEventId: saved.id },
          'Created will event'
        );
        
        return [saved];
      }

      return [];
    } catch (error) {
      logger.error({ error, userId: entry.user_id, entryId: entry.id }, 'Failed to process will event');
      return [];
    }
  }

  /**
   * Infer what the impulse would be (automatic response)
   */
  private async inferImpulse(context: {
    entry_text: string;
    emotions: Array<{ emotion: string; intensity: number; polarity: string }>;
    identity: Array<{ claim: string; confidence: number }>;
    past_patterns: Array<{ pattern: string; frequency: number }>;
  }): Promise<string> {
    try {
      const emotionSummary = context.emotions
        .map(e => `${e.emotion} (${e.polarity}, intensity: ${e.intensity.toFixed(2)})`)
        .join(', ');

      const identitySummary = context.identity
        .slice(0, 3)
        .map(i => i.claim)
        .join('; ');

      const patternSummary = context.past_patterns
        .slice(0, 3)
        .map(p => p.pattern)
        .join('; ');

      const prompt = `Given the following context, infer what the automatic/impulsive response would be.

Entry text: ${context.entry_text.substring(0, 1000)}

Emotions present: ${emotionSummary || 'none detected'}
Identity claims: ${identitySummary || 'none'}
Past behavioral patterns: ${patternSummary || 'none'}

Based on emotions, identity, and past patterns, what would be the automatic or habitual response?
Return ONLY a short phrase describing the impulse (e.g., "avoid the situation", "react defensively", "give up", "seek comfort").
Do not include explanations, just the impulse.`;

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at inferring automatic behavioral impulses from context. Return only the impulse phrase, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
      });

      const impulse = completion.choices[0]?.message?.content?.trim() || 'unknown';
      return impulse;
    } catch (error) {
      logger.error({ error }, 'Failed to infer impulse');
      return 'unknown';
    }
  }

  /**
   * Infer what action actually happened
   */
  private async inferAction(context: {
    entry_text: string;
    follow_up_entries: Array<{ content: string; date: string }>;
  }): Promise<string> {
    try {
      const followUpText = context.follow_up_entries
        .slice(0, 2)
        .map(e => `[${e.date}] ${e.content}`)
        .join('\n');

      const prompt = `Extract the actual action or behavior that occurred from this entry.

Entry: ${context.entry_text.substring(0, 1000)}
${followUpText ? `\n\nFollow-up context:\n${followUpText.substring(0, 500)}` : ''}

What action did the person actually take? Look for:
- Action verbs (did, chose, decided, acted, continued, stopped, etc.)
- Outcomes mentioned
- Behavioral descriptions

Return ONLY a short phrase describing the actual action (e.g., "continued working", "walked away", "spoke up", "took responsibility").
Do not include explanations, just the action.`;

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at extracting actual behaviors from text. Return only the action phrase, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
      });

      const action = completion.choices[0]?.message?.content?.trim() || 'unknown';
      return action;
    } catch (error) {
      logger.error({ error }, 'Failed to infer action');
      return 'unknown';
    }
  }

  /**
   * Compute similarity between impulse and action
   */
  private async computeSimilarity(impulse: string, action: string): Promise<number> {
    try {
      // Simple semantic similarity using embeddings
      const { embeddingService } = await import('../embeddingService');
      
      const [impulseEmbedding, actionEmbedding] = await Promise.all([
        embeddingService.embedText(impulse),
        embeddingService.embedText(action),
      ]);

      // Cosine similarity
      const dotProduct = impulseEmbedding.reduce((sum, val, i) => sum + val * actionEmbedding[i], 0);
      const magnitude1 = Math.sqrt(impulseEmbedding.reduce((sum, val) => sum + val * val, 0));
      const magnitude2 = Math.sqrt(actionEmbedding.reduce((sum, val) => sum + val * val, 0));
      
      const similarity = dotProduct / (magnitude1 * magnitude2);
      return Math.max(0, Math.min(1, similarity)); // Clamp to [0, 1]
    } catch (error) {
      logger.error({ error }, 'Failed to compute similarity, using fallback');
      // Fallback: simple word overlap
      const impulseWords = new Set(impulse.toLowerCase().split(/\s+/));
      const actionWords = new Set(action.toLowerCase().split(/\s+/));
      const overlap = [...impulseWords].filter(w => actionWords.has(w)).length;
      const total = Math.max(impulseWords.size, actionWords.size);
      return overlap / total;
    }
  }

  /**
   * Compute confidence that this is a will event
   */
  private computeConfidence(
    entryText: string,
    impulse: string,
    action: string,
    similarity: number
  ): number {
    // Higher confidence if:
    // - Lower similarity (more different)
    // - Entry mentions difficulty, struggle, choice
    // - Entry mentions overcoming something

    let confidence = 1 - similarity; // Base confidence from dissimilarity

    const difficultyIndicators = [
      'difficult',
      'hard',
      'struggle',
      'chose',
      'decided',
      'overcame',
      'despite',
      'even though',
      'instead of',
      'rather than',
    ];

    const lowerText = entryText.toLowerCase();
    const indicatorCount = difficultyIndicators.filter(ind => lowerText.includes(ind)).length;
    confidence += Math.min(0.3, indicatorCount * 0.1); // Boost confidence

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Create will event from detected will moment
   */
  private async createWillEvent(
    entry: { id: string; content: string; date: string; user_id: string },
    context: WillProcessingContext,
    impulse: string,
    action: string,
    confidence: number
  ): Promise<Omit<WillEvent, 'id' | 'created_at'>> {
    const situation = await this.extractSituation(entry.content);
    const cost = await this.estimateCost(entry.content, action, impulse);
    const meaning = await this.reflectMeaning(entry.content, action, impulse);

    const emotions = context.emotion_events?.map(e => e.emotion) || [];
    const identityPressure = context.identity_statements?.[0]?.claim || null;

    return {
      user_id: entry.user_id,
      timestamp: entry.date,
      source_entry_id: entry.id,
      situation,
      inferred_impulse: impulse,
      observed_action: action,
      cost,
      meaning,
      confidence,
      emotion_at_time: emotions.length > 0 ? emotions : null,
      identity_pressure: identityPressure,
      metadata: {},
    };
  }

  /**
   * Extract situation from entry
   */
  private async extractSituation(entryText: string): Promise<string> {
    try {
      const prompt = `Extract the situation or context from this entry in one short sentence.

Entry: ${entryText.substring(0, 800)}

Return ONLY the situation description, no explanations.`;

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'Extract the situation from text. Return only the situation, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
      });

      return completion.choices[0]?.message?.content?.trim() || 'Unknown situation';
    } catch (error) {
      logger.error({ error }, 'Failed to extract situation');
      return 'Unknown situation';
    }
  }

  /**
   * Estimate cost of choosing action over impulse
   */
  private async estimateCost(entryText: string, action: string, impulse: string): Promise<number> {
    // Estimate based on:
    // - Emotional intensity mentioned
    // - Difficulty indicators
    // - Stress indicators

    const lowerText = entryText.toLowerCase();
    
    let cost = 0.3; // Base cost

    // Emotional intensity indicators
    const intensityWords = ['very', 'extremely', 'intense', 'overwhelming', 'exhausting'];
    const intensityCount = intensityWords.filter(w => lowerText.includes(w)).length;
    cost += Math.min(0.3, intensityCount * 0.1);

    // Difficulty indicators
    const difficultyWords = ['difficult', 'hard', 'struggle', 'painful', 'costly'];
    const difficultyCount = difficultyWords.filter(w => lowerText.includes(w)).length;
    cost += Math.min(0.2, difficultyCount * 0.1);

    // Stress indicators
    const stressWords = ['stress', 'anxiety', 'fear', 'worry', 'pressure'];
    const stressCount = stressWords.filter(w => lowerText.includes(w)).length;
    cost += Math.min(0.2, stressCount * 0.1);

    return Math.min(1, Math.max(0, cost));
  }

  /**
   * Reflect on meaning of this will moment
   */
  private async reflectMeaning(entryText: string, action: string, impulse: string): Promise<string> {
    try {
      const prompt = `Reflect on why this choice mattered. The person felt an impulse to "${impulse}" but instead chose to "${action}".

Entry context: ${entryText.substring(0, 600)}

Generate a brief reflection (1-2 sentences) on why this choice might have mattered or what it reveals.
Be thoughtful but concise.`;

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.5,
        messages: [
          {
            role: 'system',
            content: 'You are a thoughtful observer of human agency. Generate brief, meaningful reflections.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 150,
      });

      return completion.choices[0]?.message?.content?.trim() || null;
    } catch (error) {
      logger.error({ error }, 'Failed to reflect meaning');
      return null;
    }
  }
}
