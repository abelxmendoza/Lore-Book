import { describe, expect, it } from 'vitest';
import { pickMetricReason } from './relationshipScoreReasons';

describe('pickMetricReason', () => {
  it('prefers persisted server reasons', () => {
    const reason = pickMetricReason(
      'affection',
      {
        metadata: {
          signals: {
            score_reasons: { affection: 'Mutual warmth shows up in your story' },
          },
        },
      },
      null,
      0,
    );
    expect(reason).toBe('Mutual warmth shows up in your story');
  });

  it('falls back to still-learning copy for thin evidence', () => {
    expect(
      pickMetricReason(
        'health',
        { status: 'active', metadata: { signals: { signal_strength: 'low' } } },
        null,
        0,
      ),
    ).toMatch(/thin evidence|near neutral/i);
  });

  it('uses situationship-aware fit copy', () => {
    expect(
      pickMetricReason(
        'compatibility',
        {
          is_situationship: true,
          metadata: { signals: { signal_strength: 'high' } },
          green_flags: ['Active, recent contact'],
        },
        null,
        2,
      ),
    ).toMatch(/undefined setup/i);
  });
});
