/**
 * Canonical ontology — the structured understanding layer.
 *
 *   ROOT TYPE → CATEGORY → SUBCATEGORY → KEYWORDS → ALIASES
 *
 * The hierarchy is derived from the glossary (single source of truth) so adding a
 * keyword automatically extends the tree. Root metadata (e.g. character-eligible)
 * lives here. Consumed by extraction, classification, search, retrieval,
 * relationships, temporal reasoning, and story synthesis.
 */
import { GLOSSARY, type GlossaryEntry, type RootType } from './glossary';

export type { RootType } from './glossary';

/** Stable root types — the governed top of the ontology (mirrors the classification sprint). */
export const ROOT_TYPES: RootType[] = [
  'PERSON', 'FAMILY', 'GROUP', 'ORGANIZATION', 'LOCATION', 'EVENT', 'PROJECT',
  'PRODUCT', 'APP', 'BRAND', 'MEDIA', 'SKILL', 'GOAL', 'PET', 'VEHICLE',
  'FOODDRINK', 'CONCEPT', 'TIME', 'UNKNOWN',
];

/** Which roots may be promoted to a Character card. */
export const CHARACTER_ELIGIBLE: ReadonlySet<RootType> = new Set<RootType>(['PERSON']);

/**
 * Discovery Hub panels — mirrors apps/web/src/components/discovery/DiscoveryHub.tsx routes.
 * Used by lexical navigation chips and ontology explorer diagnostics.
 */
export const DISCOVERY_SURFACES = {
  overview: 'discovery',
  soulProfile: 'discovery/soul-profile',
  revealedSelf: 'discovery/revealed-self',
  contradictions: 'discovery/contradictions',
  identity: 'discovery/identity',
  relationships: 'discovery/relationships',
  insightsPredictions: 'discovery/insights-predictions',
  valuesHabits: 'discovery/values-habits',
  decisions: 'discovery/decisions',
  lifeArc: 'discovery/life-arc',
  shadow: 'discovery/shadow',
  xp: 'discovery/xp',
  reactionsResilience: 'discovery/reactions-resilience',
  activity: 'discovery/activity',
  lifeStats: 'discovery/life-stats',
  achievements: 'discovery/achievements',
  memoryManagement: 'discovery/memory-management',
  memoryReview: 'discovery/memory-review',
  continuity: 'discovery/continuity',
  correctionDashboard: 'discovery/correction-dashboard',
  memoryFade: 'discovery/memory-fade',
  knowledgeRecords: 'discovery/knowledge-records',
} as const;

/** Main LoreBook surfaces — Books + primary navigation targets. */
export const BOOK_SURFACES = {
  characters: 'characters',
  locations: 'locations',
  organizations: 'organizations',
  family: 'family',
  love: 'love',
  timeline: 'timeline',
  lorebook: 'lorebook',
  quests: 'quests',
  chat: 'chat',
  entityAuthority: 'entity-authority',
} as const;

/** Glossary category layers for explorer / analytics grouping. */
export const ONTOLOGY_LAYER_LABELS: Record<string, string> = {
  FAMILY: 'Kinship & Family',
  VENUE: 'Places & Venues',
  DWELLING: 'Homes & Households',
  SHOW: 'Events & Shows',
  MUSIC_GROUP: 'Bands & Crews',
  COMMUNITY: 'Communities & Scenes',
  COMPANY: 'Organizations',
  INITIATIVE: 'Projects & Initiatives',
  CAPABILITY: 'Skills & Capabilities',
  OBJECTIVE: 'Goals & Aspirations',
  RELATIONSHIP_VERB: 'Relationship Language',
  NAV_VERB: 'Navigation & Surfaces',
  ESSENCE_SIGNAL: 'Soul Profile Signals',
  SHADOW_SIGNAL: 'Shadow & Inner Patterns',
  IDENTITY_SIGNAL: 'Identity Shifts',
  CONTRADICTION_SIGNAL: 'Stated vs Revealed',
  DECISION_SIGNAL: 'Decision Memory',
  MEMORY_SIGNAL: 'Memory & Recall',
  CORRECTION_VERB: 'Corrections',
  RECALL_VERB: 'Recall Queries',
  ENTITY_AUTHORITY: 'Entity Authority',
  ANALYTICS_SIGNAL: 'Analytics & Achievements',
  INSIGHT_SIGNAL: 'Patterns & Insights',
  HABIT: 'Habits & Routines',
  VALUE: 'Values & Priorities',
};

export interface OntologySubcategory {
  subcategory: string;
  keywords: string[];
  aliases: string[];
  entries: GlossaryEntry[];
}
export interface OntologyCategory {
  category: string;
  subcategories: OntologySubcategory[];
}
export interface OntologyDomain {
  root: RootType;
  characterEligible: boolean;
  categories: OntologyCategory[];
}

/** Build the ROOT→CATEGORY→SUBCATEGORY→KEYWORDS→ALIASES tree from the glossary. */
export function buildOntology(): OntologyDomain[] {
  const byRoot = new Map<RootType, Map<string, Map<string, GlossaryEntry[]>>>();
  for (const entry of GLOSSARY) {
    const cat = entry.category || 'GENERAL';
    const sub = entry.subcategory || cat;
    if (!byRoot.has(entry.domain)) byRoot.set(entry.domain, new Map());
    const cats = byRoot.get(entry.domain)!;
    if (!cats.has(cat)) cats.set(cat, new Map());
    const subs = cats.get(cat)!;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub)!.push(entry);
  }

  const out: OntologyDomain[] = [];
  for (const root of ROOT_TYPES) {
    const cats = byRoot.get(root);
    if (!cats) continue;
    out.push({
      root,
      characterEligible: CHARACTER_ELIGIBLE.has(root),
      categories: [...cats.entries()].map(([category, subs]) => ({
        category,
        subcategories: [...subs.entries()].map(([subcategory, entries]) => ({
          subcategory,
          keywords: entries.map((e) => e.keyword),
          aliases: [...new Set(entries.flatMap((e) => e.aliases))],
          entries,
        })),
      })),
    });
  }
  return out;
}

/** Flattened view for an Ontology Explorer UI (Phase 10) / diagnostics. */
export function ontologyRows(): Array<{
  root: RootType; category: string; subcategory: string;
  keyword: string; aliases: string[]; confidence: number; weight: number;
  relationshipHint?: string; queryHint?: string; actionHint?: string;
  surfaceTarget?: string; aliasCount: number; layerLabel?: string;
}> {
  return GLOSSARY.map((e) => ({
    root: e.domain,
    category: e.category,
    subcategory: e.subcategory ?? e.category,
    keyword: e.keyword,
    aliases: e.aliases,
    confidence: e.confidence,
    weight: e.weight,
    relationshipHint: e.relationshipHint,
    queryHint: e.queryHint,
    actionHint: e.actionHint,
    surfaceTarget: e.surfaceTarget,
    aliasCount: e.aliases.length,
    layerLabel: ONTOLOGY_LAYER_LABELS[e.category],
  }));
}

export const ontology = {
  build: buildOntology,
  rows: ontologyRows,
  ROOT_TYPES,
  CHARACTER_ELIGIBLE,
  DISCOVERY_SURFACES,
  BOOK_SURFACES,
  ONTOLOGY_LAYER_LABELS,
};
