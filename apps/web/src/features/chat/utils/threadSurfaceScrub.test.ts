import { describe, expect, it } from 'vitest';
import {
  applyCanonicalEntityTypeAuthority,
  isCastDisplayWorthy,
  scrubPeopleLabels,
  scrubPlacesLabels,
  scrubSummaryDisplayLine,
  dedupeCastDisplayEntries,
} from './threadSurfaceScrub';

describe('threadSurfaceScrub', () => {
  it('drops polluted people and dedupes place spellings', () => {
    expect(scrubPeopleLabels(['Jamie', 'Cousin in', 'new guy', 'James'])).toEqual([
      'Jamie',
      'James',
    ]);
    expect(
      scrubPlacesLabels(["Abuelas House", "Abuela's house", 'this weekend', 'her house']),
    ).toEqual(["Abuela's house"]);
  });

  it('drops a canonical person from Places and her friend from People', () => {
    expect(scrubPeopleLabels(['Maya', 'her friend', 'Priya'])).toEqual(['Maya', 'Priya']);
    expect(
      applyCanonicalEntityTypeAuthority(['Maya', 'Priya'], ['Priya', 'Northwind Depot']).places,
    ).toEqual(['Northwind Depot']);
  });

  it('rewrites summary People/Places clauses', () => {
    expect(
      scrubSummaryDisplayLine(
        'People: Jamie, Cousin in. Places: Abuelas House, Northwind Club.',
        ['Jamie'],
        ["Abuela's house"],
      ),
    ).toBe("People: Jamie. Places: Abuela's house.");
  });

  it('drops leftover person fragments after the first People period', () => {
    expect(
      scrubSummaryDisplayLine(
        'People: Jamie, Marcus, DJ Night, Mr. Chino. Chino. Chino. Places: Northwind Depot, Northwind Club, Goth club.',
        ['Jamie', 'Marcus', 'DJ Night', 'Mr. Chino'],
        ['Northwind Depot', 'Northwind Club', 'Goth club'],
      ),
    ).toBe(
      'People: Jamie, Marcus, DJ Night, Mr. Chino. Places: Northwind Depot, Northwind Club, Goth club.',
    );
  });

  it('keeps people on cast and drops places / junk', () => {
    expect(isCastDisplayWorthy('Jamie', 'character')).toBe(true);
    expect(isCastDisplayWorthy("Abuela's house", 'location')).toBe(false);
    expect(isCastDisplayWorthy('Costco', 'organization')).toBe(false);
    expect(isCastDisplayWorthy('June 3rd 2026', 'character')).toBe(false);
  });

  it('dedupes cast twins and descriptor tails for display', () => {
    expect(
      dedupeCastDisplayEntries([
        { name: 'Goth Tio', mentions: 1 },
        { name: 'Goth Tio', mentions: 2 },
        { name: 'Neon Pixie', mentions: 1 },
        { name: 'Neon Pixie from the Underground Scene', mentions: 1 },
      ]).map((e) => e.name),
    ).toEqual(['Goth Tio', 'Neon Pixie']);
  });

  it('strips "the Epithet" tails from cast chips', () => {
    expect(
      dedupeCastDisplayEntries([
        { name: 'Aunt Maribel the Hallway Guardian', mentions: 1 },
        { name: 'Aunt Maribel', mentions: 2 },
      ]),
    ).toEqual([{ name: 'Aunt Maribel the Hallway Guardian', mentions: 1 }]);
  });
});
