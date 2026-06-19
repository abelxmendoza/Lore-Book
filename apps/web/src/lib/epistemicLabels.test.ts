import { describe, expect, it } from 'vitest';

import {
  epistemicBand,
  epistemicLabel,
  formatEpistemicBadge,
  formatEpistemicPercent,
  formatEpistemicTitle,
} from './epistemicLabels';

describe('epistemicLabels', () => {
  it('maps confidence to certainty bands', () => {
    expect(epistemicBand(0.85)).toBe('high_certainty');
    expect(epistemicBand(0.55)).toBe('partial');
    expect(epistemicBand(0.2)).toBe('high_uncertainty');
  });

  it('uses certainty language for high scores and uncertainty for low', () => {
    expect(epistemicLabel(0.84)).toBe('High certainty');
    expect(epistemicLabel(0.52)).toBe('Some uncertainty');
    expect(epistemicLabel(0.18)).toBe('High uncertainty');
  });

  it('formats percent as certain or uncertain', () => {
    expect(formatEpistemicPercent(0.84)).toBe('84% certain');
    expect(formatEpistemicPercent(0.32)).toBe('68% uncertain');
    expect(formatEpistemicPercent(0.5)).toBe('50% certain');
  });

  it('builds badge and title strings', () => {
    expect(formatEpistemicBadge(0.84)).toBe('High certainty · 84% certain');
    expect(formatEpistemicTitle(0.32)).toBe('High uncertainty (68% uncertain)');
  });
});
