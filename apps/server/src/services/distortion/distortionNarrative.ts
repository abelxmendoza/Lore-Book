import { logger } from '../../logger';
import { openai } from '../../lib/openai';
import type { DistortionSignal } from './distortionTypes';
import type { DistortionScoreResult } from './distortionScore';

export interface DistortionNarrativeResult {
  summary: string;
  patterns: string[];
  recommendations: string[];
}

export class DistortionNarrative {
  async build(signals: DistortionSignal[], score: DistortionScoreResult): Promise<DistortionNarrativeResult> {
    const prompt = `
Create a narrative summary of the user's cognitive distortions.

Signals: ${JSON.stringify(signals.slice(0, 20), null, 2)}
Score: ${JSON.stringify(score, null, 2)}

Return concise JSON:
{
  "summary": "...",
  "patterns": ["...","..."],
  "recommendations": ["...", "..."]
}`;

    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      const content = res.choices[0]?.message?.content;
      if (!content) {
        return {
          summary: 'No narrative generated',
          patterns: [],
          recommendations: [],
        };
      }

      try {
        return JSON.parse(content) as DistortionNarrativeResult;
      } catch (parseError) {
        logger.warn({ parseError, content }, 'Failed to parse distortion narrative');
        return {
          summary: 'Failed to generate narrative',
          patterns: [],
          recommendations: [],
        };
      }
    } catch (error) {
      logger.error({ error }, 'Failed to build distortion narrative');
      return {
        summary: 'Error generating narrative',
        patterns: [],
        recommendations: [],
      };
    }
  }
}

