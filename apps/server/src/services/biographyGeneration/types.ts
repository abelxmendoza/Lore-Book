/**
 * Biography Generation Engine Types
 * 
 * Core principle: "Structure first. Narrative second. Prose last."
 */

export type NarrativeAtomType = 
  | 'event' 
  | 'reflection' 
  | 'conflict' 
  | 'achievement' 
  | 'turning_point'
  | 'relationship_moment'
  | 'creative_output'
  | 'skill_milestone';

export type Domain = 
  | 'fighting'
  | 'robotics'
  | 'relationships'
  | 'creative'
  | 'professional'
  | 'personal'
  | 'health'
  | 'education'
  | 'family'
  | 'friendship'
  | 'romance';

export type BiographyTone = 'neutral' | 'dramatic' | 'reflective' | 'mythic' | 'professional';
export type BiographyDepth = 'summary' | 'detailed' | 'epic';
export type BiographyAudience = 'self' | 'public' | 'professional';

/**
 * NarrativeAtom - Lowest-level narrative unit (AST node)
 * Precomputed from engines, cached and reused
 * Think: AST nodes in a compiler
 */
export interface NarrativeAtom {
  id: string;
  type: NarrativeAtomType;
  timestamp: string; // ISO date string
  domains: Domain[]; // Which domains this belongs to
  emotionalWeight: number; // 0-1
  sensitivity: number; // 0-1 (NEW: for content filtering)
  significance: number; // 0-1
  peopleIds?: string[]; // Character IDs involved
  tags?: string[]; // Additional tags
  content: string; // Pre-summarized text (from engines)
  timelineIds: string[]; // References to timeline entries
  sourceRefs: string[]; // Journal entry IDs, perception IDs, etc.
  metadata?: Record<string, any>; // Additional context
}

/**
 * NarrativeGraph - Precomputed graph of atoms (DAG)
 * Updated incrementally, not rebuilt per biography
 * Think: Abstract Syntax Tree with indexes
 */
export interface NarrativeGraph {
  atoms: NarrativeAtom[];
  edges: NarrativeEdge[];
  index: {
    byDomain: Map<Domain, string[]>; // Atom IDs by domain
    byTime: Array<{ atomId: string; timestamp: string }>; // Sorted by time
    byPerson: Map<string, string[]>; // Atom IDs by person
  };
  lastUpdated: string;
}

export interface NarrativeEdge {
  fromAtomId: string;
  toAtomId: string;
  relation: 'causal' | 'temporal' | 'thematic' | 'emotional';
  weight: number; // 0-1
}

/**
 * BiographySpec - Generation request
 */
export interface BiographySpec {
  scope: 'full_life' | 'domain' | 'time_range' | 'thematic';
  domain?: Domain;
  timeRange?: {
    start: string; // ISO date
    end: string; // ISO date
  };
  tone: BiographyTone;
  depth: BiographyDepth;
  audience: BiographyAudience;
  includeIntrospection: boolean;
  version?: 'main' | 'safe' | 'explicit' | 'private'; // Build flag for content filtering
  themes?: string[]; // Optional theme filters
  peopleIds?: string[]; // Optional people filters
  characterIds?: string[]; // Character-based lorebooks
  locationIds?: string[]; // Location-based lorebooks
  eventIds?: string[]; // Event-based lorebooks
  skillIds?: string[]; // Skill-based lorebooks
}

/**
 * ChapterCluster - Grouped atoms that form a chapter
 */
export interface ChapterCluster {
  id: string;
  atoms: NarrativeAtom[];
  dominantThemes: string[];
  timeSpan: {
    start: string;
    end: string;
  };
  emotionalArc?: {
    start: number;
    end: number;
    peak: number;
  };
  significance: number; // Average significance of atoms
  timelineChapterId?: string; // Optional reference to source timeline chapter
  timelineChapter?: TimelineChapter; // Optional full timeline chapter data
}

/**
 * Timeline Chapter - Source structure from timeline hierarchy
 */
export interface TimelineChapter {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  description: string | null;
  summary: string | null;
  parent_id: string | null; // References timeline_arcs
  user_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Timeline Hierarchy - Full hierarchy structure
 */
export interface TimelineHierarchy {
  sagas: Array<{
    id: string;
    title: string;
    description?: string;
    start_date: string;
    end_date?: string | null;
    arcs: Array<{
      id: string;
      title: string;
      description?: string;
      start_date: string;
      end_date?: string | null;
      chapters: TimelineChapter[];
    }>;
  }>;
}

/**
 * Preserved Content Placement
 */
export interface PreservedContentPlacement {
  atomId: string;
  chapterId: string;
  position: 'opening' | 'middle' | 'closing' | 'standalone';
  contentType: string;
  reasoning?: string; // Why it was placed here
}

/**
 * Time Period
 */
export interface TimePeriod {
  id: string;
  title: string;
  start: string;
  end: string;
  chapters: string[]; // Chapter IDs
  themes: string[];
  summary?: string;
}

/**
 * Void Period - A period with no known content
 */
export interface VoidPeriod {
  id: string;
  start: string;
  end: string;
  durationDays: number;
  type: 'short_gap' | 'medium_gap' | 'long_silence' | 'void';
  significance: 'low' | 'medium' | 'high';
  context?: {
    beforePeriod?: string; // What happened before
    afterPeriod?: string; // What happened after
    estimatedActivity?: string; // What might have happened
    surroundingThemes?: string[]; // Themes from surrounding periods
  };
  fillStrategy?: 'prompt_user' | 'infer_context' | 'acknowledge_void';
}

/**
 * Void Context - Contextual information about a void period
 */
export interface VoidContext {
  beforeAtoms: NarrativeAtom[];
  afterAtoms: NarrativeAtom[];
  inferredThemes: string[];
  estimatedActivity: string;
}

/**
 * BiographyChapter - Final chapter structure
 * Generated from timeline chapters - links source structure to narrative output
 */
export interface BiographyChapter {
  id: string;
  title: string; // Auto-generated from timeline chapter content
  text: string; // Generated narrative prose
  timeSpan: {
    start: string;
    end: string;
  };
  timelineChapterIds: string[]; // References to source timeline chapters
  timelineChapters?: TimelineChapter[]; // Full timeline chapter data (optional)
  atoms: NarrativeAtom[]; // Source atoms from timeline chapters
  themes: string[];
  preservedContent?: PreservedContentPlacement[];
  timePeriodId?: string;
  timelineHierarchy?: {
    sagaId?: string;
    arcId?: string;
    eraId?: string;
  };
  isVoidChapter?: boolean;
  voidPeriodId?: string;
  voidMetadata?: {
    durationDays: number;
    type: string;
    prompts?: string[];
  };
}

/**
 * Prioritized Atom - Atom with priority scoring
 */
export interface PrioritizedAtom extends NarrativeAtom {
  priorityScore: number;
  recencyScore: number;
  uniquenessScore: number;
}

/**
 * Prioritization Options
 */
export interface PrioritizationOptions {
  depth: BiographyDepth;
  preserveAll?: boolean; // If true, include all atoms regardless of score
  maxAtomsPerChapter?: number;
}

/**
 * Fallback Options
 */
export interface FallbackOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  useCache?: boolean;
  useTemplates?: boolean;
}

/**
 * Quality Report
 */
export interface QualityReport {
  overallScore: number; // 0-1
  temporalAccuracy: number;
  sourceFidelity: number;
  completeness: number;
  conflictAwareness: number;
  warnings: string[];
  checks: {
    temporal: TemporalCheck;
    fidelity: FidelityCheck;
    conflicts: ConflictReport;
    completeness: CompletenessCheck;
  };
}

/**
 * Temporal Check
 */
export interface TemporalCheck {
  isValid: boolean;
  outOfOrderChapters: string[];
  score: number;
}

/**
 * Fidelity Check
 */
export interface FidelityCheck {
  score: number;
  mismatches: Array<{
    chapterId: string;
    generatedText: string;
    sourceAtom: string;
    issue: string;
  }>;
}

/**
 * Conflict Report
 */
export interface ConflictReport {
  conflictsFound: number;
  conflicts: Array<{
    chapterId: string;
    conflictingAtoms: string[];
    description: string;
  }>;
  score: number;
}

/**
 * Completeness Check
 */
export interface CompletenessCheck {
  score: number;
  missingImportantAtoms: string[];
  coverage: number; // Percentage of important atoms included
}

/**
 * Biography - Compiled binary (final output)
 * Think: Compiled program from AST
 * 
 * IMPORTANT: Lorebooks are compiled artifacts, not sources of truth.
 * Chat + Memory Graph = source of truth
 * Lorebooks = compiled views at moments in time
 */
export interface Biography {
  id: string;
  title: string;
  subtitle?: string;
  version: BiographySpec['version']; // Build flag used
  chapters: BiographyChapter[];
  metadata: {
    domain?: Domain;
    generatedAt: string;
    spec: BiographySpec;
    atomCount: number;
    filtersApplied: string[]; // Which filters were applied
    // Lorebook metadata
    isCoreLorebook?: boolean; // Saved canonical edition vs ephemeral query
    lorebookName?: string; // User-given name for Core Lorebooks
    lorebookVersion?: number; // Version number for Core Lorebooks
    atomHashes?: string[]; // Reference hashes to NarrativeAtoms used
    memorySnapshotAt?: string; // When memory was queried (ISO date)
    // Enhanced metadata
    timePeriods?: TimePeriod[]; // Time periods detected
    timelineHierarchy?: TimelineHierarchy; // Full timeline hierarchy
    voidPeriods?: VoidPeriod[]; // Void periods detected
    voidCount?: number; // Number of void chapters
    quality?: {
      overallScore: number;
      temporalAccuracy: number;
      sourceFidelity: number;
      completeness: number;
      conflictAwareness: number;
      warnings: string[];
    };
  };
}
