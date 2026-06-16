/**
 * Deterministic Entity Classifier (Entity Resolution Hardening)
 *
 * Root cause this fixes: peoplePlacesService.inferType() defaulted ANY unknown
 * proper noun to 'person', and person-typed entities are promoted to Character
 * cards. So "High Noon" (product), "Find My" (app), "Moreno Valley" (place),
 * "Mom's House" (household), "Amazon Ring" (product) all became Characters.
 *
 * The rule that fixes it: **PERSON requires positive evidence.** Everything that
 * isn't provably a person/place/org/product/app/etc. becomes UNCLASSIFIED and is
 * NOT promoted to a Character until evidence arrives. No LLM — fully deterministic.
 */

export type EntityClass =
  | 'PERSON' | 'FAMILY' | 'PLACE' | 'LOCATION' | 'HOUSEHOLD' | 'GROUP'
  | 'ORGANIZATION' | 'COMPANY' | 'PROJECT' | 'PRODUCT' | 'BRAND' | 'APP'
  | 'SKILL' | 'PET' | 'VEHICLE' | 'MEDIA' | 'FOOD_DRINK' | 'EVENT'
  | 'UNKNOWN' | 'UNCLASSIFIED';

export interface Classification {
  type: EntityClass;
  confidence: number; // 0..1
  reason: string;     // why (audit trail)
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const has = (set: Set<string>, key: string) => set.has(key);
const singularize = (s: string) => s.endsWith('s') && s.length > 4 ? s.slice(0, -1) : s;
const normVariants = (s: string): string[] => {
  const normalized = norm(s);
  const variants = new Set([normalized]);
  variants.add(singularize(normalized));
  variants.add(normalized.replace(/[’']/g, "'"));
  return [...variants];
};

// ── Lexicons (the bug cases + common entities) ────────────────────────────────
const APPS = new Set([
  'find my', 'find my iphone', 'venmo', 'cash app', 'cashapp', 'zelle', 'paypal',
  'instagram', 'snapchat', 'tiktok', 'whatsapp', 'facetime', 'imessage', 'messenger',
  'spotify', 'youtube', 'discord', 'slack', 'zoom', 'gmail', 'maps', 'google maps',
  'uber eats', 'doordash app', 'notion', 'figma', 'github', 'chatgpt', 'lorebook',
]);

const FOOD_DRINKS = new Set([
  'high noon', 'white claw', 'truly', 'modelo', 'corona', 'budweiser', 'heineken',
  'red bull', 'monster', 'celsius', 'coffee', 'matcha', 'boba', 'beer', 'wine',
]);

const PRODUCTS = new Set([
  'amazon ring', 'ring', 'nest', 'alexa', 'echo', 'iphone', 'ipad', 'airpods', 'macbook',
  'playstation', 'xbox', 'nintendo switch', 'kindle', 'fire tv', 'roku', 'tesla',
]);

const BRANDS = new Set([
  'nike', 'adidas', 'vans', 'supreme', 'patagonia', 'north face',
]);

// Brand/company names that must never be a person.
const COMPANIES = new Set([
  'amazon', 'google', 'apple', 'microsoft', 'meta', 'facebook', 'netflix', 'uber',
  'lyft', 'openai', 'anthropic', 'nvidia', 'tesla', 'walmart', 'target', 'costco',
  'starbucks', 'mcdonalds', 'chipotle', 'doordash', 'grubhub', 'instacart',
  'home depot', 'best buy', 'samsung', 'sony', 'intel', 'spacex', 'boeing',
]);

// Known geographic places (extend over time / via context).
const PLACES = new Set([
  'moreno valley', 'los angeles', 'san diego', 'san francisco', 'new york', 'chicago',
  'riverside', 'anaheim', 'long beach', 'pasadena', 'irvine', 'santa ana', 'fontana',
  'rancho cucamonga', 'corona', 'temecula', 'ontario', 'pomona', 'fullerton',
  'california', 'texas', 'florida', 'arizona', 'nevada', 'mexico',
]);

const VENUES = new Set([
  'club metro',
]);

const BANDS_AND_ORGS = new Set([
  'prayers', 'ex lover', 'ex-lover',
]);

const MEDIA = new Set([
  'star wars', 'lord of the rings', 'harry potter', 'game of thrones', 'the matrix',
]);

const SKILLS = new Set([
  'typescript', 'javascript', 'python', 'react', 'welding', 'robotics', 'photography',
]);

// Geographic suffixes → PLACE (a region/area, not a specific venue).
const GEO_SUFFIX = /\b(valley|hills?|heights|springs?|beach|city|lake|mountains?|canyon|mesa|grove|ridge|falls|gardens?|county|harbor|bay|island|park)$/i;
// Venue suffixes → LOCATION (a specific place you go to).
const VENUE_SUFFIX = /\b(house|home|apartment|apt|gym|studio|cafe|coffee|restaurant|bar|club|school|hospital|mall|store|shop|market|station|office|library|museum|stadium|arena|university|college|campus|building|tower|center|centre|church|temple|airport)$/i;
// Household: someone's dwelling.
const HOUSEHOLD_RE = /^(.+?)['’]s\s+(house|home|place|apartment|apt|crib|pad|spot)$/i;
// Group / family.
const GROUP_RE = /^(?:the\s+)?(.+?)\s+(family|familia|crew|team|band|squad|gang|group|collective|household)$/i;
// Event.
const EVENT_RE = /\b(party|wedding|graduation|funeral|birthday|reunion|quincea[nñ]era|barbecue|bbq|gathering|ceremony|celebration|memorial|baptism|anniversary)$/i;
// Person honorific / kinship prefixes.
const HONORIFIC_RE = /^(t[íi]o|t[íi]a|uncle|aunt|auntie|mom|mother|mama|mamá|mommy|dad|father|papa|papá|daddy|step\s*mom|step\s*dad|stepmom|stepdad|stepmother|stepfather|grandma|grandpa|abuela|abuelo|brother|sister|mr|mrs|ms|miss|dr|sir|cousin|primo|prima|coach|pastor|tía|tío)\b/i;

/** Context evidence that the name refers to a PERSON. */
function personContextEvidence(name: string, context?: string): boolean {
  if (!context) return false;
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ctx = context;
  // "my <relation> <Name>"
  if (new RegExp(`\\bmy\\s+(friend|cousin|brother|sister|mom|mother|dad|father|coworker|colleague|boss|manager|girlfriend|boyfriend|partner|wife|husband|uncle|aunt|t[íi]o|t[íi]a|roommate|neighbou?r|buddy|homie|ex)\\s+${n}\\b`, 'i').test(ctx)) return true;
  // "<Name> <person-predicate>"
  if (new RegExp(`\\b${n}\\s+(said|told|asked|texted|called|replied|mentioned|laughed|smiled|cried|came over|showed up|agreed|invited|hugged|drove|works|lives|loves|likes|thinks|feels|is my|was my)\\b`, 'i').test(ctx)) return true;
  // honorific immediately before the name in context
  if (new RegExp(`\\b(t[íi]o|t[íi]a|uncle|aunt|cousin|mr|mrs|ms|dr)\\s+${n}\\b`, 'i').test(ctx)) return true;
  return false;
}

/**
 * Classify an entity name (with optional surrounding text). Deterministic.
 * Order: most specific lexical/pattern signals first; PERSON only with evidence;
 * everything else → UNCLASSIFIED.
 */
export function classifyEntity(name: string, context?: string): Classification {
  const raw = name.trim();
  if (!raw || raw.length < 2) return { type: 'UNKNOWN', confidence: 0, reason: 'empty/too-short' };
  const lower = norm(raw);
  const lastWord = lower.split(' ').pop() ?? '';
  const variants = normVariants(raw);

  // 1) Apps & products & companies (exact lexicon) — never a person.
  if (variants.some(v => has(APPS, v))) return { type: 'APP', confidence: 0.97, reason: 'app lexicon' };
  if (variants.some(v => has(FOOD_DRINKS, v))) return { type: 'FOOD_DRINK', confidence: 0.96, reason: 'food/drink lexicon' };
  if (variants.some(v => has(PRODUCTS, v))) return { type: 'PRODUCT', confidence: 0.96, reason: 'product lexicon' };
  if (variants.some(v => has(BRANDS, v))) return { type: 'BRAND', confidence: 0.9, reason: 'brand lexicon' };
  if (variants.some(v => has(COMPANIES, v))) return { type: 'ORGANIZATION', confidence: 0.96, reason: 'organization lexicon' };
  if (variants.some(v => has(BANDS_AND_ORGS, v))) return { type: 'ORGANIZATION', confidence: 0.9, reason: 'band/organization lexicon' };
  if (variants.some(v => has(MEDIA, v))) return { type: 'MEDIA', confidence: 0.9, reason: 'media lexicon' };
  if (variants.some(v => has(SKILLS, v))) return { type: 'SKILL', confidence: 0.85, reason: 'skill lexicon' };
  // "<Company> <Product>" e.g. "Amazon Ring", "Google Nest"
  const firstWord = lower.split(' ')[0];
  if (lower.includes(' ') && has(COMPANIES, firstWord)) {
    return { type: 'PRODUCT', confidence: 0.85, reason: `company-prefixed product (${firstWord})` };
  }

  // 2) Household (possessive dwelling) — "Mom's House", "Tio Ralph's Place".
  if (HOUSEHOLD_RE.test(raw)) return { type: 'HOUSEHOLD', confidence: 0.9, reason: 'possessive dwelling' };

  // 3) Group / family — "Ralph Family", "the Morenos crew".
  if (/\bfamily|familia|household\b/i.test(raw) && GROUP_RE.test(raw)) {
    return { type: 'FAMILY', confidence: 0.88, reason: 'family/group suffix' };
  }
  if (GROUP_RE.test(raw)) return { type: 'GROUP', confidence: 0.85, reason: 'group suffix' };

  // 4) Event — "Graduation Party", "Maria's Wedding".
  if (EVENT_RE.test(lower)) return { type: 'EVENT', confidence: 0.82, reason: 'event noun' };

  // 5) Known places + geographic/venue suffixes + context prepositions.
  if (variants.some(v => has(VENUES, v))) return { type: 'LOCATION', confidence: 0.93, reason: 'known venue' };
  if (variants.some(v => has(PLACES, v))) return { type: 'PLACE', confidence: 0.92, reason: 'known place' };
  if (GEO_SUFFIX.test(lastWord)) return { type: 'PLACE', confidence: 0.8, reason: 'geographic suffix' };
  if (VENUE_SUFFIX.test(lastWord)) return { type: 'LOCATION', confidence: 0.8, reason: 'venue suffix' };
  if (context) {
    const n = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b(in|at|from|near|to)\\s+${n}(?!['’]s)\\b`, 'i').test(context.toLowerCase())) {
      return { type: 'LOCATION', confidence: 0.6, reason: 'locative preposition context' };
    }
  }

  // 6) Person — ONLY with evidence (honorific prefix or person-context).
  if (HONORIFIC_RE.test(raw)) return { type: 'PERSON', confidence: 0.9, reason: 'honorific/kinship prefix' };
  if (personContextEvidence(raw, context)) return { type: 'PERSON', confidence: 0.75, reason: 'person-context predicate' };

  // 7) Default — unknown proper noun. NEVER auto-person/character.
  return { type: 'UNKNOWN', confidence: 0.2, reason: 'no classifying evidence — requires more signal' };
}

/** Map the rich class to the legacy people_places storage type. */
export type StorageType = 'person' | 'place' | 'organization' | 'platform' | 'event' | 'unclassified';
export function toStorageType(c: EntityClass): StorageType {
  switch (c) {
    case 'PERSON': return 'person';
    case 'PLACE': case 'LOCATION': case 'HOUSEHOLD': return 'place';
    case 'ORGANIZATION': case 'COMPANY': case 'GROUP': case 'FAMILY': case 'BRAND': return 'organization';
    case 'PROJECT': case 'PRODUCT': case 'APP': case 'SKILL': case 'PET': case 'VEHICLE': case 'MEDIA': case 'FOOD_DRINK': return 'platform';
    case 'EVENT': return 'event';
    case 'UNKNOWN':
    case 'UNCLASSIFIED': return 'unclassified';
  }
}

export type LegacyOmegaEntityType =
  | 'PERSON' | 'CHARACTER' | 'LOCATION' | 'ORG' | 'EVENT'
  | 'PRODUCT' | 'APP' | 'BRAND' | 'PROJECT' | 'SKILL' | 'PET' | 'VEHICLE'
  | 'MEDIA' | 'FOOD_DRINK' | 'UNKNOWN';

export function toOmegaType(c: EntityClass): LegacyOmegaEntityType {
  switch (c) {
    case 'PERSON': return 'PERSON';
    case 'PLACE': case 'LOCATION': case 'HOUSEHOLD': return 'LOCATION';
    case 'ORGANIZATION': case 'COMPANY': case 'GROUP': case 'FAMILY': return 'ORG';
    case 'EVENT': return 'EVENT';
    case 'PRODUCT': return 'PRODUCT';
    case 'APP': return 'APP';
    case 'BRAND': return 'BRAND';
    case 'PROJECT': return 'PROJECT';
    case 'SKILL': return 'SKILL';
    case 'PET': return 'PET';
    case 'VEHICLE': return 'VEHICLE';
    case 'MEDIA': return 'MEDIA';
    case 'FOOD_DRINK': return 'FOOD_DRINK';
    case 'UNKNOWN':
    case 'UNCLASSIFIED':
      return 'UNKNOWN';
  }
}

export function isUnknownEntity(c: EntityClass): boolean {
  return c === 'UNKNOWN' || c === 'UNCLASSIFIED';
}

/** Only PERSON entities are eligible to become Character cards. */
export function isCharacterEligible(c: EntityClass): boolean {
  return c === 'PERSON';
}
