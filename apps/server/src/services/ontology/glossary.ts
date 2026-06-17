/**
 * Lexical glossary — the keyword source of truth for LoreBook's lexical
 * intelligence layer. Each entry maps a keyword (+ aliases) to a domain/category,
 * a confidence, a weight, and an optional relationship hint. Consumed by the
 * ontology hierarchy (ontology.ts) and the discovery/lexicalization engine
 * (lexicalIntelligence.ts). Deterministic, pre-LLM.
 *
 * Consolidates the lexicons previously scattered across entityClassifier.ts,
 * kinshipGlossary.ts, familyTreeService.ts, and CharacterBook.relationshipSignalsFor
 * (see docs/entity-keyword-glossary.md).
 */

export type RootType =
  | 'PERSON' | 'FAMILY' | 'GROUP' | 'ORGANIZATION' | 'LOCATION' | 'EVENT'
  | 'PROJECT' | 'PRODUCT' | 'APP' | 'BRAND' | 'MEDIA' | 'SKILL' | 'GOAL'
  | 'PET' | 'VEHICLE' | 'FOODDRINK' | 'CONCEPT' | 'TIME' | 'UNKNOWN';

export type RelationshipHint =
  | 'FAMILY_RELATIONSHIP' | 'SOCIAL_RELATIONSHIP' | 'ROMANTIC_RELATIONSHIP'
  | 'WORK_RELATIONSHIP' | 'MENTOR_RELATIONSHIP' | 'ADVERSARIAL_RELATIONSHIP'
  | 'CREATIVE_RELATIONSHIP';

export type QueryHint =
  | 'TEMPORAL_QUERY' | 'GOAL_QUERY' | 'PROJECT_QUERY' | 'SKILL_QUERY'
  | 'PERSON_QUERY' | 'LOCATION_QUERY' | 'EVENT_QUERY' | 'COMMUNITY_QUERY';

/** UI / CRUD intent — suggest (not auto-apply) mutations from natural language. */
export type ActionHint =
  | 'IDENTITY_CLAIM'
  | 'RELATIONSHIP_CLAIM'
  | 'DISAMBIGUATE'
  | 'OPEN_SURFACE';

export interface GlossaryEntry {
  keyword: string;            // canonical, lowercase
  aliases: string[];          // surface variants (lowercase)
  domain: RootType;
  category: string;           // e.g. FAMILY, VENUE, SHOW
  subcategory?: string;       // e.g. GRANDMOTHER, NIGHTCLUB
  weight: number;             // salience 0..1 (how strongly it implies the domain)
  confidence: number;         // base confidence 0..1
  relationshipHint?: RelationshipHint;
  queryHint?: QueryHint;
  actionHint?: ActionHint;
  /** Title-leading kinship/honorific (must start the name to imply kinship). */
  titleLeading?: boolean;
  /** Generation offset for kinship (self=0, parent=-1, grandparent=-2, child=+1). */
  generation?: number;
}

const E = (e: GlossaryEntry): GlossaryEntry => e;

export const GLOSSARY: GlossaryEntry[] = [
  // ── KINSHIP (PERSON/FAMILY, title-leading) ──────────────────────────────────
  E({ keyword: 'grandmother', aliases: ['abuela', 'abuelita', 'grandma', 'nana', 'nonna', 'granny'], domain: 'PERSON', category: 'FAMILY', subcategory: 'GRANDMOTHER', weight: 0.95, confidence: 0.95, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -2 }),
  E({ keyword: 'grandfather', aliases: ['abuelo', 'abuelito', 'grandpa', 'nono', 'grandfather'], domain: 'PERSON', category: 'FAMILY', subcategory: 'GRANDFATHER', weight: 0.95, confidence: 0.95, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -2 }),
  E({ keyword: 'mother', aliases: ['mom', 'mamá', 'mama', 'mommy', 'madre'], domain: 'PERSON', category: 'FAMILY', subcategory: 'MOTHER', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1 }),
  E({ keyword: 'father', aliases: ['dad', 'papá', 'papa', 'daddy', 'padre'], domain: 'PERSON', category: 'FAMILY', subcategory: 'FATHER', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1 }),
  E({ keyword: 'aunt', aliases: ['tía', 'tia', 'auntie'], domain: 'PERSON', category: 'FAMILY', subcategory: 'AUNT', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1 }),
  E({ keyword: 'uncle', aliases: ['tío', 'tio'], domain: 'PERSON', category: 'FAMILY', subcategory: 'UNCLE', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1 }),
  E({ keyword: 'cousin', aliases: ['primo', 'prima'], domain: 'PERSON', category: 'FAMILY', subcategory: 'COUSIN', weight: 0.85, confidence: 0.85, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: 0 }),
  E({ keyword: 'sibling', aliases: ['brother', 'sister', 'hermano', 'hermana', 'bro', 'sis'], domain: 'PERSON', category: 'FAMILY', subcategory: 'SIBLING', weight: 0.85, confidence: 0.85, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: 0 }),

  // ── LOCATION (venues + dwellings + geography) ───────────────────────────────
  E({ keyword: 'nightclub', aliases: ['club', 'nightclub', 'dancefloor', 'dance floor'], domain: 'LOCATION', category: 'VENUE', subcategory: 'NIGHTCLUB', weight: 0.85, confidence: 0.8, queryHint: 'LOCATION_QUERY' }),
  E({ keyword: 'bar', aliases: ['bar', 'pub', 'tavern', 'lounge'], domain: 'LOCATION', category: 'VENUE', subcategory: 'BAR', weight: 0.8, confidence: 0.78 }),
  E({ keyword: 'venue', aliases: ['venue', 'warehouse', 'stage', 'arena', 'stadium', 'theater', 'theatre'], domain: 'LOCATION', category: 'VENUE', subcategory: 'MUSIC_VENUE', weight: 0.78, confidence: 0.75 }),
  E({ keyword: 'pool_hall', aliases: ['pool hall', 'billiards', 'pool and billiards'], domain: 'LOCATION', category: 'VENUE', subcategory: 'POOL_HALL', weight: 0.8, confidence: 0.78 }),
  E({ keyword: 'gym', aliases: ['gym', 'dojo', 'fitness center'], domain: 'LOCATION', category: 'VENUE', subcategory: 'GYM', weight: 0.8, confidence: 0.78 }),
  E({ keyword: 'residence', aliases: ['house', 'home', 'apartment', 'apt', 'casa'], domain: 'LOCATION', category: 'DWELLING', subcategory: 'RESIDENCE', weight: 0.75, confidence: 0.72 }),
  E({ keyword: 'park', aliases: ['park', 'square park'], domain: 'LOCATION', category: 'OUTDOOR', subcategory: 'PARK', weight: 0.72, confidence: 0.7 }),
  E({ keyword: 'store', aliases: ['store', 'shop', 'market', 'costco', 'walmart', 'mall'], domain: 'LOCATION', category: 'RETAIL', subcategory: 'STORE', weight: 0.7, confidence: 0.7 }),

  // ── EVENT ───────────────────────────────────────────────────────────────────
  E({ keyword: 'show', aliases: ['show', 'concert', 'gig', 'warehouse show', 'set', 'performance'], domain: 'EVENT', category: 'SHOW', subcategory: 'CONCERT', weight: 0.85, confidence: 0.8, queryHint: 'EVENT_QUERY' }),
  E({ keyword: 'party', aliases: ['party', 'kickback', 'function', 'rager'], domain: 'EVENT', category: 'GATHERING', subcategory: 'PARTY', weight: 0.82, confidence: 0.78, queryHint: 'EVENT_QUERY' }),
  E({ keyword: 'ceremony', aliases: ['wedding', 'graduation', 'funeral', 'quinceañera', 'birthday', 'anniversary'], domain: 'EVENT', category: 'CEREMONY', weight: 0.85, confidence: 0.82, queryHint: 'EVENT_QUERY' }),
  E({ keyword: 'interview', aliases: ['interview', 'onboarding', 'meeting'], domain: 'EVENT', category: 'WORK_EVENT', weight: 0.7, confidence: 0.7 }),

  // ── GROUP / COMMUNITY / ORGANIZATION ────────────────────────────────────────
  E({ keyword: 'band', aliases: ['band', 'crew', 'collective'], domain: 'GROUP', category: 'MUSIC_GROUP', subcategory: 'BAND', weight: 0.8, confidence: 0.76, queryHint: 'COMMUNITY_QUERY' }),
  E({ keyword: 'scene', aliases: ['scene', 'subculture', 'goths', 'community', 'communities', 'my crew', 'my people', 'social circle'], domain: 'GROUP', category: 'COMMUNITY', subcategory: 'SUBCULTURE', weight: 0.75, confidence: 0.72, queryHint: 'COMMUNITY_QUERY' }),
  E({ keyword: 'team', aliases: ['team', 'squad', 'fight team'], domain: 'GROUP', category: 'TEAM', weight: 0.75, confidence: 0.72 }),
  E({ keyword: 'company', aliases: ['company', 'corp', 'inc', 'agency', 'staffing'], domain: 'ORGANIZATION', category: 'COMPANY', weight: 0.85, confidence: 0.82 }),

  // ── PROJECT / SKILL / GOAL (also query cues) ────────────────────────────────
  E({ keyword: 'project', aliases: ['project', 'building', 'creating', 'shipping', 'launch'], domain: 'PROJECT', category: 'INITIATIVE', weight: 0.7, confidence: 0.7, queryHint: 'PROJECT_QUERY' }),
  E({ keyword: 'skill', aliases: ['skill', 'practicing', 'learning', 'training', 'leveling up'], domain: 'SKILL', category: 'CAPABILITY', weight: 0.7, confidence: 0.7, queryHint: 'SKILL_QUERY' }),
  E({ keyword: 'goal', aliases: ['goal', 'working toward', 'working towards', 'aspiration', 'objective', 'aiming for'], domain: 'GOAL', category: 'OBJECTIVE', weight: 0.7, confidence: 0.7, queryHint: 'GOAL_QUERY' }),

  // ── APP / PRODUCT / BRAND / FOODDRINK (anti-Person guards) ──────────────────
  E({ keyword: 'app', aliases: ['find my', 'venmo', 'cash app', 'zelle', 'instagram', 'snapchat', 'tiktok', 'whatsapp', 'spotify', 'discord', 'chatgpt'], domain: 'APP', category: 'SOFTWARE', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'product', aliases: ['amazon ring', 'ring', 'alexa', 'iphone', 'airpods', 'playstation', 'xbox', 'tesla'], domain: 'PRODUCT', category: 'DEVICE', weight: 0.88, confidence: 0.88 }),
  E({ keyword: 'fooddrink', aliases: ['high noon', 'white claw', 'modelo', 'corona', 'red bull', 'boba', 'matcha'], domain: 'FOODDRINK', category: 'CONSUMABLE', weight: 0.88, confidence: 0.88 }),

  // ── RELATIONSHIP VERBS (hints, not entities) ────────────────────────────────
  E({ keyword: 'went with', aliases: ['went with', 'hung out with', 'met with', 'kicked it with', 'linked up with', 'saw'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.6, confidence: 0.6, relationshipHint: 'SOCIAL_RELATIONSHIP' }),
  E({ keyword: 'works at', aliases: ['works at', 'work with', 'my coworker', 'my boss', 'my manager', 'my colleague'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.7, confidence: 0.7, relationshipHint: 'WORK_RELATIONSHIP' }),
  E({ keyword: 'dating', aliases: ['dating', 'my girlfriend', 'my boyfriend', 'my partner', 'hooked up with', 'my ex', 'crush on'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.75, confidence: 0.72, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'mentor', aliases: ['my mentor', 'my coach', 'taught me', 'my teacher', 'my instructor'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.72, confidence: 0.7, relationshipHint: 'MENTOR_RELATIONSHIP' }),
  E({ keyword: 'conflict_verb', aliases: ['fell out with', "can't stand", 'beef with', 'rival', 'enemy', 'hate', 'argued with', 'cut off', 'estranged', 'estranged from'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.75, confidence: 0.72, relationshipHint: 'ADVERSARIAL_RELATIONSHIP' }),
  E({ keyword: 'my_family', aliases: ['my uncle', 'my aunt', 'my mom', 'my dad', 'my grandma', 'my grandpa', 'my cousin', 'my tío', 'my tía', 'my abuela', 'my abuelo', 'my estranged father', 'my estranged mother', 'estranged father', 'estranged mother'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.95, confidence: 0.95, relationshipHint: 'FAMILY_RELATIONSHIP' }),

  // ── TIME (query cues) ───────────────────────────────────────────────────────
  E({ keyword: 'today', aliases: ['today', 'this morning', 'tonight'], domain: 'TIME', category: 'RELATIVE_DATE', weight: 0.9, confidence: 0.9, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'yesterday', aliases: ['yesterday', 'last night'], domain: 'TIME', category: 'RELATIVE_DATE', weight: 0.9, confidence: 0.9, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'this_week', aliases: ['this week', 'last week', 'this month', 'last month', 'recently', 'lately'], domain: 'TIME', category: 'RELATIVE_RANGE', weight: 0.85, confidence: 0.85, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'era', aliases: ['back in high school', 'during college', 'when i worked at', 'growing up'], domain: 'TIME', category: 'ERA', weight: 0.7, confidence: 0.7, queryHint: 'TEMPORAL_QUERY' }),

  // ── ACTION VERBS (identity / disambiguation / navigation) ─────────────────
  E({ keyword: 'is_me', aliases: ['actually me', "that's me", 'thats me', 'this is me', 'am me', 'is me'], domain: 'CONCEPT', category: 'IDENTITY_VERB', weight: 0.95, confidence: 0.92, actionHint: 'IDENTITY_CLAIM' }),
  E({ keyword: 'my_name_is', aliases: ['my name is', 'my legal name is', 'call me'], domain: 'CONCEPT', category: 'IDENTITY_VERB', weight: 0.9, confidence: 0.9, actionHint: 'IDENTITY_CLAIM' }),
  E({ keyword: 'same_name', aliases: ['same name', 'also named', 'also my name', 'shares my name', 'name collision', 'two different people', 'different person', 'not the same person', 'but its also my', "but it's also my", 'also my estranged'], domain: 'CONCEPT', category: 'DISAMBIGUATION', weight: 0.88, confidence: 0.88, actionHint: 'DISAMBIGUATE' }),
  E({ keyword: 'open_characters', aliases: ['show my characters', 'open characters', 'character book', 'my character card'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.75, confidence: 0.75, actionHint: 'OPEN_SURFACE' }),
  E({ keyword: 'open_family', aliases: ['show my family', 'open family', 'family tree', 'my family'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.75, confidence: 0.75, actionHint: 'OPEN_SURFACE' }),
];

// Fast alias → entry lookup (longest aliases first so multi-word wins).
const ALIAS_INDEX: Array<{ alias: string; entry: GlossaryEntry }> = GLOSSARY
  .flatMap((entry) => [entry.keyword, ...entry.aliases].map((alias) => ({ alias: alias.toLowerCase(), entry })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function lookupKeyword(token: string): GlossaryEntry | null {
  const t = token.trim().toLowerCase().replace(/['’]/g, "'");
  for (const { alias, entry } of ALIAS_INDEX) {
    if (alias === t) return entry;
  }
  return null;
}

/** All glossary aliases (longest-first) — for scanning free text. */
export function glossaryAliases(): Array<{ alias: string; entry: GlossaryEntry }> {
  return ALIAS_INDEX;
}
