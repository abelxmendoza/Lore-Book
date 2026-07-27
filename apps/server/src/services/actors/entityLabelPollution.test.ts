import { describe, expect, it } from 'vitest';

import {
  filterEpisodeParticipantNames,
  isPollutingPersonLabel,
  isPollutingPlaceLabel,
  unionThreadMetaLabels,
} from './entityLabelPollution';

describe('entityLabelPollution', () => {
  it('rejects truncated kinship and discourse bleed as people', () => {
    for (const label of ['Cousin in', 'Sibling those', 'Also Obscurios', 'Uncle', 'Mom', 'her house']) {
      expect(isPollutingPersonLabel(label), label).toBe(true);
    }
  });

  it('rejects tools, personas, dates, holidays, and games as people', () => {
    for (const label of [
      'Claude Code',
      'Codex',
      'Cursor',
      'therapist',
      'archivist',
      'June 3rd 2026',
      'Memorial Day',
      'Memorial Day weekend',
      'Magic the Gathering',
      'Gathering',
      'current event',
      'this weekend',
    ]) {
      expect(isPollutingPersonLabel(label), label).toBe(true);
    }
  });

  it('keeps real named people', () => {
    for (const label of ['Marcus', 'Tía Grace', 'James', 'Jerry', 'Abuela']) {
      expect(isPollutingPersonLabel(label), label).toBe(false);
    }
  });

  it('rejects temporal junk as places and keeps venues', () => {
    expect(isPollutingPlaceLabel('this weekend')).toBe(true);
    expect(isPollutingPlaceLabel('current event')).toBe(true);
    expect(isPollutingPlaceLabel('Memorial Day')).toBe(true);
    expect(isPollutingPlaceLabel("Abuela's house")).toBe(false);
    expect(isPollutingPlaceLabel('Northwind Club')).toBe(false);
  });

  it('dedupes Abuela house variants and prefers apostrophe spelling', () => {
    const merged = unionThreadMetaLabels(
      ["Abuelas House", 'her house', 'this weekend'],
      ["Abuela's house", 'Northwind Club'],
      { kind: 'places' },
    );
    expect(merged).toContain("Abuela's house");
    expect(merged).not.toContain('Abuelas House');
    expect(merged).not.toContain('her house');
    expect(merged).not.toContain('this weekend');
    expect(merged).toContain('Northwind Club');
  });

  it('filters episode participant names', () => {
    expect(filterEpisodeParticipantNames(['Tía Grace', 'Cousin in', 'James'])).toEqual([
      'Tía Grace',
      'James',
    ]);
  });
});
