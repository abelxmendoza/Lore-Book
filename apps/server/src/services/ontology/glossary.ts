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
