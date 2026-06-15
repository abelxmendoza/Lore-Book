/**
 * Server-side place type inference (mirrors apps/web/src/lib/placeTypes.ts).
 */

export const PLACE_TAXONOMY = {
  residential: ['house', 'apartment', 'condo', 'dormitory', 'hotel', 'motel', 'airbnb', 'rv_park', 'shelter'],
  food_drink: ['restaurant', 'fast_food', 'food_truck', 'cafe', 'coffee_shop', 'bakery', 'bar', 'brewery', 'winery', 'distillery', 'lounge', 'tea_house'],
  nightlife: ['nightclub', 'dance_club', 'goth_club', 'edm_venue', 'rave_venue', 'karaoke_bar', 'dive_bar', 'speakeasy', 'strip_club', 'hookah_lounge'],
  music_entertainment: ['concert_venue', 'music_venue', 'arena', 'stadium', 'amphitheater', 'opera_house', 'jazz_club', 'comedy_club', 'theater', 'cinema', 'drive_in_theater'],
  fitness_sports: ['gym', 'martial_arts_gym', 'bjj_academy', 'boxing_gym', 'muay_thai_gym', 'mma_gym', 'yoga_studio', 'crossfit_gym', 'climbing_gym', 'swimming_pool', 'sports_complex', 'golf_course'],
  education: ['elementary_school', 'middle_school', 'high_school', 'trade_school', 'college', 'university', 'library', 'research_lab'],
  work_business: ['office', 'factory', 'warehouse', 'retail_store', 'startup', 'corporate_campus', 'coworking_space', 'robotics_lab', 'makerspace', 'data_center'],
  technology: ['server_room', 'ai_lab', 'electronics_lab', 'testing_facility', 'clean_room', 'fabrication_facility'],
  shopping: ['mall', 'shopping_center', 'grocery_store', 'convenience_store', 'flea_market', 'farmers_market', 'department_store', 'bookstore'],
  transportation: ['airport', 'train_station', 'bus_station', 'subway_station', 'harbor', 'marina', 'parking_structure', 'ev_charging_station'],
  healthcare: ['hospital', 'clinic', 'urgent_care', 'pharmacy', 'dentist', 'veterinary_clinic'],
  government: ['courthouse', 'police_station', 'fire_station', 'dmv', 'post_office', 'embassy', 'city_hall'],
  outdoors: ['park', 'beach', 'hiking_trail', 'campground', 'national_park', 'dog_park', 'botanical_garden'],
  religion: ['church', 'temple', 'mosque', 'synagogue', 'shrine', 'monastery'],
  events: ['convention_center', 'expo_hall', 'festival_grounds', 'fairgrounds', 'conference_venue'],
  social: ['community_center', 'clubhouse', 'fraternity_house', 'sorority_house', 'meetup_space'],
  geographic: ['country', 'state', 'region', 'city', 'neighborhood', 'landmark'],
} as const;

export type PlaceType = (typeof PLACE_TAXONOMY)[keyof typeof PLACE_TAXONOMY][number];

const ALL_TYPES = new Set(Object.values(PLACE_TAXONOMY).flat());

const TYPE_ALIASES: Record<string, PlaceType> = {
  venue: 'music_venue', home: 'house', outdoor: 'park', outdoors: 'park',
  gymnasium: 'gym', dojo: 'martial_arts_gym', pub: 'bar', club: 'nightclub',
  campus: 'university', coffee: 'coffee_shop', unknown: 'landmark', other: 'landmark',
};

const INFERENCE_RULES: Array<{ re: RegExp; type: PlaceType }> = [
  { re: /\b(night\s?club|nightclub)\b/i, type: 'nightclub' },
  { re: /\b(goth\s?club)\b/i, type: 'goth_club' },
  { re: /\b(bjj|brazilian jiu.?jitsu)\b/i, type: 'bjj_academy' },
  { re: /\b(gym|fitness\s?center)\b/i, type: 'gym' },
  { re: /\b(coffee\s?shop|caf[eé])\b/i, type: 'coffee_shop' },
  { re: /\b(restaurant|bistro|diner)\b/i, type: 'restaurant' },
  { re: /\b(bar|pub|lounge)\b/i, type: 'bar' },
  { re: /\b(university|college|campus)\b/i, type: 'university' },
  { re: /\b(office|workplace)\b/i, type: 'office' },
  { re: /\b(airport)\b/i, type: 'airport' },
  { re: /\b(park|trail|beach)\b/i, type: 'park' },
  { re: /\b(home|house|studio)\b/i, type: 'house' },
];

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function inferPlaceType(name: string, context?: string, storedType?: string | null): PlaceType | null {
  let raw = (storedType ?? '').trim();
  // Generic slugs — infer from name/context instead of forcing a wrong category
  if (/^(place|unknown|other)$/i.test(raw)) raw = '';

  if (raw) {
    const n = normalizeSlug(raw);
    if (ALL_TYPES.has(n as PlaceType)) return n as PlaceType;
    if (TYPE_ALIASES[n]) return TYPE_ALIASES[n];
  }
  const haystack = `${name} ${context ?? ''}`.trim();
  for (const rule of INFERENCE_RULES) {
    if (rule.re.test(haystack)) return rule.type;
  }
  return null;
}
