/**
 * Life Log celebration / occasion taxonomy — top-level categories + nested sub-tabs.
 * Kept in a pure module so classifiers stay testable without mounting EventsBook.
 */

export type EventCategory =
  | 'all'
  | 'recent'
  | 'birthdays'
  | 'parties'
  | 'concerts_shows'
  | 'conventions'
  | 'work'
  | 'travel'
  | 'family'
  | 'festivals'
  | 'with_people'
  | 'with_locations';

export type EventsBookCategoryEvent = {
  title: string;
  summary?: string | null;
  type?: string | null;
  activities?: string[];
  people?: string[];
  locations?: string[];
  start_time?: string | null;
};

export const CATEGORY_SUB_TABS: Partial<Record<EventCategory, { value: string; label: string }[]>> = {
  birthdays: [
    { value: 'all', label: 'All' },
    { value: 'mine', label: 'Mine' },
    { value: 'others', label: "Others'" },
    { value: 'kids', label: "Kids'" },
  ],
  parties: [
    { value: 'all', label: 'All' },
    { value: 'raves', label: 'Raves' },
    { value: 'afters', label: 'Afters' },
    { value: 'celebrations', label: 'Celebrations' },
    { value: 'weddings', label: 'Weddings' },
    { value: 'baby_showers', label: 'Baby Showers' },
    { value: 'game_nights', label: 'Game Nights' },
    { value: 'house_parties', label: 'House Parties' },
  ],
  concerts_shows: [
    { value: 'all', label: 'All' },
    { value: 'concerts', label: 'Concerts' },
    { value: 'backyard_shows', label: 'Backyard Shows' },
    { value: 'fight_nights', label: 'Fight Night' },
    { value: 'theater', label: 'Theater' },
    { value: 'comedy', label: 'Comedy' },
    { value: 'open_mics', label: 'Open Mics' },
    { value: 'local_scene', label: 'Local Scene' },
  ],
  conventions: [
    { value: 'all', label: 'All' },
    { value: 'conferences', label: 'Conferences' },
    { value: 'expos', label: 'Expos' },
    { value: 'meetups', label: 'Meetups' },
    { value: 'fan_cons', label: 'Fan Cons' },
  ],
  work: [
    { value: 'all', label: 'All' },
    { value: 'meetings', label: 'Meetings' },
    { value: 'conferences', label: 'Conferences' },
    { value: 'trips', label: 'Trips' },
    { value: 'offsites', label: 'Offsites' },
  ],
  travel: [
    { value: 'all', label: 'All' },
    { value: 'vacations', label: 'Vacations' },
    { value: 'weekends', label: 'Weekends' },
    { value: 'business', label: 'Business' },
  ],
  family: [
    { value: 'all', label: 'All' },
    { value: 'dinners', label: 'Dinners' },
    { value: 'reunions', label: 'Reunions' },
    { value: 'holidays', label: 'Holidays' },
    { value: 'weddings', label: 'Weddings' },
    { value: 'baby_showers', label: 'Baby Showers' },
  ],
  festivals: [
    { value: 'all', label: 'All' },
    { value: 'music', label: 'Music' },
    { value: 'rave_festivals', label: 'Rave Festivals' },
    { value: 'arts', label: 'Arts' },
    { value: 'food', label: 'Food' },
  ],
};

export const CATEGORY_KEYWORDS: Partial<Record<EventCategory, string[]>> = {
  birthdays: ['birthday', 'birthdays', 'bday'],
  parties: [
    'party', 'parties', 'rave', 'raves', 'celebration', 'gathering', 'game night',
    'house party', 'afters', 'afterparty', 'after-party', 'after party', 'underground',
    'wedding', 'weddings', 'baby shower', 'bridal shower',
  ],
  concerts_shows: [
    'concert', 'concerts', 'show', 'shows', 'performance', 'theater', 'theatre', 'comedy',
    'gig', 'open mic', 'festival', 'local scene', 'underground scene',
    'backyard show', 'backyard', 'house show', 'fight night', 'boxing', 'mma', 'ufc',
  ],
  conventions: [
    'convention', 'conventions', 'conference', 'conferences', 'expo', 'expos',
    'meetup', 'meetups', 'summit', 'con',
  ],
  work: [
    'work', 'meeting', 'meetings', 'presentation', 'client', 'office', 'conference',
    'business trip', 'offsite', 'interview',
  ],
  travel: [
    'travel', 'trip', 'trips', 'vacation', 'vacations', 'getaway', 'weekend getaway',
    'road trip', 'family visit',
  ],
  family: [
    'family', 'family dinner', 'reunion', 'reunions', 'holiday', 'holidays', 'anniversary',
    'wedding', 'weddings', 'baby shower',
  ],
  festivals: ['festival', 'festivals', 'fair', 'multi-day', 'rave festival', 'music fest'],
};

export const SUB_KEYWORDS: Record<string, string[]> = {
  afters: ['afters', 'afterparty', 'after-party', 'after party', 'underground rave', 'rave afters'],
  raves: ['rave', 'raves', 'edm', 'underground'],
  celebrations: ['celebration', 'celebrations', 'birthday party', 'anniversary'],
  weddings: ['wedding', 'weddings', 'reception', 'bridal', 'marriage ceremony'],
  baby_showers: ['baby shower', 'baby showers', 'bridal shower', 'gender reveal'],
  game_nights: ['game night', 'game nights', 'board game'],
  house_parties: ['house party', 'house parties'],
  backyard_shows: ['backyard show', 'backyard', 'house show', 'yard show', 'patio show'],
  fight_nights: ['fight night', 'boxing', 'mma', 'ufc', 'kickboxing', 'sparring event'],
  local_scene: ['local scene', 'underground scene', 'scenes'],
  concerts: ['concert', 'concerts', 'gig', 'live music'],
  theater: ['theater', 'theatre', 'play', 'musical'],
  comedy: ['comedy', 'stand-up', 'standup', 'open mic comedy'],
  open_mics: ['open mic', 'open mics', 'open mic night'],
  conferences: ['conference', 'conferences', 'summit'],
  expos: ['expo', 'expos', 'exhibition', 'trade show'],
  meetups: ['meetup', 'meetups', 'meet up'],
  fan_cons: ['con', 'convention', 'comic con', 'fan con', 'anime con', 'fan convention'],
  meetings: ['meeting', 'meetings', 'sync', 'standup', 'stand-up'],
  trips: ['trip', 'business trip', 'work trip', 'travel'],
  offsites: ['offsite', 'offsites', 'off-site', 'retreat'],
  vacations: ['vacation', 'vacations', 'holiday', 'getaway'],
  weekends: ['weekend', 'weekend getaway', 'weekend trip'],
  business: ['business', 'business trip', 'work travel'],
  dinners: ['dinner', 'family dinner', 'dinners'],
  reunions: ['reunion', 'reunions', 'family reunion'],
  holidays: ['holiday', 'holidays', 'christmas', 'thanksgiving', 'easter'],
  music: ['music festival', 'music fest', 'festival'],
  rave_festivals: ['rave festival', 'edm festival', 'electronic festival', 'festival rave'],
  arts: ['arts festival', 'art fair', 'art festival'],
  food: ['food festival', 'food fair', 'food fest'],
  mine: ['my birthday', 'my bday', 'turned today', 'celebrated my'],
  others: ['birthday party', 'birthday for', "friend's birthday", 'surprise party'],
  kids: ['kid birthday', "kid's birthday", 'child birthday', "children's party", 'kids party'],
};

export function eventCategoryText(event: EventsBookCategoryEvent): string {
  return [event.title, event.summary, event.type, ...(event.activities || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function eventMatchesCategory(
  event: EventsBookCategoryEvent,
  category: EventCategory,
  subCategory = 'all',
  now: Date = new Date(),
): boolean {
  if (category === 'all') return true;
  if (category === 'recent') {
    if (!event.start_time) return false;
    const start = new Date(event.start_time);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return start >= thirtyDaysAgo;
  }
  if (category === 'with_people') return (event.people?.length ?? 0) > 0;
  if (category === 'with_locations') return (event.locations?.length ?? 0) > 0;

  const text = eventCategoryText(event);
  const kw = CATEGORY_KEYWORDS[category];
  if (!kw || !kw.some((k) => text.includes(k))) return false;
  if (subCategory === 'all') return true;

  const subKw = SUB_KEYWORDS[subCategory];
  if (subKw && subKw.some((k) => text.includes(k))) return true;
  if (text.includes(subCategory.replace(/_/g, ' '))) return true;
  return false;
}
