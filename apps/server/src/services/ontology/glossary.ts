/**
 * Lexical glossary — the keyword source of truth for LoreBook's lexical
 * intelligence layer. Each entry maps a keyword (+ aliases) to a domain/category,
 * a confidence, a weight, and optional hints (relationship, query, action, surface).
 * Consumed by the ontology hierarchy (ontology.ts) and the discovery/lexicalization
 * engine (lexicalIntelligence.ts). Deterministic, pre-LLM.
 *
 * Consolidates lexicons from entityClassifier, kinshipGlossary, Discovery Hub
 * panels, Book surfaces (Characters/Locations/Organizations/Family/Love/Timeline),
 * entity authority, and spatial/social classifiers (see docs/ontology-inventory.md).
 */

export type { RootType } from './canonical/rootType';
import type { RootType } from './canonical/rootType';

export type RelationshipHint =
  | 'FAMILY_RELATIONSHIP' | 'SOCIAL_RELATIONSHIP' | 'ROMANTIC_RELATIONSHIP'
  | 'WORK_RELATIONSHIP' | 'MENTOR_RELATIONSHIP' | 'ADVERSARIAL_RELATIONSHIP'
  | 'CREATIVE_RELATIONSHIP';

export type QueryHint =
  | 'TEMPORAL_QUERY' | 'GOAL_QUERY' | 'PROJECT_QUERY' | 'SKILL_QUERY'
  | 'PERSON_QUERY' | 'LOCATION_QUERY' | 'EVENT_QUERY' | 'COMMUNITY_QUERY'
  | 'RELATIONSHIP_QUERY' | 'IDENTITY_QUERY' | 'MEMORY_QUERY' | 'INSIGHT_QUERY'
  | 'DECISION_QUERY' | 'CONTRADICTION_QUERY' | 'ESSENCE_QUERY' | 'ANALYTICS_QUERY';

/** UI / CRUD intent — suggest (not auto-apply) mutations from natural language. */
export type ActionHint =
  | 'IDENTITY_CLAIM'
  | 'RELATIONSHIP_CLAIM'
  | 'DISAMBIGUATE'
  | 'OPEN_SURFACE'
  | 'ENTITY_AUTHORITY';

export interface GlossaryEntry {
  keyword: string;            // canonical, lowercase
  aliases: string[];          // surface variants (lowercase)
  domain: RootType;
  category: string;           // e.g. FAMILY, VENUE, SHOW, NAV_VERB
  subcategory?: string;       // e.g. GRANDMOTHER, NIGHTCLUB
  weight: number;             // salience 0..1 (how strongly it implies the domain)
  confidence: number;         // base confidence 0..1
  relationshipHint?: RelationshipHint;
  queryHint?: QueryHint;
  actionHint?: ActionHint;
  /** Route target for OPEN_SURFACE / ENTITY_AUTHORITY nav chips (e.g. discovery/soul-profile). */
  surfaceTarget?: string;
  /** Title-leading kinship/honorific (must start the name to imply kinship). */
  titleLeading?: boolean;
  /** Generation offset for kinship (self=0, parent=-1, grandparent=-2, child=+1). */
  generation?: number;
  /**
   * Kinship surface form (FAMILY entries only) — the single source of truth for the
   * kinship extractors that previously hard-coded their own alias tables:
   *   TITLE_ONLY  the title can stand alone ("Mom", "Abuela")
   *   TITLED      the title usually precedes a given name ("Tío Juan", "Cousin Ray")
   */
  kinshipForm?: 'TITLE_ONLY' | 'TITLED';
  /**
   * Stance cue form (STANCE_* entries only) — hint-only, never discovered as entities.
   *   PHRASE   multi-word cue ("can't stand", "i believe that")
   *   VERB     conjugatable verb lemma ("love" + aliases loves, loved)
   *   EMOTION  felt-emotion surface → subcategory holds canonical label (joy, anxiety, …)
   */
  stanceForm?: 'PHRASE' | 'VERB' | 'EMOTION';
}

const E = (e: GlossaryEntry): GlossaryEntry => e;

export const GLOSSARY: GlossaryEntry[] = [
  // ── KINSHIP (PERSON/FAMILY, title-leading) ──────────────────────────────────
  E({ keyword: 'grandmother', aliases: ['abuela', 'abuelita', 'grandma', 'nana', 'nonna', 'granny'], domain: 'PERSON', category: 'FAMILY', subcategory: 'GRANDMOTHER', weight: 0.95, confidence: 0.95, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -2, kinshipForm: 'TITLE_ONLY' }),
  E({ keyword: 'grandfather', aliases: ['abuelo', 'abuelito', 'grandpa', 'nono', 'grandfather'], domain: 'PERSON', category: 'FAMILY', subcategory: 'GRANDFATHER', weight: 0.95, confidence: 0.95, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -2, kinshipForm: 'TITLE_ONLY' }),
  E({ keyword: 'mother', aliases: ['mom', 'mamá', 'mama', 'mommy', 'madre'], domain: 'PERSON', category: 'FAMILY', subcategory: 'MOTHER', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1, kinshipForm: 'TITLE_ONLY' }),
  E({ keyword: 'father', aliases: ['dad', 'papá', 'papa', 'daddy', 'padre'], domain: 'PERSON', category: 'FAMILY', subcategory: 'FATHER', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1, kinshipForm: 'TITLE_ONLY' }),
  E({ keyword: 'aunt', aliases: ['tía', 'tia', 'auntie'], domain: 'PERSON', category: 'FAMILY', subcategory: 'AUNT', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1, kinshipForm: 'TITLED' }),
  E({ keyword: 'uncle', aliases: ['tío', 'tio'], domain: 'PERSON', category: 'FAMILY', subcategory: 'UNCLE', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1, kinshipForm: 'TITLED' }),
  E({ keyword: 'cousin', aliases: ['primo', 'prima'], domain: 'PERSON', category: 'FAMILY', subcategory: 'COUSIN', weight: 0.85, confidence: 0.85, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: 0, kinshipForm: 'TITLED' }),
  E({ keyword: 'sibling', aliases: ['brother', 'sister', 'hermano', 'hermana', 'bro', 'sis'], domain: 'PERSON', category: 'FAMILY', subcategory: 'SIBLING', weight: 0.85, confidence: 0.85, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: 0, kinshipForm: 'TITLED' }),

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
  E({ keyword: 'dating', aliases: ['dating', 'my girlfriend', 'my boyfriend', 'my partner', 'hooked up with', 'my ex', 'crush on', 'seeing someone', 'talking to', 'talking stage', 'went on a date', 'date night', 'date with'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.75, confidence: 0.72, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'situationship', aliases: ['situationship', 'undefined relationship', 'not official', 'no label', 'complicated thing'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.78, confidence: 0.76, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_interest', aliases: ['crush', 'infatuation', 'obsessed with', 'in love with', 'falling for', 'chemistry with', 'attracted to', 'have a thing for'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.74, confidence: 0.72, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_commitment', aliases: ['my wife', 'my husband', 'my fiancé', 'my fiancée', 'engaged to', 'married to', 'in a relationship with', 'exclusive with'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.82, confidence: 0.8, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_casual', aliases: ['friends with benefits', 'fwb', 'hooking up', 'one night stand', 'casual thing', 'fuck buddy', 'no strings'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.72, confidence: 0.7, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_ended', aliases: ['my ex', 'ex boyfriend', 'ex girlfriend', 'ex wife', 'ex husband', 'broke up', 'breakup', 'split up', 'ended things', 'we broke up'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.8, confidence: 0.78, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_no_contact', aliases: ['ghosted me', 'ghosted', 'left on read', 'blocked me', 'blocked', 'stopped responding', 'disappeared on me', 'no contact'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.78, confidence: 0.76, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'vicarious_possessive', aliases: ["'s boyfriend", "'s girlfriend", "'s partner", "'s lover", "'s ex", 'her new boyfriend', 'his new girlfriend', 'their ex'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.8, confidence: 0.78, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'vicarious_overlap', aliases: ['seeing someone else', 'cheating on', 'with someone else', 'texting another', 'talking to other', 'side piece', 'other guy', 'other girl'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.82, confidence: 0.8, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'vicarious_hearsay', aliases: ['i heard she', 'i heard he', 'apparently they', 'someone said', 'they admitted', 'she admitted', 'he admitted'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.76, confidence: 0.74, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'vicarious_anonymous', aliases: ['someone else', 'some guy', 'some girl', 'another man', 'another woman', 'unnamed partner', 'seeing someone'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.72, confidence: 0.7, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'vicarious_confirm', aliases: ['they are together', "they're together", 'yeah they', 'definitely seeing', 'confirmed', 'i met him', 'i met her'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.84, confidence: 0.82, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'vicarious_family', aliases: ["'s mom", "'s dad", "'s sister", "'s brother", "'s parents", "'s cousin", 'stepmom', 'stepdad', 'mother-in-law', 'in-law'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.82, confidence: 0.8, relationshipHint: 'FAMILY_RELATIONSHIP' }),
  E({ keyword: 'vicarious_social', aliases: ["'s roommate", "'s best friend", "'s friend", 'mutual friend', 'lives with', 'hangs out with'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.8, confidence: 0.78, relationshipHint: 'SOCIAL_RELATIONSHIP' }),
  E({ keyword: 'vicarious_work', aliases: ["'s manager", "'s boss", "'s coworker", "'s colleague", 'works with', 'reports to', 'business partner'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.82, confidence: 0.8, relationshipHint: 'WORK_RELATIONSHIP' }),
  E({ keyword: 'vicarious_mentor', aliases: ["'s coach", "'s therapist", "'s mentor", "'s professor", 'life coach', 'counselor'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.8, confidence: 0.78, relationshipHint: 'MENTOR_RELATIONSHIP' }),
  E({ keyword: 'vicarious_adversarial', aliases: ["'s lawyer", "'s ally", 'turned them against', 'beef with', 'their friend who'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.82, confidence: 0.8, relationshipHint: 'ADVERSARIAL_RELATIONSHIP' }),
  E({ keyword: 'vicarious_creative', aliases: ["'s agent", "'s producer", 'bandmate', 'collaborator', 'gallery rep', 'co-writer'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.82, confidence: 0.78, relationshipHint: 'CREATIVE_RELATIONSHIP' }),
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
  E({ keyword: 'open_characters', aliases: ['show my characters', 'open characters', 'character book', 'my character card'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.75, confidence: 0.75, actionHint: 'OPEN_SURFACE', surfaceTarget: 'characters' }),
  E({ keyword: 'open_family', aliases: ['show my family', 'open family', 'family tree', 'my family'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.75, confidence: 0.75, actionHint: 'OPEN_SURFACE', surfaceTarget: 'family' }),

  // ── DISCOVERY HUB — panel navigation (mirrors DiscoveryHub.tsx routes) ─────
  E({ keyword: 'open_discovery', aliases: ['discovery hub', 'open discovery', 'my insights dashboard', 'analytics dashboard', 'deep intelligence'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.8, confidence: 0.78, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery' }),
  E({ keyword: 'open_soul_profile', aliases: ['soul profile', 'my essence', 'hopes and dreams', 'my hopes', 'my fears', 'my strengths'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.78, confidence: 0.76, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/soul-profile', queryHint: 'ESSENCE_QUERY' }),
  E({ keyword: 'open_revealed_self', aliases: ['revealed self', 'what i actually do', 'stated vs revealed', 'revealed preferences'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.78, confidence: 0.76, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/revealed-self', queryHint: 'CONTRADICTION_QUERY' }),
  E({ keyword: 'open_contradictions', aliases: ['contradictions panel', 'truth seeker', 'what contradicts', 'inner conflict'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/contradictions', queryHint: 'CONTRADICTION_QUERY' }),
  E({ keyword: 'open_identity_pulse', aliases: ['identity pulse', 'identity drift', 'who am i becoming', 'my identity'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.78, confidence: 0.76, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/identity', queryHint: 'IDENTITY_QUERY' }),
  E({ keyword: 'open_relationships_analytics', aliases: ['relationship analytics', 'relationship network', 'my network graph', 'attachment dynamics'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/relationships', queryHint: 'RELATIONSHIP_QUERY' }),
  E({ keyword: 'open_insights', aliases: ['insights and predictions', 'my insights', 'pattern predictions', 'what patterns'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/insights-predictions', queryHint: 'INSIGHT_QUERY' }),
  E({ keyword: 'open_values_habits', aliases: ['values and habits', 'my habits', 'behavioral patterns', 'goal alignment'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.74, confidence: 0.72, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/values-habits', queryHint: 'GOAL_QUERY' }),
  E({ keyword: 'open_decisions', aliases: ['decision memory', 'past decisions', 'decisions i made', 'decision journal'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/decisions', queryHint: 'DECISION_QUERY' }),
  E({ keyword: 'open_life_arc', aliases: ['recent moments', 'life arc', 'what has been going on', 'lately in my life', 'narrative summary'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.78, confidence: 0.76, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/life-arc', queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'open_shadow', aliases: ['shadow profile', 'shadow analytics', 'inner critic', 'suppressed patterns', 'shadow self'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/shadow', queryHint: 'INSIGHT_QUERY' }),
  E({ keyword: 'open_xp', aliases: ['skills and progress', 'xp dashboard', 'my level', 'life xp', 'skill development'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.74, confidence: 0.72, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/xp', queryHint: 'SKILL_QUERY' }),
  E({ keyword: 'open_reactions', aliases: ['reactions and resilience', 'recovery patterns', 'emotional resilience', 'how i react'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.74, confidence: 0.72, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/reactions-resilience', queryHint: 'INSIGHT_QUERY' }),
  E({ keyword: 'open_activity', aliases: ['activity calendar', 'journaling streak', 'writing heatmap', 'active days'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.72, confidence: 0.7, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/activity', queryHint: 'ANALYTICS_QUERY' }),
  E({ keyword: 'open_life_stats', aliases: ['life stats', 'words written', 'journaling stats', 'peak writing hours'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.72, confidence: 0.7, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/life-stats', queryHint: 'ANALYTICS_QUERY' }),
  E({ keyword: 'open_achievements', aliases: ['my achievements', 'milestones unlocked', 'achievement board', 'badges earned'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.74, confidence: 0.72, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/achievements', queryHint: 'ANALYTICS_QUERY' }),
  E({ keyword: 'open_memory_management', aliases: ['memory management', 'what ai knows', 'memory explorer', 'entity claims'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/memory-management', queryHint: 'MEMORY_QUERY' }),
  E({ keyword: 'open_memory_review', aliases: ['memory review queue', 'review memories', 'pending proposals', 'approve memories'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.78, confidence: 0.76, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/memory-review', queryHint: 'MEMORY_QUERY' }),
  E({ keyword: 'open_continuity', aliases: ['continuity intelligence', 'identity drift alerts', 'abandoned goals', 'continuity dashboard'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.74, confidence: 0.72, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/continuity', queryHint: 'INSIGHT_QUERY' }),
  E({ keyword: 'open_corrections', aliases: ['corrections dashboard', 'memory corrections', 'prune memories', 'fix wrong facts'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/correction-dashboard', queryHint: 'MEMORY_QUERY' }),
  E({ keyword: 'open_memory_fade', aliases: ['fading memories', 'memories fading', 'forgetting old entries'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.72, confidence: 0.7, actionHint: 'OPEN_SURFACE', surfaceTarget: 'discovery/memory-fade', queryHint: 'MEMORY_QUERY' }),

  // ── BOOK SURFACES — main LoreBook navigation ───────────────────────────────
  E({ keyword: 'open_locations', aliases: ['location book', 'open locations', 'my places', 'places book'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.75, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'locations', queryHint: 'LOCATION_QUERY' }),
  E({ keyword: 'open_organizations', aliases: ['organizations book', 'open organizations', 'my groups', 'groups book'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.75, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'organizations', queryHint: 'COMMUNITY_QUERY' }),
  E({ keyword: 'open_love', aliases: ['love and relationships', 'romantic relationships', 'my relationships view'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'love', queryHint: 'RELATIONSHIP_QUERY' }),
  E({ keyword: 'open_timeline', aliases: ['life log', 'open timeline', 'omni timeline', 'my chronology'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.76, confidence: 0.74, actionHint: 'OPEN_SURFACE', surfaceTarget: 'timeline', queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'open_lorebook', aliases: ['lorebook', 'open lorebook', 'my memoir', 'living biography'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.74, confidence: 0.72, actionHint: 'OPEN_SURFACE', surfaceTarget: 'lorebook' }),
  E({ keyword: 'open_quests', aliases: ['my quests', 'quest book', 'open quests'], domain: 'CONCEPT', category: 'NAV_VERB', weight: 0.72, confidence: 0.7, actionHint: 'OPEN_SURFACE', surfaceTarget: 'quests', queryHint: 'GOAL_QUERY' }),

  // ── ESSENCE / SOUL PROFILE signals (Discovery: Soul Profile) ───────────────
  E({ keyword: 'hope', aliases: ['my hope', 'hoping for', 'i hope', 'dream of', 'aspire to'], domain: 'CONCEPT', category: 'ESSENCE_SIGNAL', subcategory: 'HOPE', weight: 0.72, confidence: 0.7, queryHint: 'ESSENCE_QUERY' }),
  E({ keyword: 'fear', aliases: ['my fear', 'afraid of', 'scared of', 'anxious about', 'worried that'], domain: 'CONCEPT', category: 'ESSENCE_SIGNAL', subcategory: 'FEAR', weight: 0.72, confidence: 0.7, queryHint: 'ESSENCE_QUERY' }),
  E({ keyword: 'strength', aliases: ['my strength', 'good at', 'natural at', 'talented at'], domain: 'CONCEPT', category: 'ESSENCE_SIGNAL', subcategory: 'STRENGTH', weight: 0.7, confidence: 0.68, queryHint: 'ESSENCE_QUERY' }),
  E({ keyword: 'weakness', aliases: ['my weakness', 'struggle with', 'bad at', 'not good at'], domain: 'CONCEPT', category: 'ESSENCE_SIGNAL', subcategory: 'WEAKNESS', weight: 0.68, confidence: 0.66, queryHint: 'ESSENCE_QUERY' }),
  E({ keyword: 'core_value', aliases: ['core value', 'what matters to me', 'most important to me', 'my values'], domain: 'GOAL', category: 'ESSENCE_SIGNAL', subcategory: 'VALUE', weight: 0.75, confidence: 0.72, queryHint: 'ESSENCE_QUERY' }),

  // ── SHADOW / IDENTITY signals (Discovery: Shadow, Identity Pulse) ──────────
  E({ keyword: 'perfectionism', aliases: ['perfectionist', 'never good enough', 'has to be perfect', 'all or nothing'], domain: 'CONCEPT', category: 'SHADOW_SIGNAL', subcategory: 'PERFECTIONIST', weight: 0.78, confidence: 0.76, queryHint: 'INSIGHT_QUERY' }),
  E({ keyword: 'people_pleasing', aliases: ['people pleaser', 'cant say no', "can't say no", 'always accommodating'], domain: 'CONCEPT', category: 'SHADOW_SIGNAL', subcategory: 'PEOPLE_PLEASER', weight: 0.76, confidence: 0.74, queryHint: 'INSIGHT_QUERY' }),
  E({ keyword: 'self_doubt', aliases: ['inner critic', 'imposter syndrome', 'not worthy', 'who do i think i am'], domain: 'CONCEPT', category: 'SHADOW_SIGNAL', subcategory: 'INNER_CRITIC', weight: 0.76, confidence: 0.74, queryHint: 'INSIGHT_QUERY' }),
  E({ keyword: 'identity_shift', aliases: ['identity shift', 'becoming someone new', 'not who i was', 'different person now'], domain: 'CONCEPT', category: 'IDENTITY_SIGNAL', weight: 0.74, confidence: 0.72, queryHint: 'IDENTITY_QUERY' }),

  // ── CONTRADICTION / REVEALED-SELF signals ──────────────────────────────────
  E({ keyword: 'contradiction', aliases: ['contradict myself', 'hypocrite', 'said one thing did another', 'doesnt match what i said', "doesn't match what i said"], domain: 'CONCEPT', category: 'CONTRADICTION_SIGNAL', weight: 0.8, confidence: 0.78, queryHint: 'CONTRADICTION_QUERY' }),
  E({ keyword: 'stated_vs_revealed', aliases: ['say i care but', 'claim to value', 'tell myself i', 'in theory i'], domain: 'CONCEPT', category: 'CONTRADICTION_SIGNAL', weight: 0.74, confidence: 0.72, queryHint: 'CONTRADICTION_QUERY' }),

  // ── DECISION MEMORY signals ────────────────────────────────────────────────
  E({ keyword: 'decided', aliases: ['i decided', 'made the call', 'chose to', 'going with', 'weighing options', 'crossroads'], domain: 'CONCEPT', category: 'DECISION_SIGNAL', weight: 0.76, confidence: 0.74, queryHint: 'DECISION_QUERY' }),
  E({ keyword: 'outcome', aliases: ['how it turned out', 'in hindsight', 'looking back on', 'decision outcome'], domain: 'CONCEPT', category: 'DECISION_SIGNAL', weight: 0.72, confidence: 0.7, queryHint: 'DECISION_QUERY' }),

  // ── MEMORY / CORRECTION signals ────────────────────────────────────────────
  E({ keyword: 'remember_wrong', aliases: ['thats wrong', "that's wrong", 'you misremembered', 'not what happened', 'correction:', 'actually it was'], domain: 'CONCEPT', category: 'CORRECTION_VERB', weight: 0.85, confidence: 0.82, queryHint: 'MEMORY_QUERY' }),
  E({ keyword: 'forget_memory', aliases: ['forget that', 'dont remember that', "don't remember that", 'never said that', 'delete that memory'], domain: 'CONCEPT', category: 'MEMORY_SIGNAL', weight: 0.78, confidence: 0.76, queryHint: 'MEMORY_QUERY' }),
  E({ keyword: 'recall_past', aliases: ['remember when', 'what did i say about', 'remind me about', 'recall my'], domain: 'CONCEPT', category: 'RECALL_VERB', weight: 0.8, confidence: 0.78, queryHint: 'MEMORY_QUERY' }),

  // ── ENTITY AUTHORITY signals (merge / alias / duplicate review) ─────────────
  E({ keyword: 'same_person', aliases: ['same person', 'duplicate character', 'merge them', 'combine profiles', 'thats the same guy', "that's the same guy"], domain: 'CONCEPT', category: 'ENTITY_AUTHORITY', subcategory: 'MERGE', weight: 0.85, confidence: 0.82, actionHint: 'ENTITY_AUTHORITY', surfaceTarget: 'entity-authority' }),
  E({ keyword: 'also_called', aliases: ['also called', 'also known as', 'goes by', 'aka', 'nickname for'], domain: 'CONCEPT', category: 'ENTITY_AUTHORITY', subcategory: 'ALIAS', weight: 0.82, confidence: 0.8, actionHint: 'ENTITY_AUTHORITY', surfaceTarget: 'entity-authority' }),
  E({ keyword: 'not_duplicate', aliases: ['different person', 'not the same', 'separate people', 'keep separate'], domain: 'CONCEPT', category: 'ENTITY_AUTHORITY', subcategory: 'DISMISS', weight: 0.8, confidence: 0.78, actionHint: 'ENTITY_AUTHORITY', surfaceTarget: 'entity-authority' }),

  // ── ANALYTICS / ACHIEVEMENT / RESILIENCE signals ───────────────────────────
  E({ keyword: 'streak', aliases: ['day streak', 'consecutive days', 'keep the streak'], domain: 'CONCEPT', category: 'ANALYTICS_SIGNAL', subcategory: 'STREAK', weight: 0.72, confidence: 0.7, queryHint: 'ANALYTICS_QUERY' }),
  E({ keyword: 'milestone', aliases: ['milestone', 'achievement unlocked', 'level up', 'reached level'], domain: 'CONCEPT', category: 'ANALYTICS_SIGNAL', subcategory: 'ACHIEVEMENT', weight: 0.74, confidence: 0.72, queryHint: 'ANALYTICS_QUERY' }),
  E({ keyword: 'resilience', aliases: ['bounced back', 'recovered from', 'recovery time', 'got over it'], domain: 'CONCEPT', category: 'ANALYTICS_SIGNAL', subcategory: 'RESILIENCE', weight: 0.72, confidence: 0.7, queryHint: 'INSIGHT_QUERY' }),
  E({ keyword: 'pattern', aliases: ['recurring pattern', 'keeps happening', 'notice a pattern', 'again and again'], domain: 'CONCEPT', category: 'INSIGHT_SIGNAL', weight: 0.74, confidence: 0.72, queryHint: 'INSIGHT_QUERY' }),

  // ── HABITS / VALUES (Discovery: Values & Habits tab) ───────────────────────
  E({ keyword: 'habit', aliases: ['habit', 'daily routine', 'every morning i', 'streak of', 'trying to build'], domain: 'GOAL', category: 'HABIT', weight: 0.72, confidence: 0.7, queryHint: 'GOAL_QUERY' }),
  E({ keyword: 'value_priority', aliases: ['prioritize', 'most important', 'value above all', 'non negotiable'], domain: 'GOAL', category: 'VALUE', weight: 0.72, confidence: 0.7, queryHint: 'GOAL_QUERY' }),

  // ── EXTENDED LOCATIONS (spatial ontology alignment) ────────────────────────
  E({ keyword: 'coffee_shop', aliases: ['coffee shop', 'cafe', 'café', 'starbucks'], domain: 'LOCATION', category: 'VENUE', subcategory: 'CAFE', weight: 0.72, confidence: 0.7, queryHint: 'LOCATION_QUERY' }),
  E({ keyword: 'office', aliases: ['office', 'workplace', 'headquarters', 'hq'], domain: 'LOCATION', category: 'VENUE', subcategory: 'WORKPLACE', weight: 0.75, confidence: 0.72, queryHint: 'LOCATION_QUERY' }),
  E({ keyword: 'school', aliases: ['school', 'university', 'college', 'campus', 'classroom'], domain: 'LOCATION', category: 'VENUE', subcategory: 'SCHOOL', weight: 0.78, confidence: 0.75, queryHint: 'LOCATION_QUERY' }),
  E({ keyword: 'household', aliases: ['household', 'family home', 'our home', 'where i live'], domain: 'LOCATION', category: 'DWELLING', subcategory: 'HOUSEHOLD', weight: 0.78, confidence: 0.75, queryHint: 'LOCATION_QUERY' }),

  // ── EXTENDED GROUPS (social ontology alignment) ──────────────────────────────
  E({ keyword: 'household_group', aliases: ['my household', 'our household', 'who lives with me'], domain: 'GROUP', category: 'HOUSEHOLD', weight: 0.8, confidence: 0.78, queryHint: 'COMMUNITY_QUERY' }),
  E({ keyword: 'friend_group', aliases: ['friend group', 'my friends', 'close friends', 'inner circle'], domain: 'GROUP', category: 'FRIEND_GROUP', weight: 0.75, confidence: 0.72, queryHint: 'COMMUNITY_QUERY' }),

  // ── LIFE ARC timeframes ────────────────────────────────────────────────────
  E({ keyword: 'last_7_days', aliases: ['last 7 days', 'past week', 'this past week'], domain: 'TIME', category: 'RELATIVE_RANGE', weight: 0.88, confidence: 0.86, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'last_30_days', aliases: ['last 30 days', 'past month', 'this past month'], domain: 'TIME', category: 'RELATIVE_RANGE', weight: 0.88, confidence: 0.86, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'last_90_days', aliases: ['last 90 days', 'past three months', 'last quarter'], domain: 'TIME', category: 'RELATIVE_RANGE', weight: 0.85, confidence: 0.84, queryHint: 'TEMPORAL_QUERY' }),

  // ── TEMPORAL ANCHOR (scan + resolve — hint-only) ───────────────────────────
  E({ keyword: 'tomorrow', aliases: ['tomorrow', 'next week', 'next month', 'next year'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'RELATIVE', weight: 0.88, confidence: 0.88, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'now', aliases: ['now', 'right now', 'just now'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'RELATIVE', weight: 0.9, confidence: 0.9, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'the_other_day', aliases: ['the other day', 'the other night', 'the other evening'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'FUZZY', weight: 0.75, confidence: 0.75, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'recently', aliases: ['recently', 'lately', 'these days', 'not long ago'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'FUZZY', weight: 0.72, confidence: 0.72, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'this_weekend', aliases: ['this weekend', 'last weekend'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'RELATIVE', weight: 0.9, confidence: 0.9, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'this_year', aliases: ['this year', 'last year'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'RELATIVE', weight: 0.9, confidence: 0.9, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'last_summer', aliases: ['last summer', 'this summer', 'last spring', 'this spring', 'last fall', 'last autumn', 'this fall', 'last winter', 'this winter'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'SEASON', weight: 0.88, confidence: 0.88, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'life_stage', aliases: ['when i was a kid', 'when i was younger', 'when i was young', 'in high school', 'in college', 'in university', 'in grad school', 'in middle school', 'in elementary school'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'ERA', weight: 0.65, confidence: 0.65, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'days_ago', aliases: ['days ago', 'weeks ago', 'months ago', 'years ago', 'a couple weeks ago', 'a few weeks ago', 'a couple months ago', 'a few months ago'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'RELATIVE', weight: 0.85, confidence: 0.85, queryHint: 'TEMPORAL_QUERY' }),
  E({ keyword: 'past_range', aliases: ['past 7 days', 'past 30 days', 'past week', 'past month', 'past three months'], domain: 'TIME', category: 'TEMPORAL_ANCHOR', subcategory: 'RELATIVE', weight: 0.88, confidence: 0.86, queryHint: 'TEMPORAL_QUERY' }),

  // ── TEMPORAL SEQUENCE (narrative ordering markers — hint-only) ─────────────
  E({ keyword: 'then', aliases: ['then', 'and then', 'after that', 'before that', 'meanwhile', 'later', 'earlier', 'previously', 'subsequently', 'right before', 'just before', 'right after', 'just after'], domain: 'TIME', category: 'TEMPORAL_SEQUENCE', subcategory: 'NARRATIVE_ORDER', weight: 0.7, confidence: 0.7 }),
  E({ keyword: 'during', aliases: ['during', 'while', 'throughout', 'that same year', 'that year', 'during that time', 'over the summer', 'in the summer', 'that summer'], domain: 'TIME', category: 'TEMPORAL_SEQUENCE', subcategory: 'NARRATIVE_ORDER', weight: 0.68, confidence: 0.68 }),

  // ── SOCIAL ROLE (friend/ally/acquaintance — hint-only) ─────────────────────
  E({ keyword: 'my best friend', aliases: ['bestie', 'bff', 'my bff', 'day ones', 'my person'], domain: 'CONCEPT', category: 'SOCIAL_ROLE', subcategory: 'close_friend', weight: 0.85, confidence: 0.85, relationshipHint: 'SOCIAL_RELATIONSHIP' }),
  E({ keyword: 'ride or die', aliases: ['ride-or-die', 'my ride or die'], domain: 'CONCEPT', category: 'SOCIAL_ROLE', subcategory: 'close_friend', weight: 0.82, confidence: 0.82, relationshipHint: 'SOCIAL_RELATIONSHIP' }),
  E({ keyword: 'close friend', aliases: ['close friends', 'inner circle', 'my inner circle'], domain: 'CONCEPT', category: 'SOCIAL_ROLE', subcategory: 'close_friend', weight: 0.8, confidence: 0.8, relationshipHint: 'SOCIAL_RELATIONSHIP' }),
  E({ keyword: 'my friend', aliases: ['good friend', 'homie', 'my homie', 'my bro', 'my girl', 'my guy'], domain: 'CONCEPT', category: 'SOCIAL_ROLE', subcategory: 'friend', weight: 0.75, confidence: 0.75, relationshipHint: 'SOCIAL_RELATIONSHIP' }),
  E({ keyword: 'my ally', aliases: ['has my back', 'in my corner', 'got my back'], domain: 'CONCEPT', category: 'SOCIAL_ROLE', subcategory: 'ally', weight: 0.78, confidence: 0.78, relationshipHint: 'SOCIAL_RELATIONSHIP' }),
  E({ keyword: 'acquaintance', aliases: ['someone i know', 'person i met', 'someone i met'], domain: 'CONCEPT', category: 'SOCIAL_ROLE', subcategory: 'acquaintance', weight: 0.65, confidence: 0.65, relationshipHint: 'SOCIAL_RELATIONSHIP' }),
  E({ keyword: 'platonic_love', aliases: ['love you platonically', 'like a sister to me', 'like a brother to me', 'platonically', 'platonic soulmate'], domain: 'CONCEPT', category: 'SOCIAL_ROLE', subcategory: 'close_friend', weight: 0.72, confidence: 0.72, relationshipHint: 'SOCIAL_RELATIONSHIP' }),

  // ── Gen Z / modern romantic status (extends RELATIONSHIP_VERB) ─────────────
  E({ keyword: 'soft_launch', aliases: ['soft launch', 'soft launched', 'soft launching'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.7, confidence: 0.68, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'dtr', aliases: ['define the relationship', 'dtr talk', 'had the talk', 'the talk'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.78, confidence: 0.76, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_roster', aliases: ['talking to a few people', 'my roster', 'keeping my options open', 'dating around'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.72, confidence: 0.7, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_ick', aliases: ['got the ick', 'the ick', 'ick factor'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.75, confidence: 0.72, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_fading', aliases: ['situationship energy', 'low effort', 'breadcrumbing', 'breadcrumbed me'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.72, confidence: 0.68, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),
  E({ keyword: 'romantic_rekindled', aliases: ['talking again', 'back together', 'reconnected', 'rekindling'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.78, confidence: 0.76, relationshipHint: 'ROMANTIC_RELATIONSHIP' }),

  // ── NARRATIVE DISCOURSE (tangents / subject changes — hint-only) ───────────
  E({ keyword: 'anyway', aliases: ['anyway', 'anyways', 'random thought', 'totally unrelated', 'sidebar', 'off topic', 'different topic', 'unrelated but'], domain: 'CONCEPT', category: 'NARRATIVE_DISCOURSE', subcategory: 'TANGENT', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'speaking_of', aliases: ['speaking of which', 'that reminds me', 'on another note', 'switching gears', 'changing subject'], domain: 'CONCEPT', category: 'NARRATIVE_DISCOURSE', subcategory: 'SUBJECT_CHANGE', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'back_to', aliases: ['back to what i was saying', 'where was i', 'anyway back to', 'as i was saying'], domain: 'CONCEPT', category: 'NARRATIVE_DISCOURSE', subcategory: 'RETURN', weight: 0.82, confidence: 0.82 }),
  E({ keyword: 'story_open', aliases: ['long story short', 'so basically', 'let me explain', 'here is what happened', "here's what happened", 'so here is the thing', "so here's the thing"], domain: 'CONCEPT', category: 'NARRATIVE_DISCOURSE', subcategory: 'STORY_OPEN', weight: 0.78, confidence: 0.78 }),
  E({ keyword: 'story_close', aliases: ['end of story', "that's the story", 'and thats how', "and that's how", 'the end'], domain: 'CONCEPT', category: 'NARRATIVE_DISCOURSE', subcategory: 'STORY_CLOSE', weight: 0.78, confidence: 0.78 }),
  E({ keyword: 'digression', aliases: ['oh and also', 'by the way', 'btw', 'one more thing'], domain: 'CONCEPT', category: 'NARRATIVE_DISCOURSE', subcategory: 'DIGRESSION', weight: 0.65, confidence: 0.65 }),

  // ── NARRATIVE STAGE (story-telling phases — hint-only) ─────────────────────
  E({ keyword: 'stage_setup', aliases: ['it started when', 'back when', 'it all began', 'at the beginning'], domain: 'CONCEPT', category: 'NARRATIVE_STAGE', subcategory: 'SETUP', weight: 0.78, confidence: 0.78 }),
  E({ keyword: 'stage_inciting', aliases: ['then one day', 'everything changed when', 'the moment when', 'turning point was'], domain: 'CONCEPT', category: 'NARRATIVE_STAGE', subcategory: 'INCITING', weight: 0.82, confidence: 0.82 }),
  E({ keyword: 'stage_escalation', aliases: ['it got worse', 'kept happening', 'over and over', 'spiraled', 'snowballed'], domain: 'CONCEPT', category: 'NARRATIVE_STAGE', subcategory: 'ESCALATION', weight: 0.78, confidence: 0.78 }),
  E({ keyword: 'stage_climax', aliases: ['the worst part', 'breaking point', 'hit rock bottom', 'all came to a head'], domain: 'CONCEPT', category: 'NARRATIVE_STAGE', subcategory: 'CLIMAX', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'stage_falling', aliases: ['once it was over', 'after everything settled', 'when the dust settled'], domain: 'CONCEPT', category: 'NARRATIVE_STAGE', subcategory: 'FALLING', weight: 0.72, confidence: 0.72 }),
  E({ keyword: 'stage_reflection', aliases: ['looking back', 'in hindsight', 'i learned that', 'what i learned', 'lesson learned'], domain: 'CONCEPT', category: 'NARRATIVE_STAGE', subcategory: 'REFLECTION', weight: 0.78, confidence: 0.78 }),
  E({ keyword: 'stage_coda', aliases: ['and now', 'where i am today', 'present day', 'fast forward to now'], domain: 'CONCEPT', category: 'NARRATIVE_STAGE', subcategory: 'CODA', weight: 0.75, confidence: 0.75 }),

  // ── STANCE: PREFERENCE (like/dislike cues — hint-only) ─────────────────────
  E({ keyword: "can't get enough of", aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'PHRASE', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'obsessed with', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'PHRASE', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'crazy about', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'huge fan of', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'big fan of', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'PHRASE', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'a fan of', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'PHRASE', weight: 0.7, confidence: 0.7 }),
  E({ keyword: 'fond of', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'PHRASE', weight: 0.7, confidence: 0.7 }),
  E({ keyword: "can't stand", aliases: ['cannot stand'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'PHRASE', weight: 0.9, confidence: 0.9 }),
  E({ keyword: "can't deal with", aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'PHRASE', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'fed up with', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'PHRASE', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'not a fan of', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'PHRASE', weight: 0.75, confidence: 0.75 }),
  E({ keyword: 'sick of', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'PHRASE', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'tired of', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'PHRASE', weight: 0.65, confidence: 0.65 }),
  E({ keyword: 'love', aliases: ['loves', 'loved'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'VERB', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'adore', aliases: ['adores'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'VERB', weight: 0.95, confidence: 0.95 }),
  E({ keyword: 'enjoy', aliases: ['enjoys', 'enjoyed'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'VERB', weight: 0.7, confidence: 0.7 }),
  E({ keyword: 'like', aliases: ['likes', 'liked'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'VERB', weight: 0.6, confidence: 0.6 }),
  E({ keyword: 'prefer', aliases: ['prefers'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'VERB', weight: 0.6, confidence: 0.6 }),
  E({ keyword: 'dig', aliases: [], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'VERB', weight: 0.6, confidence: 0.6 }),
  E({ keyword: 'appreciate', aliases: ['appreciates'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'LIKE', stanceForm: 'VERB', weight: 0.55, confidence: 0.55 }),
  E({ keyword: 'hate', aliases: ['hates', 'hated'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'VERB', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'despise', aliases: ['despises'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'VERB', weight: 0.95, confidence: 0.95 }),
  E({ keyword: 'loathe', aliases: ['loathes'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'VERB', weight: 0.95, confidence: 0.95 }),
  E({ keyword: 'detest', aliases: ['detests'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'VERB', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'dislike', aliases: ['dislikes'], domain: 'CONCEPT', category: 'STANCE_PREFERENCE', subcategory: 'DISLIKE', stanceForm: 'VERB', weight: 0.7, confidence: 0.7 }),

  // ── STANCE: EPISTEMIC (belief/doubt/question/realization — hint-only) ───────
  E({ keyword: "don't believe that", aliases: ['do not believe that'], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'DISBELIEVE', stanceForm: 'PHRASE', weight: 0.9, confidence: 0.9 }),
  E({ keyword: "don't buy the idea that", aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'DISBELIEVE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: "don't buy that", aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'DISBELIEVE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: "i'm not convinced that", aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'DISBELIEVE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'not convinced that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'DISBELIEVE', stanceForm: 'PHRASE', weight: 0.8, confidence: 0.8 }),
  E({ keyword: "i'm convinced that", aliases: ['i am convinced that'], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'BELIEVE', stanceForm: 'PHRASE', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'i believe that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'BELIEVE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: "i'm certain that", aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'BELIEVE', stanceForm: 'PHRASE', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'i know for a fact that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'BELIEVE', stanceForm: 'PHRASE', weight: 0.95, confidence: 0.95 }),
  E({ keyword: 'i think that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'BELIEVE', stanceForm: 'PHRASE', weight: 0.5, confidence: 0.5 }),
  E({ keyword: 'i doubt that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'DISBELIEVE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'i wonder if', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'QUESTION', stanceForm: 'PHRASE', weight: 0.75, confidence: 0.75 }),
  E({ keyword: 'i wonder whether', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'QUESTION', stanceForm: 'PHRASE', weight: 0.75, confidence: 0.75 }),
  E({ keyword: 'not sure if', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'QUESTION', stanceForm: 'PHRASE', weight: 0.65, confidence: 0.65 }),
  E({ keyword: 'not sure whether', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'QUESTION', stanceForm: 'PHRASE', weight: 0.65, confidence: 0.65 }),
  E({ keyword: 'question whether', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'QUESTION', stanceForm: 'PHRASE', weight: 0.7, confidence: 0.7 }),
  E({ keyword: 'i realized that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'REALIZE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'it hit me that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'REALIZE', stanceForm: 'PHRASE', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'it dawned on me that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'REALIZE', stanceForm: 'PHRASE', weight: 0.9, confidence: 0.9 }),
  E({ keyword: 'finally understood that', aliases: [], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'REALIZE', stanceForm: 'PHRASE', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'believe', aliases: ['believes'], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'BELIEVE', stanceForm: 'VERB', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'doubt', aliases: ['doubts'], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'DISBELIEVE', stanceForm: 'VERB', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'wonder', aliases: ['wonders'], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'QUESTION', stanceForm: 'VERB', weight: 0.7, confidence: 0.7 }),
  E({ keyword: 'realize', aliases: ['realized'], domain: 'CONCEPT', category: 'STANCE_EPISTEMIC', subcategory: 'REALIZE', stanceForm: 'VERB', weight: 0.8, confidence: 0.8 }),

  // ── STANCE: AFFECT (felt-emotion surfaces → canonical label in subcategory) ─
  E({ keyword: 'happy', aliases: ['joyful', 'thrilled', 'excited'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'joy', stanceForm: 'EMOTION', weight: 0.75, confidence: 0.75 }),
  E({ keyword: 'grateful', aliases: ['thankful'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'gratitude', stanceForm: 'EMOTION', weight: 0.75, confidence: 0.75 }),
  E({ keyword: 'relieved', aliases: [], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'relief', stanceForm: 'EMOTION', weight: 0.7, confidence: 0.7 }),
  E({ keyword: 'hopeful', aliases: [], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'hope', stanceForm: 'EMOTION', weight: 0.65, confidence: 0.65 }),
  E({ keyword: 'proud', aliases: [], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'pride', stanceForm: 'EMOTION', weight: 0.7, confidence: 0.7 }),
  E({ keyword: 'sad', aliases: ['depressed', 'down', 'heartbroken'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'sadness', stanceForm: 'EMOTION', weight: 0.75, confidence: 0.75 }),
  E({ keyword: 'angry', aliases: ['furious', 'mad'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'anger', stanceForm: 'EMOTION', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'frustrated', aliases: ['annoyed'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'frustration', stanceForm: 'EMOTION', weight: 0.75, confidence: 0.75 }),
  E({ keyword: 'anxious', aliases: ['nervous', 'worried', 'stressed', 'overwhelmed'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'anxiety', stanceForm: 'EMOTION', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'scared', aliases: ['afraid', 'terrified'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'fear', stanceForm: 'EMOTION', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'exhausted', aliases: ['drained', 'tired'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'exhaustion', stanceForm: 'EMOTION', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'lonely', aliases: [], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'loneliness', stanceForm: 'EMOTION', weight: 0.75, confidence: 0.75 }),
  E({ keyword: 'guilty', aliases: [], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'guilt', stanceForm: 'EMOTION', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'ashamed', aliases: ['embarrassed'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'shame', stanceForm: 'EMOTION', weight: 0.85, confidence: 0.85 }),
  E({ keyword: 'disgusted', aliases: [], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'disgust', stanceForm: 'EMOTION', weight: 0.8, confidence: 0.8 }),
  E({ keyword: 'shocked', aliases: ['surprised'], domain: 'CONCEPT', category: 'STANCE_AFFECT', subcategory: 'surprise', stanceForm: 'EMOTION', weight: 0.75, confidence: 0.75 }),
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

// ── Kinship vocabulary (single source of truth) ──────────────────────────────
// The glossary's FAMILY entries are the canonical kinship vocabulary. The kinship
// extractors (kinshipGlossary, entityResolutionCore, lexicalIntelligence) derive
// their role/alias/generation tables from here instead of redeclaring them.

/** A FAMILY role with every surface term that denotes it (keyword + aliases). */
export interface FamilyRoleSpec {
  /** Stable role label, e.g. GRANDMOTHER, UNCLE (the glossary subcategory). */
  role: string;
  /** keyword + aliases, lowercase, longest-first (multi-word terms win). */
  terms: string[];
  generation?: number;
  confidence: number;
  kinshipForm: 'TITLE_ONLY' | 'TITLED';
}

const FAMILY_ROLE_SPECS: FamilyRoleSpec[] = GLOSSARY
  .filter((e) => e.category === 'FAMILY' && e.subcategory)
  .map((e) => ({
    role: e.subcategory as string,
    terms: [e.keyword, ...e.aliases]
      .map((t) => t.toLowerCase())
      .sort((a, b) => b.length - a.length),
    generation: e.generation,
    confidence: e.confidence,
    kinshipForm: e.kinshipForm ?? 'TITLE_ONLY',
  }));

/** Canonical FAMILY roles + their surface terms, derived from the glossary. */
export function familyRoleSpecs(): FamilyRoleSpec[] {
  return FAMILY_ROLE_SPECS;
}

const FAMILY_CONTEXT_WORDS: string[] = [
  ...new Set(
    GLOSSARY.filter((e) => e.category === 'FAMILY')
      .flatMap((e) => [e.keyword, ...e.aliases])
      .map((t) => t.toLowerCase())
  ),
].sort((a, b) => b.length - a.length);

/** Every FAMILY surface word — for building family-context detectors. */
export function familyContextWords(): string[] {
  return FAMILY_CONTEXT_WORDS;
}

// ── Stance vocabulary (single source of truth) ───────────────────────────────
// STANCE_* glossary entries are hint-only — never discovered as entities.
// preferenceStance, epistemicStance, and affectStance derive cue lexicons from here.

export type StanceLayer = 'STANCE_PREFERENCE' | 'STANCE_EPISTEMIC';

export interface StancePhraseSpec {
  phrase: string;
  /** Subcategory label: LIKE | DISLIKE | BELIEVE | DISBELIEVE | QUESTION | REALIZE */
  kind: string;
  intensity: number;
}

export interface StanceVerbSpec {
  kind: string;
  intensity: number;
}

function buildStancePhraseSpecs(layer: StanceLayer): StancePhraseSpec[] {
  return GLOSSARY
    .filter((e) => e.category === layer && e.stanceForm === 'PHRASE' && e.subcategory)
    .flatMap((e) => {
      const base = { kind: e.subcategory as string, intensity: e.confidence };
      return [
        { phrase: e.keyword, ...base },
        ...e.aliases.map((a) => ({ phrase: a, ...base })),
      ];
    })
    .sort((a, b) => b.phrase.length - a.phrase.length);
}

const STANCE_PHRASE_BY_LAYER: Record<StanceLayer, StancePhraseSpec[]> = {
  STANCE_PREFERENCE: buildStancePhraseSpecs('STANCE_PREFERENCE'),
  STANCE_EPISTEMIC: buildStancePhraseSpecs('STANCE_EPISTEMIC'),
};

/** Multi-word stance cues for a layer, longest-first. */
export function stancePhraseSpecs(layer: StanceLayer): StancePhraseSpec[] {
  return STANCE_PHRASE_BY_LAYER[layer];
}

function buildStanceVerbSpecs(layer: StanceLayer): Record<string, StanceVerbSpec> {
  const out: Record<string, StanceVerbSpec> = {};
  for (const e of GLOSSARY.filter((entry) => entry.category === layer && entry.stanceForm === 'VERB' && entry.subcategory)) {
    const spec: StanceVerbSpec = { kind: e.subcategory as string, intensity: e.confidence };
    out[e.keyword] = spec;
    for (const alias of e.aliases) out[alias] = spec;
  }
  return out;
}

const STANCE_VERB_BY_LAYER: Record<StanceLayer, Record<string, StanceVerbSpec>> = {
  STANCE_PREFERENCE: buildStanceVerbSpecs('STANCE_PREFERENCE'),
  STANCE_EPISTEMIC: buildStanceVerbSpecs('STANCE_EPISTEMIC'),
};

/** Conjugated verb lemmas → stance kind + intensity for a layer. */
export function stanceVerbSpecs(layer: StanceLayer): Record<string, StanceVerbSpec> {
  return STANCE_VERB_BY_LAYER[layer];
}

const AFFECT_EMOTION_LEXICON: Record<string, { canonical: string; intensity: number }> = (() => {
  const out: Record<string, { canonical: string; intensity: number }> = {};
  for (const e of GLOSSARY.filter((entry) => entry.category === 'STANCE_AFFECT' && entry.stanceForm === 'EMOTION' && entry.subcategory)) {
    const spec = { canonical: e.subcategory as string, intensity: e.confidence };
    out[e.keyword] = spec;
    for (const alias of e.aliases) out[alias] = spec;
  }
  return out;
})();

/** Surface emotion word → canonical label + default intensity. */
export function affectEmotionLexicon(): Record<string, { canonical: string; intensity: number }> {
  return AFFECT_EMOTION_LEXICON;
}

// ── Temporal scan vocabulary (single source of truth) ───────────────────────
// TIME-domain TEMPORAL_* entries feed temporalLexicon scanning; resolution math
// stays in temporalAnchorResolver / timeEngine.

export interface TemporalPhraseSpec {
  phrase: string;
  /** RELATIVE | ABSOLUTE | ERA | SEASON | FUZZY | NARRATIVE_ORDER */
  kind: string;
  confidence: number;
}

function buildTemporalScanPhrases(): TemporalPhraseSpec[] {
  const timeCategories = new Set(['TEMPORAL_ANCHOR', 'RELATIVE_DATE', 'RELATIVE_RANGE', 'ERA']);
  return GLOSSARY
    .filter((e) => e.domain === 'TIME' && timeCategories.has(e.category))
    .flatMap((e) => {
      const base = { kind: e.subcategory ?? e.category, confidence: e.confidence };
      return [
        { phrase: e.keyword, ...base },
        ...e.aliases.map((a) => ({ phrase: a, ...base })),
      ];
    })
    .sort((a, b) => b.phrase.length - a.phrase.length);
}

const TEMPORAL_SCAN_PHRASES = buildTemporalScanPhrases();

/** Temporal surface phrases for text scanning, longest-first. */
export function temporalScanPhrases(): TemporalPhraseSpec[] {
  return TEMPORAL_SCAN_PHRASES;
}

const TEMPORAL_SEQUENCE_PHRASES: string[] = [
  ...new Set(
    GLOSSARY.filter((e) => e.category === 'TEMPORAL_SEQUENCE')
      .flatMap((e) => [e.keyword, ...e.aliases])
      .map((t) => t.toLowerCase())
  ),
].sort((a, b) => b.length - a.length);

/** Narrative ordering markers ("then", "before that", …). */
export function temporalSequencePhrases(): string[] {
  return TEMPORAL_SEQUENCE_PHRASES;
}

// ── Social role vocabulary (single source of truth) ─────────────────────────

export interface SocialRoleSpec {
  /** RelationshipRole slug, e.g. close_friend, ally */
  role: string;
  terms: string[];
  relationshipHint?: RelationshipHint;
  confidence: number;
}

const SOCIAL_ROLE_SPECS: SocialRoleSpec[] = GLOSSARY
  .filter((e) => e.category === 'SOCIAL_ROLE' && e.subcategory)
  .map((e) => ({
    role: e.subcategory as string,
    terms: [e.keyword, ...e.aliases]
      .map((t) => t.toLowerCase())
      .sort((a, b) => b.length - a.length),
    relationshipHint: e.relationshipHint,
    confidence: e.confidence,
  }));

/** Social relationship role cues derived from glossary SOCIAL_ROLE entries. */
export function socialRoleSpecs(): SocialRoleSpec[] {
  return SOCIAL_ROLE_SPECS;
}

// ── Narrative discourse / stage vocabulary ────────────────────────────────────

export interface DiscoursePhraseSpec {
  phrase: string;
  /** TANGENT | SUBJECT_CHANGE | RETURN | STORY_OPEN | STORY_CLOSE | DIGRESSION | SETUP | … */
  move: string;
  confidence: number;
}

function buildDiscoursePhraseSpecs(category: 'NARRATIVE_DISCOURSE' | 'NARRATIVE_STAGE'): DiscoursePhraseSpec[] {
  return GLOSSARY
    .filter((e) => e.category === category && e.subcategory)
    .flatMap((e) => {
      const base = { move: e.subcategory as string, confidence: e.confidence };
      return [
        { phrase: e.keyword, ...base },
        ...e.aliases.map((a) => ({ phrase: a, ...base })),
      ];
    })
    .sort((a, b) => b.phrase.length - a.phrase.length);
}

const DISCOURSE_PHRASE_SPECS = buildDiscoursePhraseSpecs('NARRATIVE_DISCOURSE');
const NARRATIVE_STAGE_PHRASE_SPECS = buildDiscoursePhraseSpecs('NARRATIVE_STAGE');

/** Conversation-move cues (tangents, subject changes, …). */
export function discoursePhraseSpecs(): DiscoursePhraseSpec[] {
  return DISCOURSE_PHRASE_SPECS;
}

/** Story-telling phase cues (setup, climax, reflection, …). */
export function narrativeStagePhraseSpecs(): DiscoursePhraseSpec[] {
  return NARRATIVE_STAGE_PHRASE_SPECS;
}
