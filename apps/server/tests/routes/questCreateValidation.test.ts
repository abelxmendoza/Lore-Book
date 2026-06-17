import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { clampQuestScore, normalizeQuestType, optionalQuestString } from '../../src/utils/questNormalize';

const createQuestSchema = z.object({
  title: z.string().trim().min(1),
  description: z.preprocess(optionalQuestString, z.string().optional()),
  quest_type: z.preprocess(
    (v) => normalizeQuestType(v ?? 'side'),
    z.enum(['main', 'side', 'daily', 'achievement'])
  ).default('side'),
  priority: z.preprocess((v) => clampQuestScore(v), z.number().min(1).max(10)).default(5),
  importance: z.preprocess((v) => clampQuestScore(v), z.number().min(1).max(10)).default(5),
  impact: z.preprocess((v) => clampQuestScore(v), z.number().min(1).max(10)).default(5),
  source: z.enum(['manual', 'extracted', 'suggested', 'imported']).optional(),
});

describe('createQuestSchema suggestion payloads', () => {
  it('accepts null description and scores from LLM suggestions', () => {
    const parsed = createQuestSchema.safeParse({
      title: 'Finish LifeLedger onboarding',
      description: null,
      quest_type: 'weekly',
      priority: null,
      importance: null,
      impact: null,
      source: 'suggested',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.description).toBeUndefined();
      expect(parsed.data.quest_type).toBe('side');
      expect(parsed.data.priority).toBe(5);
    }
  });
});
