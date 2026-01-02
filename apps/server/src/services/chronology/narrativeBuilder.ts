import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import type { Event, NarrativeSequence } from './types';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * Builds narrative sequences from events
 */
export class NarrativeBuilder {
  /**
   * Build a narrative sequence with summary
   */
  async build(root: Event, events: Event[]): Promise<NarrativeSequence> {
    // Sort events chronologically
    const sequence = events
      .filter(e => e.timestamp)
      .sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

    // Generate summary using LLM
    const summary = await this.summarizeNarrative(sequence);

    return {
      sequence,
      summary,
      metadata: {
        rootEventId: root.id,
        eventCount: sequence.length,
      },
    };
  }

  /**
   * Summarize a narrative sequence using LLM
   */
  private async summarizeNarrative(events: Event[]): Promise<string> {
    if (events.length === 0) {
      return 'No events to summarize.';
    }

    try {
      // Build context from events
      const eventTexts = events
        .slice(0, 20) // Limit to first 20 events to avoid token limits
        .map((e, idx) => {
          const date = e.timestamp
            ? new Date(e.timestamp).toLocaleDateString()
            : 'Unknown date';
          return `${idx + 1}. [${date}] ${e.content}`;
        })
        .join('\n');

      const prompt = `You are a narrative storyteller. Create a concise, engaging summary of this sequence of events. Capture the flow, key moments, and overall narrative arc. Write in first person, be reflective and personal. Keep it to 3-5 paragraphs.\n\nEvents:\n${eventTexts}`;

      const response = await openai.chat.completions.create({
        model: config.chatModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a narrative storyteller. Create engaging, personal summaries of event sequences. Write in first person, be reflective and capture the emotional journey.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const summary = response.choices[0]?.message?.content?.trim() || 'Unable to generate summary.';
      return summary;
    } catch (error) {
      logger.error({ error }, 'Failed to generate narrative summary');
      // Fallback to simple summary
      return this.generateFallbackSummary(events);
    }
  }

  /**
   * Generate a simple fallback summary
   */
  private generateFallbackSummary(events: Event[]): string {
    if (events.length === 0) return 'No events.';

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    const firstDate = firstEvent.timestamp
      ? new Date(firstEvent.timestamp).toLocaleDateString()
      : 'Unknown date';
    const lastDate = lastEvent.timestamp
      ? new Date(lastEvent.timestamp).toLocaleDateString()
      : 'Unknown date';

    return `This sequence spans from ${firstDate} to ${lastDate}, containing ${events.length} events. The narrative begins with: "${firstEvent.content.substring(0, 100)}..."`;
  }
}

