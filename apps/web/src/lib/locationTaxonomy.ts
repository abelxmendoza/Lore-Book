/**
 * Location taxonomy + nesting helpers.
 *
 * Geographic *kind* (country/city/residence/venue) is separate from canonical *place type*
 * (nightclub, gym, restaurant) — see placeTypes.ts.
 */
import type { LocationProfile } from '../components/locations/LocationProfileCard';
import { getPlaceCategory, PLACE_TAXONOMY, resolvePlaceType, type PlaceType } from './placeTypes';

export type LocationKind =
  | 'country' | 'state' | 'region' | 'city' | 'neighborhood'
  | 'residence' | 'venue' | 'landmark' | 'nature' | 'other';

export const KIND_META: Record<LocationKind, { label: string; plural: string; color: string; icon: string }> = {
  country:      { label: 'Country',      plural: 'Countries',      color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', icon: '🌍' },
  state:        { label: 'State',        plural: 'States',         color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',       icon: '🗺️' },
  region:       { label: 'Region',       plural: 'Regions',        color: 'bg-sky-500/20 text-sky-300 border-sky-500/40',          icon: '🧭' },
  city:         { label: 'City',         plural: 'Cities',         color: 'bg-teal-500/20 text-teal-300 border-teal-500/40',        icon: '🏙️' },
  neighborhood: { label: 'Neighborhood', plural: 'Neighborhoods',  color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',        icon: '🏘️' },
  residence:    { label: 'Home',         plural: 'Homes',          color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',  icon: '🏠' },
  venue:        { label: 'Venue',        plural: 'Venues',         color: 'bg-violet-500/20 text-violet-300 border-violet-500/40',  icon: '📍' },
  landmark:     { label: 'Landmark',     plural: 'Landmarks',      color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',     icon: '🗽' },
  nature:       { label: 'Nature',       plural: 'Nature',         color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '🌲' },
  other:        { label: 'Place',        plural: 'Places',         color: 'bg-white/10 text-white/60 border-white/20',              icon: '📌' },
};

/** Personal homes — not nightlife / show venues unless explicitly tagged as such. */
const RESIDENCE_PLACE_TYPES = new Set<PlaceType>([
  'house', 'apartment', 'condo', 'dormitory', 'shelter',
  'fraternity_house', 'sorority_house',
]);

const PLACE_TYPE_TO_KIND: Partial<Record<PlaceType, LocationKind>> = {
  country: 'country', state: 'state', region: 'region', city: 'city', neighborhood: 'neighborhood', landmark: 'landmark',
  park: 'nature', beach: 'nature', hiking_trail: 'nature', campground: 'nature', national_park: 'nature',
  dog_park: 'nature', botanical_garden: 'nature',
  museum: 'landmark', art_gallery: 'landmark', historic_site: 'landmark', cultural_center: 'landmark',
  church: 'landmark', temple: 'landmark', mosque: 'landmark', synagogue: 'landmark', shrine: 'landmark', monastery: 'landmark',
  hotel: 'other', motel: 'other', airbnb: 'other', rv_park: 'other',
  ...Object.fromEntries([...RESIDENCE_PLACE_TYPES].map((t) => [t, 'residence' as LocationKind])),
};

const CATEGORY_DEFAULT_KIND: Partial<Record<string, LocationKind>> = {
  geographic: 'city',
  outdoors: 'nature',
  residential: 'residence',
  religion: 'landmark',
  culture_community: 'landmark',
  food_drink: 'venue',
  nightlife: 'venue',
  music_entertainment: 'venue',
  fitness_sports: 'venue',
  education: 'venue',
  work_business: 'venue',
  technology: 'venue',
  shopping: 'venue',
  transportation: 'venue',
  healthcare: 'venue',
  government: 'venue',
  events: 'venue',
  social: 'venue',
};

const LEGACY_TYPE_MAP: Record<string, LocationKind> = {
  country: 'country', nation: 'country',
  state: 'state', province: 'state',
  region: 'region', area: 'region', county: 'region', territory: 'region',
  city: 'city', town: 'city', municipality: 'city', village: 'city',
  neighborhood: 'neighborhood', district: 'neighborhood', borough: 'neighborhood', suburb: 'neighborhood',
  venue: 'venue', business: 'venue', restaurant: 'venue', cafe: 'venue', bar: 'venue',
  shop: 'venue', store: 'venue', office: 'venue', gym: 'venue', studio: 'venue', school: 'venue',
  landmark: 'landmark', monument: 'landmark', attraction: 'landmark',
  park: 'nature', trail: 'nature', beach: 'nature', mountain: 'nature', lake: 'nature',
  forest: 'nature', nature: 'nature', outdoors: 'nature', outdoor: 'nature',
  home: 'residence', house: 'residence', apartment: 'residence', condo: 'residence', residence: 'residence',
  residential: 'residence',
};

const SHOW_VENUE_RE =
  /\b(night\s?club|nightclub|concert|music\s?venue|show\s?venue|club\s?metro|goth\s?club|dance\s?club|rave|festival|arena|stadium|theater|theatre)\b/i;

/** Names like "Abuela's House", "Grandma's home", "Tía Grace's apartment". */
export function looksLikeResidentialPlaceName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (SHOW_VENUE_RE.test(n)) return false;
  // "House Show at …" is an event/venue context, not a home address.
  if (/\bhouse\s+show\b/i.test(n)) return false;
  if (/\b(house|home|apartment|apt|condo|flat|casa|duplex|townhouse|residence)\b/i.test(n)) return true;
  if (/[''']s?\s+(house|home|apartment|apt|condo|flat|casa)\b/i.test(n)) return true;
  if (/\b(my|our|family)\s+(house|home|apartment|place)\b/i.test(n)) return true;
  return false;
}

/** Classify geographic nesting kind from place type + legacy fields. */
export function classifyLocation(loc: Pick<LocationProfile, 'name' | 'type' | 'address' | 'city' | 'region' | 'country'>): LocationKind {
  const name = loc.name ?? '';

  if (looksLikeResidentialPlaceName(name)) return 'residence';

  const resolved = resolvePlaceType(loc.type, loc.name);
  if (resolved) {
    if (PLACE_TYPE_TO_KIND[resolved]) return PLACE_TYPE_TO_KIND[resolved]!;
    const cat = getPlaceCategory(resolved);
    if (cat && CATEGORY_DEFAULT_KIND[cat]) return CATEGORY_DEFAULT_KIND[cat]!;
    if (cat === 'geographic') return 'city';
    return 'other';
  }

  const raw = (loc.type ?? '').toLowerCase().trim();
  if (raw && LEGACY_TYPE_MAP[raw]) return LEGACY_TYPE_MAP[raw];
  for (const token of raw.split(/[\s/_-]+/)) {
    if (LEGACY_TYPE_MAP[token]) return LEGACY_TYPE_MAP[token];
  }

  if (/\b(park|trail|beach|mountain|lake|forest|river|canyon|falls|garden)\b/i.test(name)) return 'nature';
  if (/\b(cafe|coffee|restaurant|bar|pub|grill|diner|bistro|eatery|club|gym|studio|office|gallery|theater|theatre|arena|stadium|hotel|airport|library|store|shop|mall|market|university|college|campus|school)\b/i.test(name)) {
    return 'venue';
  }
  if (/\b(museum|monument|memorial|cathedral|tower|bridge|landmark)\b/i.test(name)) return 'landmark';
  return 'other';
}

export interface HierarchyPart { name: string; field: 'city' | 'region' | 'country' }

/** The "part of" breadcrumb (broadest → nearest), excluding the location itself. */
export function locationHierarchy(loc: Pick<LocationProfile, 'name' | 'city' | 'region' | 'country'>): HierarchyPart[] {
  const self = (loc.name ?? '').toLowerCase();
  const parts: HierarchyPart[] = [];
  const push = (val: string | null | undefined, field: HierarchyPart['field']) => {
    const v = val?.trim();
    if (v && v.toLowerCase() !== self && !parts.some(p => p.name.toLowerCase() === v.toLowerCase())) {
      parts.push({ name: v, field });
    }
  };
  push(loc.country, 'country');
  push(loc.region, 'region');
  push(loc.city, 'city');
  return parts;
}

/**
 * Locations nested directly within `loc` — i.e. places whose city/region/country
 * names this location. Returns the closest containment match per child.
 */
export function computeChildren(loc: LocationProfile, all: LocationProfile[]): LocationProfile[] {
  const target = (loc.name ?? '').toLowerCase().trim();
  if (!target) return [];
  return all
    .filter(other => other.id !== loc.id)
    .filter(other => {
      const fields = [other.city, other.region, other.country].map(f => (f ?? '').toLowerCase().trim());
      return fields.includes(target);
    })
    .sort((a, b) => b.visitCount - a.visitCount);
}

/** Export residential place types for server-side sync. */
export { RESIDENCE_PLACE_TYPES, PLACE_TAXONOMY };
