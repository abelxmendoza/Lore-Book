import { describe, expect, it } from 'vitest';

import {
  classifyFactRelation,
  dedupeEntityFactsForDisplay,
  factContentKey,
  findBestMatchingFact,
  preferFactWording,
} from '../../../src/services/entities/entityFactDedup';

describe('entityFactDedup', () => {
  it('treats identical wording as an exact confirmation', () => {
    expect(classifyFactRelation('Has pink hair', 'Has pink hair')).toBe('exact_confirmation');
  });

  it('detects present → past state changes without an LLM', () => {
    expect(classifyFactRelation('Has pink hair', 'Had pink hair in the past')).toBe('state_change');
    expect(classifyFactRelation('Works at Vanguard Robotics', 'Worked at Vanguard Robotics')).toBe(
      'state_change',
    );
  });

  it('treats paraphrase restatements as near confirmations', () => {
    expect(
      classifyFactRelation('Works at Vanguard Robotics', 'Works at Vanguard Robotics as an engineer'),
    ).toBe('near_confirmation');
  });

  it('keeps unrelated facts distinct', () => {
    expect(classifyFactRelation('Has pink hair', 'Works at Vanguard Robotics')).toBe('distinct');
  });

  it('builds tense-insensitive content keys', () => {
    expect(factContentKey('Has pink hair')).toBe(factContentKey('Had pink hair in the past'));
  });

  it('finds the best match in-category only', () => {
    const existing = [
      { id: '1', fact: 'Has pink hair', category: 'appearance', mention_count: 2 },
      { id: '2', fact: 'Works at Vanguard Robotics', category: 'career', mention_count: 1 },
    ];
    const hit = findBestMatchingFact(
      { fact: 'Had pink hair in the past', category: 'appearance' },
      existing,
    );
    expect(hit?.match.id).toBe('1');
    expect(hit?.relation).toBe('state_change');
  });

  it('dedupes display twins and merges confirmation counts', () => {
    const deduped = dedupeEntityFactsForDisplay([
      {
        id: 'a',
        fact: 'Has pink hair',
        category: 'appearance',
        confidence: 0.8,
        mention_count: 1,
        status: 'active',
        first_seen_at: '2024-01-01T00:00:00.000Z',
        last_confirmed_at: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        fact: 'Had pink hair in the past',
        category: 'appearance',
        confidence: 0.95,
        mention_count: 3,
        status: 'corrected',
        previous_value: 'Has pink hair',
        first_seen_at: '2024-06-01T00:00:00.000Z',
        last_confirmed_at: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'c',
        fact: 'Works at Vanguard Robotics',
        category: 'career',
        confidence: 0.9,
        mention_count: 1,
        status: 'active',
      },
    ]);
    expect(deduped).toHaveLength(2);
    const appearance = deduped.find((f) => f.category === 'appearance');
    expect(appearance?.fact).toBe('Had pink hair in the past');
    expect(appearance?.mention_count).toBe(4);
  });

  it('collapses Amazon/Ring and Vanguard employment paraphrases for display', () => {
    const deduped = dedupeEntityFactsForDisplay([
      {
        id: 'a',
        fact: 'Works at Amazon as a QA technician',
        category: 'career',
        confidence: 0.8,
        mention_count: 1,
        status: 'active',
      },
      {
        id: 'b',
        fact: 'Works at Ring',
        category: 'career',
        confidence: 0.9,
        mention_count: 2,
        status: 'active',
      },
      {
        id: 'c',
        fact: 'Is currently working at Amazon',
        category: 'career',
        confidence: 0.7,
        mention_count: 1,
        status: 'active',
      },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.mention_count).toBe(4);
  });
});
