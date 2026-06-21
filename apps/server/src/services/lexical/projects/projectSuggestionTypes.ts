/** Project suggestion pipeline — types and shared constants. */

export type CrossBookIndex = {
  characters: Set<string>;
  places: Set<string>;
  organizations: Set<string>;
  groups: Set<string>;
  skills: Set<string>;
  events: Set<string>;
  glossaryAliases: Set<string>;
};

export type ProjectSuggestionStatus =
  | 'known'
  | 'new'
  | 'reference'
  | 'possible_duplicate'
  | 'rejected'
  | 'needs_review';

export type ProjectTaxonomyType =
  | 'software_app'
  | 'robot_build'
  | 'hardware_project'
  | 'website'
  | 'creative_project'
  | 'fitness_project'
  | 'content_series'
  | 'research_project'
  | 'school_project'
  | 'work_project'
  | 'startup'
  | 'product'
  | 'repo'
  | 'feature'
  | 'experiment'
  | 'initiative'
  | 'unknown_project';

export type ProjectMergeCandidate = {
  projectId: string;
  displayName: string;
  similarity: number;
  reason: string;
};

export type ProjectSuggestion = {
  text: string;
  normalizedText: string;
  canonicalKey: string;
  start: number;
  end: number;
  projectType: ProjectTaxonomyType | string;
  confidence: number;
  status: ProjectSuggestionStatus;
  matchedProjectId?: string;
  duplicateOfProjectId?: string;
  mergeCandidates?: ProjectMergeCandidate[];
  rejectionReason?: string;
  splitFrom?: string;
  boundaryFixes: string[];
  evidencePhrases: string[];
  rulesFired: string[];
  originalCandidate?: string;
  finalSpan?: string;
  rejectedAs?: string;
  splitChildren?: string[];
};

export type RawProjectCandidate = {
  text: string;
  start: number;
  end: number;
  evidenceLine: string;
  source: 'cue' | 'glossary' | 'quoted' | 'known_alias';
  confidence: number;
};

export type ProjectSuggestionOptions = {
  knownProjects?: Set<string>;
  knownProjectIds?: Map<string, string>;
  activeThreadProject?: string;
  crossBook?: CrossBookIndex;
};

export const STOPWORD_SPANS = new Set([
  'and',
  'or',
  'but',
  'the',
  'a',
  'an',
  'it',
  'this',
  'that',
  'my',
  'your',
  'our',
  'we',
  'i',
  'me',
]);

export const GENERIC_PROJECT_WORDS = new Set([
  'project',
  'app',
  'website',
  'build',
  'system',
  'feature',
  'idea',
  'thing',
  'stuff',
  'code',
  'repo',
  'program',
  'robot',
  'startup',
  'business',
  'initiative',
  'product',
]);

export const REFERENCE_PHRASES =
  /^(?:this|that|the|my|our|your)\s+(?:project|app|build|system|feature|idea|thing|stuff|code|repo|program)$/i;

export const KNOWN_PROJECT_ALIASES = new Map<string, string>([
  ['lorebook', 'LoreBook'],
  ['lore book', 'LoreBook'],
  ['omega-1', 'Omega-1'],
  ['omega 1', 'Omega-1'],
  ['omega-2', 'Omega-2'],
  ['omega 2', 'Omega-2'],
  ['abeliciousness', 'Abeliciousness'],
]);

export const TRAILING_CONJUNCTION = /\s{1,40}(?:and|or|but)\s{0,40}$/i;
