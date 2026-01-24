/**
 * Bias Detection Service
 * 
 * Detects various types of bias in journal entries:
 * - Self-serving bias (making oneself look good)
 * - Protective bias (protecting reputation)
 * - Cultural bias (cultural lens filtering)
 * - Temporal bias (present perspective on past)
 * - Confirmation bias (seeking confirming evidence)
 * - Negativity/positivity bias (skewed emotional tone)
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';
import type { MemoryEntry } from '../../types';

export interface BiasDetection {
  id: string;
  user_id: string;
  entry_id: string;
  bias_type: 'self_serving' | 'protective' | 'cultural' | 'temporal' | 'confirmation' | 'negativity' | 'positivity';
  confidence: number;
  detected_patterns: string[];
  suggested_questions: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BiasDetectionResult {
  bias_detected: boolean;
  biases: BiasDetection[];
  overall_confidence: number;
}

class BiasDetectionService {
  /**
   * Detect biases in a journal entry
   */
  async detectBiases(
    userId: string,
    entry: MemoryEntry
  ): Promise<BiasDetectionResult> {
    try {
      const biases: BiasDetection[] = [];

      // 1. Self-serving bias detection
      const selfServing = await this.detectSelfServingBias(userId, entry);
      if (selfServing) biases.push(selfServing);

      // 2. Protective bias detection
      const protective = await this.detectProtectiveBias(userId, entry);
      if (protective) biases.push(protective);

      // 3. Cultural bias detection
      const cultural = await this.detectCulturalBias(userId, entry);
      if (cultural) biases.push(cultural);

      // 4. Temporal bias detection
      const temporal = await this.detectTemporalBias(userId, entry);
      if (temporal) biases.push(temporal);

      // 5. Negativity/positivity bias detection
      const emotional = await this.detectEmotionalBias(userId, entry);
      if (emotional) biases.push(emotional);

      // Store detections
      if (biases.length > 0) {
        await this.storeBiases(userId, biases);
      }

      const overallConfidence = biases.length > 0
        ? biases.reduce((sum, b) => sum + b.confidence, 0) / biases.length
        : 0;

      return {
        bias_detected: biases.length > 0,
        biases,
        overall_confidence: overallConfidence,
      };
    } catch (error) {
      logger.error({ err: error, userId, entryId: entry.id }, 'Failed to detect biases');
      return {
        bias_detected: false,
        biases: [],
        overall_confidence: 0,
      };
    }
  }

  /**
   * Detect self-serving bias (making oneself look good)
   */
  private async detectSelfServingBias(
    userId: string,
    entry: MemoryEntry
  ): Promise<BiasDetection | null> {
    const patterns = [
      /I (always|never) (do|did|am)/gi,
      /I (was|am) (always|never) (right|correct)/gi,
      /(It wasn't|It's not) my fault/gi,
      /I (tried|did) my best/gi,
      /(They|He|She) (made|forced) me/gi,
      /I had no choice/gi,
      /I (couldn't|can't) help it/gi,
    ];

    const text = entry.content.toLowerCase();
    const matches = patterns.filter(p => p.test(text));
    
    if (matches.length === 0) return null;

    // Use LLM for more nuanced detection
    const prompt = `Analyze this journal entry for self-serving bias (making the writer look good, avoiding responsibility, justifying actions):

"${entry.content}"

Respond with JSON:
{
  "has_bias": boolean,
  "confidence": number (0-1),
  "patterns": ["pattern1", "pattern2"],
  "suggested_questions": ["question1", "question2"]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (result.has_bias && result.confidence > 0.5) {
        return {
          id: crypto.randomUUID(),
          user_id: userId,
          entry_id: entry.id,
          bias_type: 'self_serving',
          confidence: result.confidence,
          detected_patterns: result.patterns || [],
          suggested_questions: result.suggested_questions || [
            'What role did you play in this situation?',
            'Is there another side to this story?',
            'What could you have done differently?',
          ],
          metadata: { llm_analysis: result },
          created_at: new Date().toISOString(),
        };
      }
    } catch (error) {
      logger.warn({ err: error }, 'LLM bias detection failed, using pattern matching');
    }

    // Fallback to pattern matching
    if (matches.length >= 2) {
      return {
        id: crypto.randomUUID(),
        user_id: userId,
        entry_id: entry.id,
        bias_type: 'self_serving',
        confidence: 0.6,
        detected_patterns: ['self-justification patterns detected'],
        suggested_questions: [
          'What role did you play in this situation?',
          'Is there another side to this story?',
        ],
        metadata: { pattern_matches: matches.length },
        created_at: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Detect protective bias (protecting reputation)
   */
  private async detectProtectiveBias(
    userId: string,
    entry: MemoryEntry
  ): Promise<BiasDetection | null> {
    const protectivePatterns = [
      /I (don't|didn't) want to (talk|discuss|mention)/gi,
      /(Let's|Let us) not (talk|discuss|go into)/gi,
      /(That's|That) (private|personal|confidential)/gi,
      /I (can't|cannot) (say|tell|share)/gi,
    ];

    const text = entry.content.toLowerCase();
    const hasProtectiveLanguage = protectivePatterns.some(p => p.test(text));

    if (!hasProtectiveLanguage) return null;

    return {
      id: crypto.randomUUID(),
      user_id: userId,
      entry_id: entry.id,
      bias_type: 'protective',
      confidence: 0.7,
      detected_patterns: ['protective language detected'],
      suggested_questions: [
        'What are you protecting by not discussing this?',
        'Is there more to this story that you\'re not saying?',
      ],
      metadata: {},
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Detect cultural bias (cultural lens filtering)
   */
  private async detectCulturalBias(
    userId: string,
    entry: MemoryEntry
  ): Promise<BiasDetection | null> {
    // This would ideally use user's cultural background from profile
    // For now, detect cultural assumptions
    const culturalPatterns = [
      /(everyone|people|they) (should|must|always)/gi,
      /(that's|it's) (just|simply) (how|the way)/gi,
      /(normal|typical|usual) (for|in)/gi,
    ];

    const text = entry.content.toLowerCase();
    const hasCulturalAssumptions = culturalPatterns.some(p => p.test(text));

    if (!hasCulturalAssumptions) return null;

    return {
      id: crypto.randomUUID(),
      user_id: userId,
      entry_id: entry.id,
      bias_type: 'cultural',
      confidence: 0.6,
      detected_patterns: ['cultural assumptions detected'],
      suggested_questions: [
        'How might someone from a different culture interpret this?',
        'What cultural values are influencing your perspective?',
      ],
      metadata: {},
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Detect temporal bias (present perspective on past)
   */
  private async detectTemporalBias(
    userId: string,
    entry: MemoryEntry
  ): Promise<BiasDetection | null> {
    // Check if entry is written long after the event
    const entryDate = new Date(entry.date);
    const writtenDate = new Date(entry.created_at || entry.date);
    const daysDiff = Math.floor((writtenDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 365) {
      return {
        id: crypto.randomUUID(),
        user_id: userId,
        entry_id: entry.id,
        bias_type: 'temporal',
        confidence: 0.8,
        detected_patterns: [`Written ${daysDiff} days after event`],
        suggested_questions: [
          'How might your current perspective differ from how you felt at the time?',
          'What details might you have forgotten or reinterpreted?',
        ],
        metadata: { temporal_distance_days: daysDiff },
        created_at: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Detect emotional bias (negativity/positivity skew)
   */
  private async detectEmotionalBias(
    userId: string,
    entry: MemoryEntry
  ): Promise<BiasDetection | null> {
    // Get user's emotional pattern from recent entries
    const { data: recentEntries } = await supabaseAdmin
      .from('journal_entries')
      .select('mood, sentiment')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!recentEntries || recentEntries.length < 5) return null;

    const negativeMoods = ['angry', 'sad', 'frustrated', 'anxious', 'stressed', 'lonely'];
    const positiveMoods = ['happy', 'excited', 'grateful', 'content', 'peaceful', 'joyful'];

    const negativeCount = recentEntries.filter(e => 
      e.mood && negativeMoods.includes(e.mood.toLowerCase())
    ).length;
    const positiveCount = recentEntries.filter(e => 
      e.mood && positiveMoods.includes(e.mood.toLowerCase())
    ).length;

    const total = recentEntries.length;
    const negativeRatio = negativeCount / total;
    const positiveRatio = positiveCount / total;

    // Detect if there's a strong skew
    if (negativeRatio > 0.7) {
      return {
        id: crypto.randomUUID(),
        user_id: userId,
        entry_id: entry.id,
        bias_type: 'negativity',
        confidence: 0.7,
        detected_patterns: [`${Math.round(negativeRatio * 100)}% of recent entries are negative`],
        suggested_questions: [
          'What went well today that you might not have mentioned?',
          'Are there positive aspects of this situation you\'re overlooking?',
        ],
        metadata: { negative_ratio: negativeRatio, recent_entry_count: total },
        created_at: new Date().toISOString(),
      };
    }

    if (positiveRatio > 0.7) {
      return {
        id: crypto.randomUUID(),
        user_id: userId,
        entry_id: entry.id,
        bias_type: 'positivity',
        confidence: 0.6,
        detected_patterns: [`${Math.round(positiveRatio * 100)}% of recent entries are positive`],
        suggested_questions: [
          'Are there any challenges or difficulties you\'re not acknowledging?',
          'What might be harder than you\'re letting on?',
        ],
        metadata: { positive_ratio: positiveRatio, recent_entry_count: total },
        created_at: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Store bias detections in database
   */
  private async storeBiases(
    userId: string,
    biases: BiasDetection[]
  ): Promise<void> {
    try {
      const records = biases.map(bias => ({
        user_id: bias.user_id,
        entry_id: bias.entry_id,
        bias_type: bias.bias_type,
        confidence: bias.confidence,
        detected_patterns: bias.detected_patterns,
        suggested_questions: bias.suggested_questions,
        metadata: bias.metadata,
      }));

      const { error } = await supabaseAdmin
        .from('bias_detections')
        .upsert(records, { onConflict: 'user_id,entry_id,bias_type' });

      if (error) {
        logger.error({ err: error }, 'Failed to store bias detections');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error storing bias detections');
    }
  }

  /**
   * Get bias detections for an entry
   */
  async getBiasesForEntry(
    userId: string,
    entryId: string
  ): Promise<BiasDetection[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('bias_detections')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_id', entryId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ err: error }, 'Failed to get bias detections');
        return [];
      }

      return (data || []) as BiasDetection[];
    } catch (error) {
      logger.error({ err: error }, 'Error getting bias detections');
      return [];
    }
  }

  /**
   * Get all biases for a user
   */
  async getUserBiases(
    userId: string,
    limit: number = 50
  ): Promise<BiasDetection[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('bias_detections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ err: error }, 'Failed to get user biases');
        return [];
      }

      return (data || []) as BiasDetection[];
    } catch (error) {
      logger.error({ err: error }, 'Error getting user biases');
      return [];
    }
  }
}

export const biasDetectionService = new BiasDetectionService();
