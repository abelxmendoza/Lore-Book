import { normalizeNameKey } from '../../utils/nameNormalization';
import type { PlaceCanonicalResolution, PlaceEntityKind } from './placeTypes';

type CanonEntry = {
  aliases: string[];
  canonical: string;
  subtype?: string;
  entityKind?: PlaceEntityKind;
};

const CANONICAL_REGISTRY: CanonEntry[] = [
  {
    aliases: ['usc', 'university of southern california'],
    canonical: 'University of Southern California',
    subtype: 'university',
    entityKind: 'PLACE',
  },
  {
    aliases: ['csuf', 'cal state fullerton', 'california state university fullerton', 'california state university, fullerton'],
    canonical: 'California State University, Fullerton',
    subtype: 'university',
    entityKind: 'PLACE',
  },
  {
    aliases: ['ucla', 'university of california los angeles', 'university of california, los angeles'],
    canonical: 'University of California, Los Angeles',
    subtype: 'university',
    entityKind: 'PLACE',
  },
  {
    aliases: ['ax', 'anime expo'],
    canonical: 'Anime Expo',
    subtype: 'convention',
    entityKind: 'EVENT',
  },
  {
    aliases: ['dtla', 'downtown la', 'downtown los angeles'],
    canonical: 'Downtown Los Angeles',
    subtype: 'district',
    entityKind: 'PLACE',
  },
  {
    aliases: ['stanford', 'stanford university'],
    canonical: 'Stanford University',
    subtype: 'university',
    entityKind: 'PLACE',
  },
  {
    aliases: ['catch one', 'catch one the club'],
    canonical: 'Catch One',
    subtype: 'nightclub',
    entityKind: 'PLACE',
  },
  {
    aliases: ['club metro'],
    canonical: 'Club Metro',
    subtype: 'nightclub',
    entityKind: 'PLACE',
  },
  {
    aliases: ['first street pool', 'first street pool & billiards', 'first street pool and billiards'],
    canonical: 'First Street Pool & Billiards',
    subtype: 'pool_hall',
    entityKind: 'PLACE',
  },
];

const EVENT_SERIES = new Set(['code red', 'klub nocturno', 'lick n dip']);

const GENERIC_PLACE_NOUNS = new Set([
  'warehouse',
  'office',
  'lab',
  'the lab',
  'school',
  'gym',
  'restaurant',
  'parking lot',
  'hallway',
  'classroom',
  'building',
  'the warehouse',
  'the office',
  'the gym',
  'the school',
  'the restaurant',
  'the building',
]);

export function isGenericPlaceNoun(name: string): boolean {
  return GENERIC_PLACE_NOUNS.has(normalizeNameKey(name));
}

export function resolvePlaceCanonical(span: string, proposedType?: string): PlaceCanonicalResolution {
  const key = normalizeNameKey(span);
  const rulesFired: string[] = [];

  if (EVENT_SERIES.has(key)) {
    rulesFired.push('event_series_registry');
    return {
      canonicalTitle: span.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
      aliases: [span.trim()],
      subtype: 'event_series',
      entityKind: 'EVENT_SERIES',
      rulesFired,
    };
  }

  for (const entry of CANONICAL_REGISTRY) {
    if (entry.aliases.some((alias) => normalizeNameKey(alias) === key)) {
      rulesFired.push('canonical_registry');
      return {
        canonicalTitle: entry.canonical,
        aliases: [...new Set([entry.canonical, ...entry.aliases.map((a) => a)])],
        subtype: entry.subtype ?? proposedType,
        entityKind: entry.entityKind ?? 'PLACE',
        rulesFired,
      };
    }
  }

  if (isGenericPlaceNoun(span)) {
    rulesFired.push('generic_place_noun');
    return {
      canonicalTitle: span.trim().toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      aliases: [span.trim()],
      subtype: proposedType ?? 'generic',
      entityKind: 'GENERIC_REFERENCE',
      rulesFired,
    };
  }

  // Known nightlife venues — keep proper casing, force venue subtype when bare name.
  if (/^(?:catch\s+one|bad\s+dogg\s+compound)$/i.test(span.trim())) {
    rulesFired.push('known_venue_lexicon');
    const title = span.trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bOf\b/, 'of');
    // Preserve "Catch One" / "Bad Dogg Compound" conventional casing
    const canonicalTitle = /catch\s+one/i.test(span)
      ? 'Catch One'
      : /bad\s+dogg\s+compound/i.test(span)
        ? 'Bad Dogg Compound'
        : title;
    return {
      canonicalTitle,
      aliases: [canonicalTitle],
      subtype: /catch\s+one/i.test(span) ? 'nightclub' : 'event_space',
      entityKind: 'PLACE',
      rulesFired,
    };
  }

  rulesFired.push('passthrough');
  return {
    canonicalTitle: span.trim(),
    aliases: [span.trim()],
    subtype: proposedType,
    entityKind: 'PLACE',
    rulesFired,
  };
}
