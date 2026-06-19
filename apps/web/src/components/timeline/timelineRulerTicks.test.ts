import { describe, expect, it } from 'vitest';

import {
  buildQuadrennialAxisTicks,
  formatRulerMonthLabel,
  formatRulerMonthWithYear,
  isQuadYearJanuary,
} from './timelineRulerTicks';

describe('timelineRulerTicks', () => {
  it('formats month with two-digit year', () => {
    expect(formatRulerMonthWithYear(new Date(2024, 0, 1))).toBe("Jan '24");
    expect(formatRulerMonthWithYear(new Date(2020, 5, 1))).toBe("Jun '20");
  });

  it('marks quad-year January', () => {
    expect(isQuadYearJanuary(new Date(2024, 0, 1))).toBe(true);
    expect(isQuadYearJanuary(new Date(2023, 0, 1))).toBe(false);
  });

  it('uses year suffix only on quad-year January in monthly mode', () => {
    expect(formatRulerMonthLabel(new Date(2024, 0, 1))).toEqual({ label: "Jan '24", major: true });
    expect(formatRulerMonthLabel(new Date(2024, 2, 1))).toEqual({ label: 'Mar', major: false });
    expect(formatRulerMonthLabel(new Date(2023, 0, 1))).toEqual({ label: 'Jan', major: true });
  });

  it('builds quadrennial ticks every 4 years', () => {
    const start = new Date(2019, 6, 1);
    const end = new Date(2027, 0, 1);
    const xOf = (d: Date) => d.getFullYear();
    const ticks = buildQuadrennialAxisTicks(start, end, xOf);
    expect(ticks.map((t) => t.label)).toEqual(["Jan '20", "Jan '24"]);
  });
});
