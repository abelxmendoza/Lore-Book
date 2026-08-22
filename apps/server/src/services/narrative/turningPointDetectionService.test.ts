import { describe, expect, it } from 'vitest';

import { detectInText } from './turningPointDetectionService';

describe('turningPointDetectionService occurrence authority', () => {
  it('21. does not require created_at and keeps unknown occurrence unresolved', () => {
    const hits = detectInText(
      'I started a new job at Vanguard Robotics. I don\'t remember when.',
      null,
      [],
      'journal',
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].date).toBeNull();
  });
});
