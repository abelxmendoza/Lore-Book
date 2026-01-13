// =====================================================
// BREAKUP DETECTOR
// Purpose: Detect and track breakups
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type BreakupType =
  | 'mutual'
  | 'initiated_by_user'
  | 'initiated_by_them'
  | 'ghosted'
  | 'faded_away'
  | 'cheating'
  | 'incompatibility'
  | 'distance'
  | 'circumstances'
  | 'toxic'
  | 'other';

export interface BreakupDetection {
  relationshipId: string;
  breakupDate: string;
  breakupType: BreakupType;
  reason?: string;
  whoInitiated?: 'user' | 'them' | 'mutual' | 'unclear';
  wasExpected?: boolean;
  wasClean?: boolean;
  evidence: string;
}

export class BreakupDetector {
  /**
   * Detect breakup from message
   */
  async detectBreakup(
    userId: string,
    message: string,
    relationshipId: string,
    personId: string,
    messageId?: string
  ): Promise<BreakupDetection | null> {
    try {
      // Check for breakup keywords
      const breakupKeywords = [
        'broke up', 'breakup', 'brokeup', 'breaking up',
        'ended', 'over', 'done', 'finished', 'split',
        'separated', 'divorced', 'called it quits',
        'ghosted', 'blocked', 'cut off'
      ];

      const hasBreakupKeyword = breakupKeywords.some(kw =>
        message.toLowerCase().includes(kw)
      );

      if (!hasBreakupKeyword) {
        return null;
      }

      // Use LLM to analyze breakup
      const { config } = await import('../../config');
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.openAiKey });

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze this message to detect breakup details.

Breakup types:
- "mutual": Both parties agreed
- "initiated_by_user": User initiated the breakup
- "initiated_by_them": Other person initiated
- "ghosted": They disappeared/stopped responding
- "faded_away": Relationship just faded naturally
- "cheating": Breakup due to cheating/infidelity
- "incompatibility": Not compatible
- "distance": Long distance didn't work
- "circumstances": Life circumstances (moving, etc.)
- "toxic": Toxic/unhealthy relationship
- "other": Other reason

Return JSON:
{
  "isBreakup": true/false,
  "breakupType": "mutual" | "initiated_by_user" | etc.,
  "breakupDate": "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss",
  "whoInitiated": "user" | "them" | "mutual" | "unclear",
  "wasExpected": true/false,
  "wasClean": true/false,
  "reason": "why they broke up",
  "confidence": 0.0-1.0
}

Only return isBreakup: true if confidence >= 0.7.`,
          },
          {
            role: 'user',
            content: `Message: "${message}"\n\nDetect breakup:`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return null;
      }

      const parsed = JSON.parse(response);

      if (!parsed.isBreakup || parsed.confidence < 0.7) {
        return null;
      }

      const breakup: BreakupDetection = {
        relationshipId,
        breakupDate: parsed.breakupDate || new Date().toISOString(),
        breakupType: parsed.breakupType as BreakupType,
        reason: parsed.reason,
        whoInitiated: parsed.whoInitiated,
        wasExpected: parsed.wasExpected,
        wasClean: parsed.wasClean,
        evidence: message.substring(0, 500),
      };

      // Save breakup
      await supabaseAdmin.from('relationship_breakups').insert({
        user_id: userId,
        relationship_id: relationshipId,
        breakup_date: breakup.breakupDate,
        breakup_type: breakup.breakupType,
        reason: breakup.reason,
        who_initiated: breakup.whoInitiated,
        was_expected: breakup.wasExpected,
        was_clean: breakup.wasClean,
        source_entry_id: messageId,
        metadata: {
          detected_at: new Date().toISOString(),
          confidence: parsed.confidence,
        },
      });

      // Update relationship status
      await supabaseAdmin
        .from('romantic_relationships')
        .update({
          status: 'ended',
          is_current: false,
          end_date: breakup.breakupDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', relationshipId);

      return breakup;
    } catch (error) {
      logger.error({ error, relationshipId }, 'Failed to detect breakup');
      return null;
    }
  }

  /**
   * Detect "I love you" declarations
   */
  async detectLoveDeclaration(
    userId: string,
    message: string,
    relationshipId: string,
    personId: string,
    messageId?: string
  ): Promise<void> {
    try {
      const loveKeywords = [
        'i love you', 'i love them', 'i\'m in love', 'falling in love',
        'love you', 'in love with', 'i love', 'love declaration'
      ];

      const hasLoveKeyword = loveKeywords.some(kw =>
        message.toLowerCase().includes(kw)
      );

      if (!hasLoveKeyword) {
        return;
      }

      // Check if they said it back
      const reciprocatedKeywords = ['they said', 'they told me', 'they love me', 'they said it back'];
      const wasReciprocated = reciprocatedKeywords.some(kw =>
        message.toLowerCase().includes(kw)
      );

      // Update relationship with love status
      await supabaseAdmin
        .from('romantic_relationships')
        .update({
          love_status: wasReciprocated ? 'loved' : 'in_love',
          love_declared_at: new Date().toISOString(),
          love_reciprocated: wasReciprocated,
          relationship_type: 'in_love', // Also update type
          updated_at: new Date().toISOString(),
        })
        .eq('id', relationshipId);

      // Also create a date event
      await supabaseAdmin.from('romantic_dates').insert({
        user_id: userId,
        relationship_id: relationshipId,
        person_id: personId,
        date_type: 'first_i_love_you',
        date_time: new Date().toISOString(),
        description: wasReciprocated ? 'Said "I love you" and they said it back' : 'Said "I love you"',
        sentiment: 1.0,
        was_positive: true,
        source_message_id: messageId,
      });
    } catch (error) {
      logger.debug({ error }, 'Failed to detect love declaration');
    }
  }
}

export const breakupDetector = new BreakupDetector();
