import { describe, expect, it } from 'vitest';

import {
  applyCanonicalEntityTypeAuthority,
  filterEpisodeParticipantNames,
  isPollutingPersonLabel,
  isPollutingPlaceLabel,
  unionThreadMetaLabels,
} from './entityLabelPollution';

describe('entityLabelPollution', () => {
  it('rejects truncated kinship and discourse bleed as people', () => {
    for (const label of ['Cousin in', 'Sibling those', 'Also Obscurios', 'Uncle', 'Mom', 'her house', 'Yuli. She']) {
      expect(isPollutingPersonLabel(label), label).toBe(true);
    }
  });

  it('rejects academic and community collectives as individual people', () => {
    expect(isPollutingPersonLabel('Computer Science majors')).toBe(true);
    expect(isPollutingPersonLabel('Goth Clubs')).toBe(true);
    expect(isPollutingPlaceLabel('Computer Science')).toBe(true);
    expect(isPollutingPersonLabel("I've")).toBe(true);
    expect(isPollutingPersonLabel('Relationships')).toBe(true);
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
    for (const label of [
      'Marcus',
      'Tía Grace',
      'James',
      'Jerry',
      'Abuela',
      'Neon Pixie from the Underground Scene',
    ]) {
      expect(isPollutingPersonLabel(label), label).toBe(false);
    }
  });

  it('rejects temporal junk as places and keeps venues', () => {
    expect(isPollutingPlaceLabel('this weekend')).toBe(true);
    expect(isPollutingPlaceLabel('current event')).toBe(true);
    expect(isPollutingPlaceLabel('Memorial Day')).toBe(true);
    expect(isPollutingPlaceLabel('MMA')).toBe(true);
    expect(isPollutingPlaceLabel("Abuela's house")).toBe(false);
    expect(isPollutingPlaceLabel('Northwind Club')).toBe(false);
  });

  it('removes a discourse prefix without dropping the person', () => {
    expect(unionThreadMetaLabels([], ['Yeah Johnny'], { kind: 'people' })).toEqual(['Johnny']);
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

  it('repairs sentence-boundary bleed while merging thread people', () => {
    expect(unionThreadMetaLabels(['Yuli. She', 'Goth Clubs'], ['Elvis'], { kind: 'people' }))
      .toEqual(['Yuli', 'Elvis']);
  });

  it('filters episode participant names', () => {
    expect(filterEpisodeParticipantNames(['Tía Grace', 'Cousin in', 'Yuli. She', 'James'])).toEqual([
      'Tía Grace',
      'Yuli',
      'James',
    ]);
  });

  it('treats her friend as pollution for People chips', () => {
    expect(isPollutingPersonLabel('her friend')).toBe(true);
    expect(
      unionThreadMetaLabels(['Maya', 'her friend'], undefined, { kind: 'people' }),
    ).toEqual(['Maya']);
  });

  it('drops a canonical person from Places', () => {
    const typed = applyCanonicalEntityTypeAuthority(
      ['Maya', 'Priya'],
      ['Priya', 'Northwind Depot'],
    );
    expect(typed.people).toEqual(['Maya', 'Priya']);
    expect(typed.places).toEqual(['Northwind Depot']);
  });
});
