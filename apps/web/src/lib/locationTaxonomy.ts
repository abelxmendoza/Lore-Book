/**
 * Location taxonomy + nesting helpers.
 *
 * Geographic *kind* (country/city/venue) is separate from canonical *place type*
 * (nightclub, gym, restaurant) — see placeTypes.ts.
 */
import type { LocationProfile } from '../components/locations/LocationProfileCard';
import { getPlaceCategory, resolvePlaceType, type PlaceType } from './placeTypes';

export type LocationKind =
  | 'country' | 'state' | 'region' | 'city' | 'neighborhood'
  | 'venue' | 'landmark' | 'nature' | 'other';

export const KIND_META: Record<LocationKind, { label: string; plural: string; color: string; icon: string }> = {
  country:      { label: 'Country',      plural: 'Countries',      color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', icon: '🌍' },
  state:        { label: 'State',        plural: 'States',         color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',       icon: '🗺️' },
  region:       { label: 'Region',       plural: 'Regions',        color: 'bg-sky-500/20 text-sky-300 border-sky-500/40',          icon: '🧭' },
  city:         { label: 'City',         plural: 'Cities',         color: 'bg-teal-500/20 text-teal-300 border-teal-500/40',        icon: '🏙️' },
  neighborhood: { label: 'Neighborhood', plural: 'Neighborhoods',  color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',        icon: '🏘️' },
  venue:        { label: 'Venue',        plural: 'Venues',         color: 'bg-violet-500/20 text-violet-300 border-violet-500/40',  icon: '📍' },
  landmark:     { label: 'Landmark',     plural: 'Landmarks',      color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',     icon: '🗽' },
  nature:       { label: 'Nature',       plural: 'Nature',         color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '🌲' },
  other:        { label: 'Place',        plural: 'Places',         color: 'bg-white/10 text-white/60 border-white/20',              icon: '📌' },
};

const PLACE_TYPE_TO_KIND: Partial<Record<PlaceType, LocationKind>> = {
  country: 'country', state: 'state', region: 'region', city: 'city', neighborhood: 'neighborhood', landmark: 'landmark',
  park: 'nature', beach: 'nature', hiking_trail: 'nature', campground: 'nature', national_park: 'nature',
  dog_park: 'nature', botanical_garden: 'nature',
};

const CATEGORY_DEFAULT_KIND: Partial<Record<string, LocationKind>> = {
  geographic: 'city',
  outdoors: 'nature',
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
  forest: 'nature', nature: 'nature', outdoors: 'nature', outdoor: 'nature', home: 'venue',
};

/** Classify geographic nesting kind from place type + legacy fields. */
export function classifyLocation(loc: Pick<LocationProfile, 'name' | 'type' | 'address' | 'city' | 'region' | 'country'>): LocationKind {
  const resolved = resolvePlaceType(loc.type, loc.name);
  if (resolved) {
    if (PLACE_TYPE_TO_KIND[resolved]) return PLACE_TYPE_TO_KIND[resolved]!;
    const cat = getPlaceCategory(resolved);
    if (cat && CATEGORY_DEFAULT_KIND[cat]) return CATEGORY_DEFAULT_KIND[cat]!;
    if (cat === 'geographic') return 'city';
    return 'venue';
  }

  const raw = (loc.type ?? '').toLowerCase().trim();
  if (raw && LEGACY_TYPE_MAP[raw]) return LEGACY_TYPE_MAP[raw];
  for (const token of raw.split(/[\s/_-]+/)) {
    if (LEGACY_TYPE_MAP[token]) return LEGACY_TYPE_MAP[token];
  }

  const name = loc.name ?? '';
  if (/\b(park|trail|beach|mountain|lake|forest|river|canyon|falls|garden)\b/i.test(name)) return 'nature';
  if (/\b(cafe|coffee|restaurant|bar|pub|grill|diner|bistro|eatery|club|gym|studio|office|gallery|theater|theatre|arena|stadium|hotel|airport|library|store|shop|mall|market|university|college|campus|school)\b/i.test(name)) {
    return 'venue';
  }
  if (/\b(museum|monument|memorial|cathedral|tower|bridge|landmark)\b/i.test(name)) return 'landmark';
  if (loc.address && /\d/.test(loc.address)) return 'venue';
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
