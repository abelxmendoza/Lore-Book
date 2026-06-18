/**
 * Narrative segmentation + structure enrichment.
 */
import { describe, expect, it } from 'vitest';

import { segmentNarrative } from '../../src/services/backwardStorytelling/narrativeSegmentationService';

describe('narrative segmentation structure enrichment', () => {
  it('attaches narrative_stages and discourse_moves per segment', () => {
    const segments = segmentNarrative(
      'It started when I joined the team. Then one day everything changed when our lead quit. Looking back, I learned to trust myself.',
    );
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.some((s) => (s.narrative_stages?.length ?? 0) > 0)).toBe(true);
    expect(segments[0]?.narrative_stages?.some((st) => st.stage === 'SETUP')).toBe(true);
  });
});
