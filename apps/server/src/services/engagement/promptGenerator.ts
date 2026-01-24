/**
 * Engagement Prompt Generator
 * Generates highly engaging, curiosity-driven prompts to encourage users to fill gaps
 */

import { openai } from '../../lib/openai';
import { config } from '../../config';
import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { voidAwarenessService } from '../biographyGeneration/voidAwarenessService';

export class EngagementPromptGenerator {
  /**
   * Generate highly engaging prompts to fill voids
   */
  async generateEngagingVoidPrompts(
    userId: string,
    voidPeriod: {
      start: string;
      end: string;
      durationDays: number;
      context?: any;
    }
  ): Promise<string[]> {
    try {
      // Get context around the void
      const { data: beforeEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('content, date, tags, people')
        .eq('user_id', userId)
        .lt('date', voidPeriod.start)
        .order('date', { ascending: false })
        .limit(5);

      const { data: afterEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('content, date, tags, people')
        .eq('user_id', userId)
        .gt('date', voidPeriod.end)
        .order('date', { ascending: true })
        .limit(5);

      // Use existing void prompts as fallback
      const basicPrompts = voidAwarenessService.generateVoidPrompts({
        id: 'temp',
        start: voidPeriod.start,
        end: voidPeriod.end,
        durationDays: voidPeriod.durationDays,
        type: voidPeriod.durationDays < 30 ? 'short_gap' : voidPeriod.durationDays < 180 ? 'medium_gap' : 'long_silence',
        significance: 'medium',
        context: voidPeriod.context,
      });

      // If we have context, use AI to generate more engaging prompts
      if ((beforeEntries && beforeEntries.length > 0) || (afterEntries && afterEntries.length > 0)) {
        try {
          const beforeContext = beforeEntries?.map(e => e.content).join('\n').substring(0, 500) || '';
          const afterContext = afterEntries?.map(e => e.content).join('\n').substring(0, 500) || '';

          const completion = await openai.chat.completions.create({
            model: config.defaultModel || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are a creative writing coach who helps people remember and document their life stories. Generate 3-5 highly engaging, curiosity-driven prompts that make someone WANT to fill in a gap in their journal. Make them feel like they're discovering something important about themselves.`
              },
              {
                role: 'user',
                content: `Generate prompts for a ${voidPeriod.durationDays}-day gap from ${voidPeriod.start} to ${voidPeriod.end}.

Context before: ${beforeContext}
Context after: ${afterContext}

Make prompts that:
1. Create curiosity ("What changed during this time?")
2. Connect to their story ("How did this period lead to what happened next?")
3. Feel important ("This gap might hold a key moment in your journey")
4. Are specific and actionable
5. Make them excited to remember

Return ONLY a JSON array of prompt strings.`
              }
            ],
            temperature: 0.9,
            max_tokens: 300,
          });

          const aiPrompts = JSON.parse(
            completion.choices[0]?.message?.content || '[]'
          ) as string[];

          if (aiPrompts.length > 0) {
            return aiPrompts;
          }
        } catch (error) {
          logger.warn({ error }, 'Failed to generate AI prompts, using fallback');
        }
      }

      // Fallback to basic prompts
      return basicPrompts;
    } catch (error) {
      logger.error({ error }, 'Failed to generate engaging prompts');
      return [
        `What happened during these ${voidPeriod.durationDays} days?`,
        `Tell me about this period in your life.`,
        `How did this time connect to what came before and after?`
      ];
    }
  }
}

export const engagementPromptGenerator = new EngagementPromptGenerator();
