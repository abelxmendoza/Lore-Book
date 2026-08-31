import { describe, expect, it } from 'vitest';

import { lifeArcBarEligibility } from './lifeArcEligibility';

const base = {
  arc_type: 'work' as const,
  start_date: '2026-01-01',
  end_date: '2026-02-01',
  metadata: {},
};

describe('lifeArcBarEligibility', () => {
  it('draws a supported multi-day arc', () => {
    expect(lifeArcBarEligibility(base)).toEqual({ drawable: true, reason: null });
  });

  it.each([
    [{ ...base, arc_type: 'occasion' as const }, 'occasion'],
    [{ ...base, metadata: { omni_draw_bar: false } }, 'explicitly_suppressed'],
    [{ ...base, start_date: null }, 'missing_start_date'],
    [{ ...base, end_date: 'not-a-date' }, 'invalid_dates'],
    [{ ...base, end_date: '2026-01-02' }, 'single_day_span'],
    [{ ...base, metadata: { source_record_ids: ['resolved_event:one'] } }, 'insufficient_evidence'],
  ])('returns a visible suppression reason', (arc, reason) => {
    expect(lifeArcBarEligibility(arc)).toEqual({ drawable: false, reason });
  });
});
