import { describe, expect, it } from 'vitest';

import { buildLifeStageChapters, type EraEventRow } from './lifeStageChapterService';

const NOW = new Date(2026, 5, 19);
const BIRTH = 1995; // age 31 in 2026

const ev = (id: string, year: number, title?: string, activities?: string[]): EraEventRow => ({
  id,
  title,
  start_time: new Date(year, 0, 15).toISOString(),
  activities,
});

describe('buildLifeStageChapters', () => {
  it('buckets events into the correct life eras by occurrence year', () => {
    const events = [
      ev('a', 2003, 'learned to ride a bike'),   // age 8 → Childhood
      ev('b', 2010, 'first concert'),            // age 15 → Teenage Years
      ev('c', 2014, 'moved to LA'),              // age 19 → Teenage Years
      ev('d', 2018, 'started my company'),       // age 23 → Twenties
      ev('e', 2024, 'got married'),              // age 29 → Twenties
    ];
    const chapters = buildLifeStageChapters(events, BIRTH, NOW);

    const byTitle = Object.fromEntries(chapters.map((c) => [c.chapter_title, c]));
    expect(Object.keys(byTitle).sort()).toEqual(['Childhood', 'Teenage Years', 'Twenties']);
    expect(byTitle['Childhood'].entry_ids).toEqual(['a']);
    expect(byTitle['Teenage Years'].entry_ids).toEqual(['b', 'c']);
    expect(byTitle['Twenties'].entry_ids).toEqual(['d', 'e']);
  });

  it('sets absolute calendar bounds per era', () => {
    const chapters = buildLifeStageChapters([ev('a', 2018)], BIRTH, NOW);
    const twenties = chapters.find((c) => c.chapter_title === 'Twenties')!;
    expect(new Date(twenties.start_date).getFullYear()).toBe(2015); // 1995 + 20
    // End clamps to current year (2026), not 1995 + 29 = 2024... 2024 < 2026 so 2024.
    expect(new Date(twenties.end_date).getFullYear()).toBe(2024);
  });

  it('clamps an in-progress era end to the current year', () => {
    const older = 1990; // age 36 in 2026 → Thirties era is in progress
    const chapters = buildLifeStageChapters([ev('a', 2025)], older, NOW);
    const thirties = chapters.find((c) => c.chapter_title === 'Thirties')!;
    expect(new Date(thirties.start_date).getFullYear()).toBe(2020); // 1990 + 30
    expect(new Date(thirties.end_date).getFullYear()).toBe(2026);   // clamped to now
  });

  it('skips eras with no events and eras not yet reached', () => {
    const chapters = buildLifeStageChapters([ev('a', 2003)], BIRTH, NOW);
    expect(chapters.map((c) => c.chapter_title)).toEqual(['Childhood']);
    // No "Thirties" — user is only 31, and no events there anyway.
    expect(chapters.some((c) => c.chapter_title === 'Thirties')).toBe(false);
  });

  it('derives traits from activities and titles into the summary', () => {
    const events = [
      ev('a', 2018, 'powerlifting meet', ['weightlifting']),
      ev('b', 2019, 'another meet', ['weightlifting']),
    ];
    const twenties = buildLifeStageChapters(events, BIRTH, NOW).find((c) => c.chapter_title === 'Twenties')!;
    expect(twenties.chapter_traits).toContain('weightlifting');
    expect(twenties.summary).toContain('powerlifting meet');
    expect(twenties.summary).toContain('2 memories');
  });

  it('returns nothing without a usable birth year', () => {
    expect(buildLifeStageChapters([ev('a', 2018)], NaN, NOW)).toEqual([]);
  });

  it('returns nothing when there are no events', () => {
    expect(buildLifeStageChapters([], BIRTH, NOW)).toEqual([]);
  });
});
