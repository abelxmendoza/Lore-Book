import { describe, it, expect } from 'vitest';

import {
  detectSlangToponym,
  inferSlangToponymReferent,
  type SlangReferentCandidate,
} from './slangToponymResolver';

const ANIME_EXPO: SlangReferentCandidate = {
  id: 'ev-ax',
  kind: 'event',
  name: 'Anime Expo',
  summary: 'Anime convention at the LA Convention Center every 4th of July.',
  annualRecurrence: { month: 7, day: 4 },
  occurredDates: ['2026-07-04T18:00:00Z'],
  lastMentionedAt: '2026-07-05T00:00:00Z',
};

const LA_CONVENTION_CENTER: SlangReferentCandidate = {
  id: 'loc-lacc',
  kind: 'place',
  name: 'LA Convention Center',
  summary: 'Downtown LA venue.',
};

const SELF_MADE: SlangReferentCandidate = {
  id: 'loc-selfmade',
  kind: 'place',
  name: 'Self Made',
  summary: 'Ska venue.',
  tags: ['ska'],
};

describe('detectSlangToponym', () => {
  it('detects culture-modifier toponyms', () => {
    for (const name of ['Weeb City', 'weeb city', 'Goth Town', 'Nerd Central', 'Ska Land']) {
      const d = detectSlangToponym(name);
      expect(d.isSlangToponym, name).toBe(true);
    }
  });

  it('expands the culture theme ("weeb" → anime/expo/con)', () => {
    const d = detectSlangToponym('Weeb City');
    expect(d.modifier).toBe('weeb');
    expect(d.themeTokens).toContain('anime');
    expect(d.themeTokens).toContain('expo');
  });

  it('never flags real city names', () => {
    for (const name of ['New York City', 'Kansas City', 'Studio City', 'Salt Lake City', 'Mexico City']) {
      expect(detectSlangToponym(name).isSlangToponym, name).toBe(false);
    }
  });

  it('requires a geo head noun', () => {
    expect(detectSlangToponym('Weeb Convention').isSlangToponym).toBe(false);
    expect(detectSlangToponym('Anime Expo').isSlangToponym).toBe(false);
  });

  it('ignores single tokens and long spans', () => {
    expect(detectSlangToponym('City').isSlangToponym).toBe(false);
    expect(detectSlangToponym('the weeb city of greater los angeles county').isSlangToponym).toBe(false);
  });
});

describe('inferSlangToponymReferent', () => {
  it('"Weeb City" tweeted on July 4th auto-aliases to Anime Expo (theme + temporal)', () => {
    const r = inferSlangToponymReferent({
      name: 'Weeb City',
      sourceDate: '2026-07-04T20:00:00Z',
      candidates: [ANIME_EXPO, LA_CONVENTION_CENTER, SELF_MADE],
    });
    expect(r.disposition).toBe('auto_alias');
    expect(r.target?.id).toBe('ev-ax');
    expect(r.signals).toContain('theme_in_name:anime');
    expect(r.signals.some((s) => s === 'occurred_near_source_date' || s === 'annual_recurrence_window')).toBe(true);
  });

  it('matches the annual recurrence window in later years', () => {
    const r = inferSlangToponymReferent({
      name: 'Weeb City',
      sourceDate: '2027-07-03T20:00:00Z',
      candidates: [{ ...ANIME_EXPO, occurredDates: [], lastMentionedAt: null }],
    });
    expect(r.disposition).toBe('auto_alias');
    expect(r.signals).toContain('annual_recurrence_window');
  });

  it('theme-only match (no temporal corroboration) lands in review, not auto', () => {
    const r = inferSlangToponymReferent({
      name: 'Weeb City',
      sourceDate: '2026-02-10T00:00:00Z',
      candidates: [{ ...ANIME_EXPO, occurredDates: [], annualRecurrence: null, lastMentionedAt: null }],
    });
    expect(r.disposition).toBe('review');
    expect(r.target?.id).toBe('ev-ax');
  });

  it('theme affinity picks the right subculture referent', () => {
    const r = inferSlangToponymReferent({
      name: 'Ska Land',
      sourceDate: '2026-07-04T20:00:00Z',
      candidates: [ANIME_EXPO, SELF_MADE],
    });
    expect(r.target?.id).toBe('loc-selfmade');
  });

  it('returns none with no thematic candidates', () => {
    const r = inferSlangToponymReferent({
      name: 'Weeb City',
      candidates: [SELF_MADE],
    });
    expect(r.disposition).toBe('none');
    expect(r.matched).toBe(false);
  });

  it('returns none for non-slang names', () => {
    const r = inferSlangToponymReferent({
      name: 'Kansas City',
      sourceDate: '2026-07-04T00:00:00Z',
      candidates: [ANIME_EXPO],
    });
    expect(r.disposition).toBe('none');
  });
});
