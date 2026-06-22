import {
  BRAND_STORES,
  KNOWN_CITIES,
  PLACE_PREPOSITIONS,
} from '../../lexical/places/placeSuggestionTypes';
import { resolvePlaceBoundary } from '../../lexical/places/placeBoundaryResolver';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { LocationCandidate } from './locationInferenceTypes';
import { buildLocationContext } from './locationProvenanceService';

const COUNTRIES = new Set(['japan', 'mexico', 'canada', 'france', 'germany', 'korea', 'china', 'brazil']);

const COUNTRY_RE =
  /\b(?:visit|visited|travel(?:ed)?\s+to|went\s+to|live(?:d)?\s+in|from)\s+(Japan|Mexico|Canada|France|Germany|Korea|China|Brazil)\b/gi;

const CITY_RE =
  /\b(LA|Los Angeles|Moreno Valley|Riverside|Anaheim|San Diego|Long Beach|Irvine|Orange|Hollywood)\b/g;

const BRAND_RE =
  /\b(walmart|costco|target|cvs|walgreens|whole foods|trader joe'?s?|starbucks|mcdonald'?s?|home depot|lowe'?s?|safeway|kroger|aldi)\b/gi;

const CLUB_VENUE_RE = /\b(Club\s+[A-Z][A-Za-z]+)\b/g;

const BARE_GENERIC_PLACES = new Set([
  'house',
  'store',
  'school',
  'gym',
  'club',
  'there',
  'here',
  'around the corner',
  'nearby',
  'last night',
]);

export function isBareGenericPlace(name: string): boolean {
  return BARE_GENERIC_PLACES.has(normalizeNameKey(name));
}

function pushCandidate(
  out: LocationCandidate[],
  seen: Set<string>,
  displayName: string,
  locationType: LocationCandidate['locationType'],
  text: string,
  evidence: string,
  confidence: number,
): void {
  const boundary = resolvePlaceBoundary(displayName);
  const cleaned = boundary.text.trim();
  if (!cleaned || isBareGenericPlace(cleaned)) return;

  const key = normalizeNameKey(cleaned);
  if (seen.has(key)) return;
  seen.add(key);

  out.push({
    displayName: cleaned,
    locationType,
    context: buildLocationContext(text, cleaned),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    needsResolution: false,
    requiresReview: false,
    promotionStatus: confidence >= 0.85 ? 'suggested_location' : 'candidate',
  });
}

export function inferNamedPlaces(text: string): LocationCandidate[] {
  const out: LocationCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  const countryRe = new RegExp(COUNTRY_RE.source, 'gi');
  while ((match = countryRe.exec(text)) !== null) {
    const country = match[1] ?? match[0];
    pushCandidate(out, seen, country, 'country', text, match[0], 0.88);
  }

  const cityRe = new RegExp(CITY_RE.source, 'g');
  while ((match = cityRe.exec(text)) !== null) {
    const name = match[1];
    const type = normalizeNameKey(name) === 'hollywood' ? 'neighborhood' : 'city';
    pushCandidate(out, seen, name, type, text, match[0], 0.87);
  }

  const brandRe = new RegExp(BRAND_RE.source, 'gi');
  while ((match = brandRe.exec(text)) !== null) {
    const name = match[1];
    const key = normalizeNameKey(name);
    if (!BRAND_STORES.has(key)) continue;
    pushCandidate(out, seen, name, 'store', text, match[0], 0.92);
  }

  const clubRe = new RegExp(CLUB_VENUE_RE.source, 'g');
  while ((match = clubRe.exec(text)) !== null) {
    if (!PLACE_PREPOSITIONS.test(text)) continue;
    pushCandidate(out, seen, match[1], 'music_venue', text, match[0], 0.82);
  }

  return out;
}

export function isKnownCityToken(name: string): boolean {
  return KNOWN_CITIES.has(normalizeNameKey(name));
}

export function isKnownCountryToken(name: string): boolean {
  return COUNTRIES.has(normalizeNameKey(name));
}
