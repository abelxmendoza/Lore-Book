/**
 * LoreBook place taxonomy — Type + Tags model.
 *
 * `locations.type` stores a canonical PlaceType slug.
 * Flexible scene/context labels live in `metadata.place_tags`.
 * Personal meaning (childhood home, favorite spot) in `metadata.place_significance`.
 */

export const PLACE_TAXONOMY = {
  residential: [
    'house', 'apartment', 'condo', 'dormitory', 'hotel', 'motel', 'airbnb', 'rv_park', 'shelter',
  ],
  food_drink: [
    'restaurant', 'fast_food', 'food_truck', 'cafe', 'coffee_shop', 'bakery', 'bar', 'brewery',
    'winery', 'distillery', 'lounge', 'tea_house',
  ],
  nightlife: [
    'nightclub', 'dance_club', 'goth_club', 'edm_venue', 'rave_venue', 'karaoke_bar', 'dive_bar',
    'speakeasy', 'strip_club', 'hookah_lounge',
  ],
  music_entertainment: [
    'concert_venue', 'music_venue', 'arena', 'stadium', 'amphitheater', 'opera_house', 'jazz_club',
    'comedy_club', 'theater', 'cinema', 'drive_in_theater',
  ],
  fitness_sports: [
    'gym', 'martial_arts_gym', 'bjj_academy', 'boxing_gym', 'muay_thai_gym', 'mma_gym',
    'yoga_studio', 'crossfit_gym', 'climbing_gym', 'swimming_pool', 'sports_complex', 'golf_course',
  ],
  education: [
    'elementary_school', 'middle_school', 'high_school', 'trade_school', 'college', 'university',
    'library', 'research_lab',
  ],
  work_business: [
    'office', 'factory', 'warehouse', 'retail_store', 'startup', 'corporate_campus',
    'coworking_space', 'robotics_lab', 'makerspace', 'data_center',
  ],
  technology: [
    'server_room', 'ai_lab', 'electronics_lab', 'testing_facility', 'clean_room', 'fabrication_facility',
  ],
  shopping: [
    'mall', 'shopping_center', 'grocery_store', 'convenience_store', 'flea_market', 'farmers_market',
    'department_store', 'bookstore',
  ],
  transportation: [
    'airport', 'train_station', 'bus_station', 'subway_station', 'harbor', 'marina',
    'parking_structure', 'ev_charging_station',
  ],
  healthcare: [
    'hospital', 'clinic', 'urgent_care', 'pharmacy', 'dentist', 'veterinary_clinic',
  ],
  government: [
    'courthouse', 'police_station', 'fire_station', 'dmv', 'post_office', 'embassy', 'city_hall',
  ],
  culture_community: [
    'museum', 'art_gallery', 'historic_site', 'cultural_center', 'community_center',
  ],
  outdoors: [
    'park', 'beach', 'hiking_trail', 'campground', 'national_park', 'dog_park', 'botanical_garden',
  ],
  religion: [
    'church', 'temple', 'mosque', 'synagogue', 'shrine', 'monastery',
  ],
  events: [
    'convention_center', 'expo_hall', 'festival_grounds', 'fairgrounds', 'conference_venue',
  ],
  social: [
    'community_center', 'clubhouse', 'fraternity_house', 'sorority_house', 'meetup_space',
  ],
  geographic: [
    'country', 'state', 'region', 'city', 'neighborhood', 'landmark',
  ],
} as const;

export type PlaceCategory = keyof typeof PLACE_TAXONOMY;
export type PlaceType = (typeof PLACE_TAXONOMY)[PlaceCategory][number];

export const PLACE_SIGNIFICANCE_TYPES = [
  'home', 'childhood_home', 'favorite_spot', 'first_date_location', 'workplace',
  'former_workplace', 'school', 'former_school', 'training_gym', 'hangout_spot',
  'creative_space', 'safe_place', 'avoided_place', 'breakup_location', 'former_home',
  'bucket_list_place', 'celebration_spot', 'story_location',
] as const;

export type PlaceSignificance = (typeof PLACE_SIGNIFICANCE_TYPES)[number];

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  residential: 'Residential',
  food_drink: 'Food & Drink',
  nightlife: 'Nightlife',
  music_entertainment: 'Music & Entertainment',
  fitness_sports: 'Fitness & Sports',
  education: 'Education',
  work_business: 'Work & Business',
  technology: 'Technology',
  shopping: 'Shopping',
  transportation: 'Transportation',
  healthcare: 'Healthcare',
  government: 'Government',
  culture_community: 'Culture & Community',
  outdoors: 'Outdoors',
  religion: 'Religion',
  events: 'Events',
  social: 'Social',
  geographic: 'Geographic',
};

export const PLACE_SIGNIFICANCE_LABELS: Record<PlaceSignificance, string> = {
  home: 'Home',
  childhood_home: 'Childhood Home',
  favorite_spot: 'Favorite Spot',
  first_date_location: 'First Date Location',
  workplace: 'Workplace',
  former_workplace: 'Former Workplace',
  school: 'School',
  former_school: 'Former School',
  training_gym: 'Training Gym',
  hangout_spot: 'Hangout Spot',
  creative_space: 'Creative Space',
  safe_place: 'Safe Place',
  avoided_place: 'Avoided Place',
  breakup_location: 'Breakup Location',
  former_home: 'Former Home',
  bucket_list_place: 'Bucket List Place',
  celebration_spot: 'Celebration Spot',
  story_location: 'Story Location',
};

/** Book filter tabs — category + personal significance */
export type PlaceFilterCategory = PlaceCategory | 'personal' | 'all';

export const PLACE_BOOK_FILTERS: Array<{ id: PlaceFilterCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'residential', label: 'Residential' },
  { id: 'food_drink', label: 'Food & Drink' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'music_entertainment', label: 'Music' },
  { id: 'fitness_sports', label: 'Fitness' },
  { id: 'education', label: 'Education' },
  { id: 'work_business', label: 'Work' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'transportation', label: 'Transit' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'culture_community', label: 'Culture' },
  { id: 'outdoors', label: 'Outdoors' },
  { id: 'events', label: 'Events' },
  { id: 'social', label: 'Social' },
  { id: 'personal', label: 'Personal' },
];

export type PlaceLifestyleFilter = 'all' | 'work' | 'home' | 'social' | 'travel' | 'nature';

export const PLACE_LIFESTYLE_FILTERS: Array<{ id: PlaceLifestyleFilter; label: string; icon: string }> = [
  { id: 'all', label: 'All', icon: '🌐' },
  { id: 'work', label: 'Work', icon: '💼' },
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'social', label: 'Social', icon: '🍻' },
  { id: 'travel', label: 'Travel', icon: '✈️' },
  { id: 'nature', label: 'Nature', icon: '🌲' },
];

export type PlaceAdvancedFilter =
  | PlaceCategory
  | 'music_venues'
  | 'martial_arts'
  | 'parks'
  | 'culture'
  | 'favorites'
  | 'meaningful'
  | 'most_visited'
  | 'with_people'
  | 'frequently_mentioned'
  | 'story_locations'
  | 'celebration_spots'
  | 'breakup_locations'
  | 'career_locations'
  | 'training_locations'
  | 'music_scene_locations'
  | 'childhood_locations'
  | 'former_homes'
  | 'bucket_list_places';

export const PLACE_ADVANCED_FILTER_GROUPS: Array<{
  label: string;
  filters: Array<{ id: PlaceAdvancedFilter; label: string; icon?: string }>;
}> = [
  {
    label: 'Place Types',
    filters: [
      { id: 'food_drink', label: 'Food & Drink' },
      { id: 'nightlife', label: 'Nightlife' },
      { id: 'music_venues', label: 'Music Venues' },
      { id: 'fitness_sports', label: 'Gyms & Sports' },
      { id: 'martial_arts', label: 'Martial Arts' },
      { id: 'parks', label: 'Parks & Outdoors' },
      { id: 'shopping', label: 'Shopping' },
      { id: 'healthcare', label: 'Healthcare' },
      { id: 'education', label: 'Education' },
      { id: 'transportation', label: 'Transportation' },
      { id: 'culture', label: 'Culture' },
    ],
  },
  {
    label: 'LoreBook Recall',
    filters: [
      { id: 'favorites', label: 'Favorites', icon: '⭐' },
      { id: 'most_visited', label: 'Most Visited', icon: '📍' },
      { id: 'meaningful', label: 'Meaningful', icon: '❤️' },
      { id: 'with_people', label: 'With People', icon: '👥' },
      { id: 'frequently_mentioned', label: 'Frequently Mentioned', icon: '🧠' },
      { id: 'story_locations', label: 'Story Locations', icon: '📖' },
      { id: 'celebration_spots', label: 'Celebration Spots', icon: '🎉' },
      { id: 'breakup_locations', label: 'Breakup Locations', icon: '💔' },
      { id: 'career_locations', label: 'Career Locations', icon: '💼' },
      { id: 'training_locations', label: 'Training Locations', icon: '🥊' },
      { id: 'music_scene_locations', label: 'Music Scene Locations', icon: '🎸' },
      { id: 'childhood_locations', label: 'Childhood Locations', icon: '🏫' },
      { id: 'former_homes', label: 'Former Homes', icon: '🏠' },
      { id: 'bucket_list_places', label: 'Bucket List Places', icon: '🌎' },
    ],
  },
];

const ALL_PLACE_TYPES = Object.values(PLACE_TAXONOMY).flat() as PlaceType[];

const TYPE_TO_CATEGORY = new Map<string, PlaceCategory>();
for (const [cat, types] of Object.entries(PLACE_TAXONOMY) as [PlaceCategory, readonly string[]][]) {
  for (const t of types) TYPE_TO_CATEGORY.set(t, cat);
}

/** Human label from slug */
export function formatPlaceType(type?: string | null): string {
  if (!type) return 'Place';
  const normalized = normalizePlaceTypeSlug(type);
  if (PLACE_TYPE_LABELS[normalized as PlaceType]) {
    return PLACE_TYPE_LABELS[normalized as PlaceType];
  }
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatPlaceSignificance(sig?: string | null): string {
  if (!sig) return '';
  const key = sig as PlaceSignificance;
  return PLACE_SIGNIFICANCE_LABELS[key] ?? sig.replace(/_/g, ' ');
}

function normalizePlaceTypeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isPlaceType(value: string): value is PlaceType {
  return (ALL_PLACE_TYPES as string[]).includes(normalizePlaceTypeSlug(value));
}

export function getPlaceCategory(type?: string | null): PlaceCategory | null {
  if (!type) return null;
  const normalized = normalizePlaceTypeSlug(type);
  if (isPlaceType(normalized)) return TYPE_TO_CATEGORY.get(normalized) ?? null;
  return null;
}

/** Legacy / alias slugs → canonical PlaceType */
const TYPE_ALIASES: Record<string, PlaceType> = {
  venue: 'music_venue',
  home: 'house',
  outdoor: 'park',
  outdoors: 'park',
  street: 'neighborhood',
  address: 'house',
  region: 'region',
  gymnasium: 'gym',
  dojo: 'martial_arts_gym',
  dojang: 'martial_arts_gym',
  pub: 'bar',
  club: 'nightclub',
  museum: 'museum',
  gallery: 'art_gallery',
  art_gallery: 'art_gallery',
  historic: 'historic_site',
  university_campus: 'university',
  campus: 'university',
  coffee: 'coffee_shop',
  eatery: 'restaurant',
  bistro: 'restaurant',
  diner: 'restaurant',
  unknown: 'landmark',
  other: 'landmark',
};

const INFERENCE_RULES: Array<{ re: RegExp; type: PlaceType }> = [
  { re: /\b(night\s?club|nightclub)\b/i, type: 'nightclub' },
  { re: /\b(goth\s?club)\b/i, type: 'goth_club' },
  { re: /\b(edm|rave)\s?(venue|club|party)\b/i, type: 'edm_venue' },
  { re: /\b(karaoke)\b/i, type: 'karaoke_bar' },
  { re: /\b(dive\s?bar)\b/i, type: 'dive_bar' },
  { re: /\b(speakeasy)\b/i, type: 'speakeasy' },
  { re: /\b(strip\s?club)\b/i, type: 'strip_club' },
  { re: /\b(hookah)\b/i, type: 'hookah_lounge' },
  { re: /\b(catch\s?one)\b/i, type: 'nightclub' },
  { re: /\b(bjj|brazilian jiu.?jitsu)\b/i, type: 'bjj_academy' },
  { re: /\b(mma|muay thai|boxing)\s?(gym|academy)\b/i, type: 'mma_gym' },
  { re: /\b(crossfit)\b/i, type: 'crossfit_gym' },
  { re: /\b(yoga)\s?(studio|class)\b/i, type: 'yoga_studio' },
  { re: /\b(climbing)\s?(gym|wall)\b/i, type: 'climbing_gym' },
  { re: /\b(gym|fitness\s?center|workout)\b/i, type: 'gym' },
  { re: /\b(dojo|martial arts)\b/i, type: 'martial_arts_gym' },
  { re: /\b(coffee\s?shop|caf[eé]|espresso)\b/i, type: 'coffee_shop' },
  { re: /\b(restaurant|bistro|diner|eatery|grill)\b/i, type: 'restaurant' },
  { re: /\b(fast\s?food|drive.?thru)\b/i, type: 'fast_food' },
  { re: /\b(food\s?truck)\b/i, type: 'food_truck' },
  { re: /\b(bakery)\b/i, type: 'bakery' },
  { re: /\b(brewery|taproom)\b/i, type: 'brewery' },
  { re: /\b(winery|vineyard)\b/i, type: 'winery' },
  { re: /\b(bar|pub|tavern|lounge)\b/i, type: 'bar' },
  { re: /\b(concert|music)\s?(venue|hall)\b/i, type: 'music_venue' },
  { re: /\b(jazz\s?club)\b/i, type: 'jazz_club' },
  { re: /\b(comedy\s?club)\b/i, type: 'comedy_club' },
  { re: /\b(theater|theatre)\b/i, type: 'theater' },
  { re: /\b(cinema|movie\s?theater)\b/i, type: 'cinema' },
  { re: /\b(arena|stadium|amphitheater)\b/i, type: 'arena' },
  { re: /\b(airport|terminal)\b/i, type: 'airport' },
  { re: /\b(train\s?station)\b/i, type: 'train_station' },
  { re: /\b(university|college|campus|csuf)\b/i, type: 'university' },
  { re: /\b(high\s?school|elementary|middle\s?school)\b/i, type: 'high_school' },
  { re: /\b(library)\b/i, type: 'library' },
  { re: /\b(office|workplace|hq|headquarters)\b/i, type: 'office' },
  { re: /\b(coworking|co-working)\b/i, type: 'coworking_space' },
  { re: /\b(warehouse|factory)\b/i, type: 'warehouse' },
  { re: /\b(robotics)\b/i, type: 'robotics_lab' },
  { re: /\b(makerspace|maker space)\b/i, type: 'makerspace' },
  { re: /\b(mall|shopping\s?center)\b/i, type: 'mall' },
  { re: /\b(grocery|supermarket)\b/i, type: 'grocery_store' },
  { re: /\b(bookstore)\b/i, type: 'bookstore' },
  { re: /\b(hospital|clinic|urgent care)\b/i, type: 'clinic' },
  { re: /\b(pharmacy|drugstore)\b/i, type: 'pharmacy' },
  { re: /\b(park|garden)\b/i, type: 'park' },
  { re: /\b(beach)\b/i, type: 'beach' },
  { re: /\b(hiking|trail)\b/i, type: 'hiking_trail' },
  { re: /\b(campground|campsite)\b/i, type: 'campground' },
  { re: /\b(convention\s?center|conference\s?center)\b/i, type: 'convention_center' },
  { re: /\b(museum)\b/i, type: 'museum' },
  { re: /\b(gallery|art\s?gallery)\b/i, type: 'art_gallery' },
  { re: /\b(historic\s?site|historic|landmark)\b/i, type: 'historic_site' },
  { re: /\b(hotel|motel|airbnb)\b/i, type: 'hotel' },
  { re: /\b(apartment|condo|dorm)\b/i, type: 'apartment' },
  { re: /\b(home|house|studio)\b/i, type: 'house' },
  { re: /\b(church|temple|mosque|synagogue)\b/i, type: 'church' },
];

/** Resolve a canonical place type from stored value + name/context heuristics. */
export function resolvePlaceType(
  storedType?: string | null,
  name?: string | null,
  context?: string | null,
): PlaceType | null {
  const raw = (storedType ?? '').trim();
  if (raw) {
    const normalized = normalizePlaceTypeSlug(raw);
    if (isPlaceType(normalized)) return normalized;
    if (TYPE_ALIASES[normalized]) return TYPE_ALIASES[normalized];
  }

  const haystack = `${name ?? ''} ${context ?? ''}`.trim();
  if (!haystack) return null;

  for (const rule of INFERENCE_RULES) {
    if (rule.re.test(haystack)) return rule.type;
  }

  return null;
}

export function getPlaceTags(location: {
  metadata?: Record<string, unknown> | null;
  purpose?: string[] | null;
  tagCounts?: { tag: string }[];
}): string[] {
  const metaTags = location.metadata?.place_tags;
  if (Array.isArray(metaTags)) {
    return metaTags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  }
  if (Array.isArray(location.purpose) && location.purpose.length > 0) {
    return location.purpose;
  }
  return [];
}

export function getPlaceSignificance(location: {
  metadata?: Record<string, unknown> | null;
}): PlaceSignificance[] {
  const raw = location.metadata?.place_significance;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is PlaceSignificance =>
    typeof s === 'string' && (PLACE_SIGNIFICANCE_TYPES as readonly string[]).includes(s),
  );
}

/** Tag inference from conversation text — flexible second dimension. */
const TAG_INFERENCE_RULES: Array<{ re: RegExp; tag: string }> = [
  { re: /\b(goth|gothic)\b/i, tag: 'Goth Scene' },
  { re: /\b(punk)\b/i, tag: 'Punk Scene' },
  { re: /\b(ska)\b/i, tag: 'Ska Scene' },
  { re: /\b(live music|live band|concert)\b/i, tag: 'Live Music' },
  { re: /\b(danc(e|ing)|dance floor)\b/i, tag: 'Dancing' },
  { re: /\b(late night|after hours|2\s?am|3\s?am)\b/i, tag: 'Late Night' },
  { re: /\b(lgbtq|queer|gay bar|drag)\b/i, tag: 'LGBTQ Friendly' },
  { re: /\b(historic|legendary|iconic)\b/i, tag: 'Historic Venue' },
  { re: /\b(computer science|csuf|engineering)\b/i, tag: 'Computer Science' },
  { re: /\b(research|lab|laboratory)\b/i, tag: 'Research' },
  { re: /\b(alumni|graduated|class of)\b/i, tag: 'Alumni' },
  { re: /\b(robotics|autonomous)\b/i, tag: 'Robotics' },
  { re: /\b(restaurant|dining|kitchen)\b/i, tag: 'Food' },
  { re: /\b(field ops|field operations|pilot site)\b/i, tag: 'Field Operations' },
  { re: /\b(quiet|study spot|focus)\b/i, tag: 'Quiet' },
  { re: /\b(creative|art|studio)\b/i, tag: 'Creative' },
  { re: /\b(date|romantic)\b/i, tag: 'Dates' },
  { re: /\b(outdoor seating|patio)\b/i, tag: 'Outdoor Seating' },
];

const SIGNIFICANCE_INFERENCE_RULES: Array<{ re: RegExp; sig: PlaceSignificance }> = [
  { re: /\b(childhood home|grew up here|where i grew up)\b/i, sig: 'childhood_home' },
  { re: /\b(favorite spot|my favorite place|love this place)\b/i, sig: 'favorite_spot' },
  { re: /\b(first date)\b/i, sig: 'first_date_location' },
  { re: /\b(breakup|broke up|ended things)\b/i, sig: 'breakup_location' },
  { re: /\b(celebrat|birthday|anniversary|graduation)\b/i, sig: 'celebration_spot' },
  { re: /\b(former workplace|used to work|old job)\b/i, sig: 'former_workplace' },
  { re: /\b(my workplace|where i work|at work)\b/i, sig: 'workplace' },
  { re: /\b(former school|used to go to school)\b/i, sig: 'former_school' },
  { re: /\b(my school|where i study|on campus)\b/i, sig: 'school' },
  { re: /\b(training gym|where i train)\b/i, sig: 'training_gym' },
  { re: /\b(hangout|hang out spot|we always go)\b/i, sig: 'hangout_spot' },
  { re: /\b(creative space|where i create|my studio)\b/i, sig: 'creative_space' },
  { re: /\b(safe place|where i feel safe)\b/i, sig: 'safe_place' },
  { re: /\b(avoid|never go back|bad memories)\b/i, sig: 'avoided_place' },
  { re: /\b(former home|old house|old apartment|used to live)\b/i, sig: 'former_home' },
  { re: /\b(bucket list|want to visit|dream trip)\b/i, sig: 'bucket_list_place' },
  { re: /\b(important memory|story happened|turning point)\b/i, sig: 'story_location' },
  { re: /\b(home|my place|where i live)\b/i, sig: 'home' },
];

export function inferPlaceTagsFromText(text: string): string[] {
  const tags = new Set<string>();
  for (const rule of TAG_INFERENCE_RULES) {
    if (rule.re.test(text)) tags.add(rule.tag);
  }
  return [...tags];
}

export function inferPlaceSignificanceFromText(text: string): PlaceSignificance[] {
  const sigs = new Set<PlaceSignificance>();
  for (const rule of SIGNIFICANCE_INFERENCE_RULES) {
    if (rule.re.test(text)) sigs.add(rule.sig);
  }
  return [...sigs];
}

export function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map(s => s.toLowerCase()));
  const out = [...existing];
  for (const item of incoming) {
    const key = item.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
  }
  return out;
}

/** Sub-types within a category that have at least one matching location. */
export function getSubTypeFiltersForCategory(
  locations: Array<{ type?: string | null; name?: string }>,
  category: PlaceCategory,
): Array<{ type: PlaceType; label: string; count: number }> {
  const types = PLACE_TAXONOMY[category] ?? [];
  return types
    .map(t => ({
      type: t,
      label: formatPlaceType(t),
      count: locations.filter(loc => resolvePlaceType(loc.type, loc.name) === t).length,
    }))
    .filter(x => x.count > 0);
}

type FilterablePlace = {
  type?: string | null;
  name?: string;
  metadata?: Record<string, unknown> | null;
  purpose?: string[] | null;
  tagCounts?: { tag: string; count?: number }[];
  relatedPeople?: { character_id?: string; name?: string }[];
  visitCount?: number;
  entries?: unknown[];
  chapters?: unknown[];
};

function placeSearchText(location: FilterablePlace): string {
  return [
    location.name,
    location.type,
    ...getPlaceTags(location),
    ...(location.tagCounts?.map(t => t.tag) ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function categoryMatches(location: FilterablePlace, categories: PlaceCategory[]): boolean {
  const resolved = resolvePlaceType(location.type, location.name);
  return Boolean(resolved && categories.includes(getPlaceCategory(resolved) as PlaceCategory));
}

function typeMatches(location: FilterablePlace, types: PlaceType[]): boolean {
  const resolved = resolvePlaceType(location.type, location.name);
  return Boolean(resolved && types.includes(resolved));
}

function hasSignificance(location: FilterablePlace, values: PlaceSignificance[]): boolean {
  const sig = getPlaceSignificance(location);
  return values.some(value => sig.includes(value));
}

export function placeMatchesLifestyleFilter(location: FilterablePlace, filter: PlaceLifestyleFilter): boolean {
  if (filter === 'all') return true;
  const text = placeSearchText(location);

  switch (filter) {
    case 'work':
      return categoryMatches(location, ['work_business', 'technology']) ||
        hasSignificance(location, ['workplace', 'former_workplace']) ||
        /\b(work|office|career|job|coworking|meeting|robotics|lab)\b/.test(text);
    case 'home':
      return categoryMatches(location, ['residential']) ||
        hasSignificance(location, ['home', 'childhood_home', 'former_home']) ||
        /\b(home|house|apartment|family|studio)\b/.test(text);
    case 'social':
      return categoryMatches(location, ['social', 'food_drink', 'nightlife', 'music_entertainment', 'events']) ||
        hasSignificance(location, ['hangout_spot', 'first_date_location', 'celebration_spot']) ||
        /\b(social|friends|party|bar|club|date|concert|music|hangout)\b/.test(text);
    case 'travel':
      return categoryMatches(location, ['transportation', 'geographic']) ||
        typeMatches(location, ['hotel', 'motel', 'airbnb', 'rv_park']) ||
        hasSignificance(location, ['bucket_list_place']) ||
        /\b(travel|trip|airport|station|hotel|vacation|bucket list)\b/.test(text);
    case 'nature':
      return categoryMatches(location, ['outdoors']) ||
        /\b(nature|park|beach|trail|hiking|camp|lake|outdoor)\b/.test(text);
    default:
      return true;
  }
}

export function placeMatchesAdvancedFilter(location: FilterablePlace, filter: PlaceAdvancedFilter): boolean {
  const text = placeSearchText(location);
  const totalMentions = location.tagCounts?.reduce((sum, tag) => sum + (tag.count ?? 0), 0) ?? 0;

  if (filter in PLACE_TAXONOMY) return placeMatchesFilter(location, filter as PlaceFilterCategory);

  switch (filter) {
    case 'music_venues':
      return categoryMatches(location, ['music_entertainment']) ||
        typeMatches(location, ['music_venue', 'concert_venue', 'jazz_club', 'arena', 'stadium', 'amphitheater']) ||
        /\b(music venue|concert|live music|band|show)\b/.test(text);
    case 'martial_arts':
      return typeMatches(location, ['martial_arts_gym', 'bjj_academy', 'boxing_gym', 'muay_thai_gym', 'mma_gym']) ||
        /\b(martial|bjj|jiu.?jitsu|boxing|muay thai|mma|dojo)\b/.test(text);
    case 'parks':
      return categoryMatches(location, ['outdoors']) ||
        typeMatches(location, ['park', 'beach', 'hiking_trail', 'campground', 'national_park']);
    case 'culture':
      return categoryMatches(location, ['culture_community', 'religion', 'government']) ||
        typeMatches(location, ['museum', 'art_gallery', 'historic_site', 'theater']) ||
        /\b(museum|gallery|historic|culture|church|temple|community)\b/.test(text);
    case 'favorites':
      return hasSignificance(location, ['favorite_spot']) || Boolean(location.metadata?.favorite);
    case 'meaningful':
      return getPlaceSignificance(location).length > 0 ||
        Boolean(location.metadata?.meaningful) ||
        /\b(meaningful|important|special|memory|milestone|turning point)\b/.test(text);
    case 'most_visited':
      return (location.visitCount ?? 0) >= 3 || totalMentions >= 3;
    case 'with_people':
      return (location.relatedPeople?.filter(person => person.character_id || person.name).length ?? 0) > 0;
    case 'frequently_mentioned':
      return totalMentions >= 3 || (location.entries?.length ?? 0) >= 3 || (location.visitCount ?? 0) >= 3;
    case 'story_locations':
      return hasSignificance(location, ['story_location']) || (location.chapters?.length ?? 0) > 0;
    case 'celebration_spots':
      return hasSignificance(location, ['celebration_spot']) || /\b(celebration|birthday|party|anniversary|graduation)\b/.test(text);
    case 'breakup_locations':
      return hasSignificance(location, ['breakup_location']) || /\b(breakup|broke up|ended things)\b/.test(text);
    case 'career_locations':
      return placeMatchesLifestyleFilter(location, 'work');
    case 'training_locations':
      return hasSignificance(location, ['training_gym']) ||
        categoryMatches(location, ['fitness_sports']) ||
        /\b(training|gym|fitness|practice|bjj|boxing|martial)\b/.test(text);
    case 'music_scene_locations':
      return placeMatchesAdvancedFilter(location, 'music_venues') ||
        /\b(music scene|goth scene|punk scene|ska scene|rave|edm)\b/.test(text);
    case 'childhood_locations':
      return hasSignificance(location, ['childhood_home']) || /\b(childhood|grew up|kid|school)\b/.test(text);
    case 'former_homes':
      return hasSignificance(location, ['former_home']) || /\b(former home|old house|old apartment|used to live)\b/.test(text);
    case 'bucket_list_places':
      return hasSignificance(location, ['bucket_list_place']) || /\b(bucket list|want to visit|dream trip)\b/.test(text);
    default:
      return false;
  }
}

export function placeMatchesFilter(
  location: {
    type?: string | null;
    name?: string;
    metadata?: Record<string, unknown> | null;
    purpose?: string[] | null;
    tagCounts?: { tag: string }[];
  },
  filter: PlaceFilterCategory,
  subType?: string | null,
): boolean {
  if (filter === 'all' && !subType) return true;

  if (subType) {
    const resolved = resolvePlaceType(location.type, location.name);
    return resolved === subType || normalizePlaceTypeSlug(location.type ?? '') === subType;
  }

  if (filter === 'all') return true;

  if (filter === 'personal') {
    const sig = getPlaceSignificance(location);
    if (sig.length > 0) return true;
    const tags = getPlaceTags(location);
    return tags.some(t => /childhood|favorite|first date|hangout|safe|avoided|home/i.test(t));
  }

  const resolved = resolvePlaceType(location.type, location.name);
  if (resolved) {
    return getPlaceCategory(resolved) === filter;
  }

  // Fallback: journal tag hints when type not set yet
  const tagStr = [
    ...getPlaceTags(location),
    ...(location.tagCounts?.map(t => t.tag) ?? []),
  ].join(' ').toLowerCase();

  const FALLBACK: Partial<Record<PlaceCategory, RegExp>> = {
    food_drink: /\b(coffee|restaurant|cafe|bar|food|drink|bakery)\b/,
    nightlife: /\b(night|club|dance|goth|karaoke|lounge)\b/,
    fitness_sports: /\b(gym|fitness|workout|martial|bjj|yoga|hike|exercise)\b/,
    education: /\b(school|university|college|study|library|education|campus)\b/,
    work_business: /\b(work|office|conference|professional|meeting|networking)\b/,
    outdoors: /\b(nature|park|beach|trail|hiking|outdoor)\b/,
    residential: /\b(home|house|family)\b/,
    transportation: /\b(travel|airport|trip|vacation)\b/,
    music_entertainment: /\b(concert|music|art|gallery|theater)\b/,
    events: /\b(conference|convention|festival)\b/,
    social: /\b(social|dates|friends|party)\b/,
    culture_community: /\b(museum|gallery|historic|culture|community)\b/,
  };

  const re = FALLBACK[filter];
  return re ? re.test(tagStr) || re.test((location.name ?? '').toLowerCase()) : false;
}

/** Suggested free-form tags users can attach to a place */
export const SUGGESTED_PLACE_TAGS = [
  'Live Music', 'Dancing', 'Late Night', 'LGBTQ Friendly', 'Historic Venue',
  'Goth Scene', 'Punk Scene', 'Ska Scene', 'Computer Science', 'Research', 'Alumni',
  'Robotics', 'Autonomous Systems', 'Field Operations', 'Quiet', 'Creative', 'Dates',
  'Family', 'Study', 'Networking', 'Food', 'Drinks', 'Outdoor Seating',
] as const;

// Generated labels for all place types
export const PLACE_TYPE_LABELS = Object.fromEntries(
  ALL_PLACE_TYPES.map(t => [t, t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())]),
) as Record<PlaceType, string>;

// Override a few awkward auto-labels
PLACE_TYPE_LABELS.bjj_academy = 'BJJ Academy';
PLACE_TYPE_LABELS.edm_venue = 'EDM Venue';
PLACE_TYPE_LABELS.mma_gym = 'MMA Gym';
PLACE_TYPE_LABELS.ai_lab = 'AI Lab';
PLACE_TYPE_LABELS.ev_charging_station = 'EV Charging Station';
PLACE_TYPE_LABELS.dmv = 'DMV';
PLACE_TYPE_LABELS.rv_park = 'RV Park';
PLACE_TYPE_LABELS.airbnb = 'Airbnb';
