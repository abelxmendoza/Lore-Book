import { logger } from '../../logger';
import { openai } from '../../lib/openai';
import type { DistortionType } from './distortionTypes';

interface DistortionClassification {
  distortions: Array<{
    type: string;
    confidence: number;
  }>;
}

export class DistortionClassifier {
  async classify(text: string): Promise<DistortionClassification> {
    const prompt = `
Identify cognitive distortions in the following text:

"${text}"

Return JSON:
{
  "distortions": [{ "type": "...", "confidence": 0.0 }]
}`;

    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      const content = res.choices[0]?.message?.content;
      if (!content) {
        return { distortions: [] };
      }

      try {
        return JSON.parse(content) as DistortionClassification;
      } catch (parseError) {
        logger.warn({ parseError, content }, 'Failed to parse distortion classification');
        return { distortions: [] };
      }
    } catch (error) {
      logger.error({ error }, 'Failed to classify distortions');
      return { distortions: [] };
    }
  }
}

