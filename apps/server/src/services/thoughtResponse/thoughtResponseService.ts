/**
 * Thought Response Service
 * 
 * Generates appropriate responses to thoughts based on classification and context.
 * 
 * Response Postures:
 * - Reflect: mirror it back clean
 * - Clarify: ask 1 sharp question
 * - Stabilize: reduce emotional spike
 * - Reframe: challenge the belief (only if earned)
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';
import type { ThoughtClassification } from '../thoughtClassification/thoughtClassificationService';
import type { InsecurityMatch } from '../insecurityGraph/insecurityGraphService';

export type ResponsePosture = 'reflect' | 'clarify' | 'stabilize' | 'reframe';

export interface ThoughtResponse {
  id: string;
  user_id: string;
  thought_id?: string;
  entry_id?: string;
  response_posture: ResponsePosture;
  response_text: string;
  was_helpful?: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

class ThoughtResponseService {
  /**
   * Generate response to a thought
   */
  async generateResponse(
    userId: string,
    thought: ThoughtClassification,
    insecurityMatches: InsecurityMatch[]
  ): Promise<ThoughtResponse> {
    try {
      // Determine response posture
      const posture = this.determinePosture(thought, insecurityMatches);

      // Generate response text
      const responseText = await this.generateResponseText(
        thought,
        insecurityMatches,
        posture
      );

      // Store response
      const response: Omit<ThoughtResponse, 'id' | 'created_at'> = {
        user_id: userId,
        thought_id: thought.id,
        response_posture: posture,
        response_text: responseText,
        metadata: {
          thought_type: thought.thought_type,
          matches_count: insecurityMatches.length,
        },
      };

      const { data, error } = await supabaseAdmin
        .from('thought_responses')
        .insert(response)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as ThoughtResponse;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to generate response');
      throw error;
    }
  }

  /**
   * Determine response posture based on thought type and context
   */
  private determinePosture(
    thought: ThoughtClassification,
    matches: InsecurityMatch[]
  ): ResponsePosture {
    // Default: Reflect → Clarify for insecurities
    if (thought.thought_type === 'insecurity') {
      if (matches.length > 0 && matches[0].match_confidence > 0.7) {
        // Known pattern - can be more direct
        return 'clarify';
      }
      // New or low-confidence - reflect first
      return 'reflect';
    }

    // Emotion spike - stabilize
    if (thought.thought_type === 'emotion_spike') {
      return 'stabilize';
    }

    // Belief - can reframe if high confidence
    if (thought.thought_type === 'belief' && thought.confidence > 0.8) {
      return 'reframe';
    }

    // Decision probe - clarify
    if (thought.thought_type === 'decision_probe') {
      return 'clarify';
    }

    // Default: reflect
    return 'reflect';
  }

  /**
   * Generate response text based on posture
   */
  private async generateResponseText(
    thought: ThoughtClassification,
    matches: InsecurityMatch[],
    posture: ResponsePosture
  ): Promise<string> {
    const thoughtText = thought.thought_text;

    // Use templates for speed, LLM for nuance
    if (posture === 'reflect') {
      return this.generateReflectResponse(thoughtText, matches);
    }

    if (posture === 'clarify') {
      return this.generateClarifyResponse(thoughtText, matches);
    }

    if (posture === 'stabilize') {
      return this.generateStabilizeResponse(thoughtText);
    }

    if (posture === 'reframe') {
      return this.generateReframeResponse(thoughtText, matches);
    }

    return this.generateReflectResponse(thoughtText, matches);
  }

  /**
   * Generate reflect response (mirror back clean)
   * Never: "Everyone moves at their own pace 😊" or other empty calories
   * Never: echo back what the user just said
   */
  private generateReflectResponse(
    thoughtText: string,
    matches: InsecurityMatch[]
  ): string {
    const text = thoughtText.toLowerCase();

    // Job loss / income loss
    if (text.includes('lost my job') || text.includes('lost my income') || text.includes('lost my source of income') || text.includes('unemployed') || text.includes('laid off') || text.includes('fired')) {
      return "Losing income is one of the most destabilizing things. How long has this been going on?";
    }

    // Rejection (multiple or repeated)
    if ((text.includes('reject') && (text.includes('left and right') || text.includes('every') || text.includes('keep') || text.includes('again'))) || text.match(/reject(ed|ion).*(over|over and over|repeatedly)/)) {
      return "Getting rejected repeatedly is exhausting in a way that's hard to explain to people who aren't in it. What are you going after?";
    }

    // Rejection (general)
    if (text.includes('rejected') || text.includes('rejection')) {
      return "What happened?";
    }

    // Grinding / burnout / working alone through a holiday
    if ((text.includes('grind') || text.includes('grinding')) && (text.includes('inside') || text.includes('alone') || text.includes('holiday') || text.includes('weekend'))) {
      return "Grinding alone while everyone else is offline hits different. What are you trying to get across the line?";
    }

    // Overwhelm / negative emotions
    if (text.includes('negative emotion') || text.includes('lot of emotion') || text.includes('shit load') || text.includes('shitload') || text.includes('overwhelming')) {
      return "That's a lot to be carrying. What's sitting heaviest right now?";
    }

    // Specific reflections for common patterns
    if (text.includes('feel behind')) {
      return "Behind who — people from high school, or where you thought you'd be by now?";
    }

    if (text.includes('not enough') || text.includes("not good enough")) {
      return "Not enough for what, or for whom?";
    }

    if (text.includes('worse than') || text.includes('better than')) {
      return "Compared to what standard?";
    }

    if (text.includes('always') || text.includes('never')) {
      return "Always? Or does it just feel that way right now?";
    }

    if (text.includes('stress') || text.includes('anxious') || text.includes('anxiety')) {
      return "What's the main thing driving it right now?";
    }

    if (text.includes('tired') || text.includes('exhausted') || text.includes('drained')) {
      return "What's been the most draining part?";
    }

    // Generic reflection - acknowledge without echoing
    return "What's the part that's hitting hardest right now?";
  }

  /**
   * Generate clarify response (ask 1 sharp question)
   * Context-aware when we have pattern matches
   */
  private generateClarifyResponse(
    thoughtText: string,
    matches: InsecurityMatch[]
  ): string {
    const text = thoughtText.toLowerCase();

    // Context-aware clarification if we have strong matches
    if (matches.length > 0 && matches[0].match_confidence > 0.6) {
      const match = matches[0];
      const domain = match.extracted_domain || match.pattern.domain;
      const frequency = match.pattern.frequency;

      // Only mention pattern if it's frequent enough (don't be creepy)
      if (frequency >= 3) {
        if (domain === 'career' || domain === 'money') {
          return "This usually shows up when you're thinking about money or career timelines. Is that what's firing right now, or is it something else?";
        }

        if (domain === 'age') {
          return "Is this about where you thought you'd be by this age, or comparing to others?";
        }

        if (domain === 'relationships') {
          return "Is this about your relationship, or comparing to others' relationships?";
        }
      }
    }

    // Extract comparison target from thought
    if (text.includes('behind')) {
      return "Behind who — people from high school, or where you thought you'd be by now?";
    }

    if (text.includes('not enough') || text.includes("not good enough")) {
      return "Not enough for what, or for whom?";
    }

    if (text.includes('worse than') || text.includes('better than')) {
      return "Compared to what standard, or whose?";
    }

    if (text.includes('everyone') || text.includes('others') || text.includes('people')) {
      return "Which people specifically? Or is it more about an internal standard?";
    }

    // Generic clarification - always ask permission, never assume
    return "What's the comparison here?";
  }

  /**
   * Generate stabilize response (reduce emotional spike)
   * Never minimize ("it's not that bad") or dismiss
   */
  private generateStabilizeResponse(thoughtText: string): string {
    const text = thoughtText.toLowerCase();

    // Acknowledge intensity without minimizing
    if (text.includes('angry') || text.includes('furious')) {
      return "That's a lot of anger. What happened that brought this up?";
    }

    if (text.includes('ashamed') || text.includes('embarrassed')) {
      return "Shame is heavy. What's making you feel that way?";
    }

    if (text.includes('devastated') || text.includes('crushed')) {
      return "That sounds really hard. What happened?";
    }

    // Generic - acknowledge, don't minimize
    return "That's a lot to feel. What happened that brought this up?";
  }

  /**
   * Generate reframe response (challenge belief, only if earned)
   * Only reframe if we have strong evidence - otherwise it feels fake
   */
  private generateReframeResponse(
    thoughtText: string,
    matches: InsecurityMatch[]
  ): string {
    // Only reframe if we have strong pattern evidence (high frequency + high confidence)
    if (matches.length > 0) {
      const match = matches[0];
      if (match.match_confidence > 0.8 && match.pattern.frequency >= 5) {
        // We've seen this enough to gently challenge
        return `You've thought this before about ${match.pattern.domain}. Is it still true, or has something changed?`;
      }
    }

    // Otherwise, just clarify - don't reframe without evidence
    return this.generateClarifyResponse(thoughtText, matches);
  }

  /**
   * Get response for a thought
   */
  async getResponse(
    userId: string,
    thoughtId: string
  ): Promise<ThoughtResponse | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('thought_responses')
        .select('*')
        .eq('user_id', userId)
        .eq('thought_id', thoughtId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data as ThoughtResponse;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get response');
      return null;
    }
  }

  /**
   * Record user feedback on response
   */
  async recordFeedback(
    userId: string,
    responseId: string,
    wasHelpful: boolean
  ): Promise<ThoughtResponse> {
    try {
      const { data, error } = await supabaseAdmin
        .from('thought_responses')
        .update({ was_helpful: wasHelpful })
        .eq('id', responseId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as ThoughtResponse;
    } catch (error) {
      logger.error({ err: error }, 'Failed to record feedback');
      throw error;
    }
  }
}

export const thoughtResponseService = new ThoughtResponseService();
