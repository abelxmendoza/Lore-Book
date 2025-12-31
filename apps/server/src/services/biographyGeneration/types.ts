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
  themes?: string[]; // Optional theme filters
  peopleIds?: string[]; // Optional people filters
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
}

/**
 * BiographyChapter - Final chapter structure
 */
export interface BiographyChapter {
  id: string;
  title: string;
  text: string;
  timeSpan: {
    start: string;
    end: string;
  };
  atoms: NarrativeAtom[]; // Source atoms
  themes: string[];
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
  };
}
