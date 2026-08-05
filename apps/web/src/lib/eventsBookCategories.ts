/**
 * Life Log celebration / occasion taxonomy — top-level categories + nested sub-tabs.
 * Kept in a pure module so classifiers stay testable without mounting EventsBook.
 */

export type EventCategory =
  | 'all'
  | 'recent'
  | 'birthdays'
  | 'quinceaneras'
  | 'weddings'
  | 'parties'
  | 'concerts_shows'
  | 'conventions'
  | 'sports'
  | 'festivals'
  | 'graduations'
  | 'religious_milestones'
  | 'work'
  | 'travel'
  | 'family'
  | 'holidays'
  | 'community'
  | 'government_civic'
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
  quinceaneras: [
    { value: 'all', label: 'All' },
    { value: 'mine', label: 'Mine' },
    { value: 'family', label: 'Family' },
    { value: 'friends', label: "Friends'" },
  ],
  weddings: [
    { value: 'all', label: 'All' },
    { value: 'ceremony', label: 'Ceremony' },
    { value: 'reception', label: 'Reception' },
    { value: 'destination', label: 'Destination' },
  ],
  parties: [
    { value: 'all', label: 'All' },
    { value: 'raves', label: 'Raves' },
    { value: 'afters', label: 'Afters' },
    { value: 'celebrations', label: 'Celebrations' },
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
  sports: [
    { value: 'all', label: 'All' },
    { value: 'games', label: 'Games' },
    { value: 'tournaments', label: 'Tournaments' },
    { value: 'playing', label: 'Playing' },
    { value: 'watching', label: 'Watching' },
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
    { value: 'baby_showers', label: 'Baby Showers' },
  ],
  festivals: [
    { value: 'all', label: 'All' },
    { value: 'music', label: 'Music' },
    { value: 'rave_festivals', label: 'Rave Festivals' },
    { value: 'arts', label: 'Arts' },
    { value: 'food', label: 'Food' },
  ],
  graduations: [
    { value: 'all', label: 'All' },
    { value: 'high_school', label: 'High School' },
    { value: 'college', label: 'College' },
    { value: 'grad_school', label: 'Grad School' },
  ],
  religious_milestones: [
    { value: 'all', label: 'All' },
    { value: 'baptism', label: 'Baptism' },
    { value: 'bar_bat_mitzvah', label: 'Bar/Bat Mitzvah' },
    { value: 'first_communion', label: 'First Communion' },
    { value: 'other_religious', label: 'Other' },
  ],
  holidays: [
    { value: 'all', label: 'All' },
    { value: 'christmas', label: 'Christmas' },
    { value: 'thanksgiving', label: 'Thanksgiving' },
    { value: 'new_year', label: "New Year's" },
    { value: 'other_holiday', label: 'Other' },
  ],
  community: [
    { value: 'all', label: 'All' },
    { value: 'volunteering', label: 'Volunteering' },
    { value: 'fundraisers', label: 'Fundraisers' },
    { value: 'neighborhood', label: 'Neighborhood' },
  ],
  government_civic: [
    { value: 'all', label: 'All' },
    { value: 'voting', label: 'Voting' },
    { value: 'civic_duty', label: 'Civic Duty' },
    { value: 'public_meetings', label: 'Public Meetings' },
  ],
};

export const CATEGORY_KEYWORDS: Partial<Record<EventCategory, string[]>> = {
  birthdays: ['birthday', 'birthdays', 'bday'],
  quinceaneras: [
    'quinceañera', 'quinceanera', 'quinceañeras', 'quinceaneras', 'quince',
    'quince años', 'quince anos', 'sweet fifteen', 'xv años', 'xv anos', 'xv party',
  ],
  weddings: [
    'wedding', 'weddings', 'bride', 'groom', 'vows', 'bridal', 'marriage ceremony',
    'elopement', 'destination wedding', 'wedding reception', 'wedding day',
  ],
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
  sports: [
    'sports', 'sporting event', 'game day', 'ballgame', 'tournament', 'tournaments',
    'championship', 'playoff', 'playoffs', 'season opener', 'watch party',
    'football game', 'basketball game', 'baseball game', 'hockey game', 'soccer game',
    'tennis match', 'volleyball game', 'little league', 'rec league', 'pickup game',
    'nfl', 'nba', 'mlb', 'nhl', 'mls', 'world cup', 'super bowl', 'world series',
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
  graduations: [
    'graduation', 'graduations', 'graduated', 'commencement', 'diploma',
    'cap and gown', 'degree ceremony',
  ],
  religious_milestones: [
    'baptism', 'baptisms', 'christening', 'bar mitzvah', 'bat mitzvah', "b'nai mitzvah",
    'first communion', 'communion', 'confirmation', 'religious ceremony', 'religious milestone',
  ],
  holidays: [
    'holiday', 'holidays', 'christmas', 'thanksgiving', 'new year', "new year's",
    'easter', 'halloween', 'hanukkah', 'fourth of july', 'independence day',
  ],
  community: [
    'community event', 'community events', 'volunteer', 'volunteering', 'volunteer day',
    'neighborhood event', 'neighborhood cleanup', 'fundraiser', 'charity event',
    'food drive', 'blood drive', 'town fair', 'street fair',
  ],
  government_civic: [
    'civic event', 'civic duty', 'jury duty', 'town hall', 'city council', 'voting', 'voted',
    'election day', 'polling place', 'naturalization ceremony', 'swearing in',
    'protest', 'rally', 'public hearing',
  ],
};

export const SUB_KEYWORDS: Record<string, string[]> = {
  afters: ['afters', 'afterparty', 'after-party', 'after party', 'underground rave', 'rave afters'],
  raves: ['rave', 'raves', 'edm', 'underground'],
  celebrations: ['celebration', 'celebrations', 'birthday party', 'anniversary'],
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
  mine: ['my birthday', 'my bday', 'turned today', 'celebrated my', 'my quinceañera', 'my quince', 'turning 15', 'my xv'],
  others: ['birthday party', 'birthday for', "friend's birthday", 'surprise party'],
  kids: ['kid birthday', "kid's birthday", 'child birthday', "children's party", 'kids party'],
  family: ['sister', 'cousin', 'niece', "daughter's quince", 'family quinceañera', "daughter's quinceañera"],
  friends: ["friend's quinceañera", "friend's quince", "best friend's quince"],
  games: ['game', 'games', 'ballgame', 'match', 'matches', 'game day'],
  tournaments: ['tournament', 'tournaments', 'championship', 'playoff', 'playoffs', 'bracket'],
  playing: ['played', 'playing', 'i played', 'we played', 'my team', 'league game', 'rec league', 'pickup game'],
  watching: ['watched', 'watching', 'watch party', 'tailgate', 'spectator'],
  ceremony: ['ceremony', 'vows', 'altar', 'officiant'],
  reception: ['reception', 'dancing', 'wedding reception'],
  destination: ['destination wedding', 'abroad', 'overseas wedding'],
  high_school: ['high school graduation', 'high school diploma', 'hs graduation'],
  college: ['college graduation', 'college commencement', 'university graduation', "bachelor's"],
  grad_school: ['grad school', 'graduate school', "master's", 'phd', 'doctorate'],
  baptism: ['baptism', 'baptisms', 'christening'],
  bar_bat_mitzvah: ['bar mitzvah', 'bat mitzvah', "b'nai mitzvah"],
  first_communion: ['first communion', 'communion'],
  other_religious: ['confirmation', 'religious ceremony'],
  christmas: ['christmas', 'xmas'],
  thanksgiving: ['thanksgiving'],
  new_year: ['new year', "new year's", 'nye'],
  other_holiday: ['easter', 'halloween', 'hanukkah', 'fourth of july', 'independence day'],
  volunteering: ['volunteer', 'volunteering', 'volunteer day'],
  fundraisers: ['fundraiser', 'charity event', 'food drive', 'blood drive'],
  neighborhood: ['neighborhood event', 'neighborhood cleanup', 'town fair', 'street fair'],
  voting: ['voting', 'voted', 'election day', 'polling place'],
  civic_duty: ['jury duty', 'civic duty', 'naturalization ceremony', 'swearing in'],
  public_meetings: ['town hall', 'city council', 'public hearing'],
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
