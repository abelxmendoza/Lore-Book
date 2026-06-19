import type { CertifiedEntityType, CharacterVariant } from '../../types/certifiedEntity';
import type { ChatLoreIntent } from '../chatLoreContext';

export type StoryDomain =
  | 'relationships'
  | 'romance'
  | 'family'
  | 'career'
  | 'health'
  | 'creative'
  | 'social'
  | 'place'
  | 'identity';

export type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type ConversationScenario = {
  id: string;
  title: string;
  subtitle: string;
  domains: StoryDomain[];
  description: string;
  /** Situation tags the engine should watch for (family dinner, job interview, etc.) */
  situationTags: string[];
  turns: ConversationTurn[];
};

export type MemoryEntity = {
  id: string;
  name: string;
  type: CertifiedEntityType;
  characterVariant?: CharacterVariant;
  mentionCount: number;
  firstSeenTurn: number;
  lastSeenTurn: number;
  sources: Array<'certified' | 'draft' | 'lexical' | 'fallback'>;
};

export type MemoryConnection = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  fromName: string;
  toName: string;
  relation: 'co_mention' | 'relationship_hint' | 'situation';
  label: string;
  weight: number;
  turnIndex: number;
};

export type DetectedSituation = {
  id: string;
  tag: string;
  title: string;
  summary: string;
  domain: StoryDomain;
  entityIds: string[];
  turnIndex: number;
  confidence: number;
};

export type NarrativeAtomDraft = {
  id: string;
  type: 'event' | 'reflection' | 'relationship_moment' | 'skill_milestone' | 'turning_point';
  timestamp: string;
  content: string;
  domains: StoryDomain[];
  entityIds: string[];
  turnIndex: number;
  significance: number;
};

export type TurnAnalysis = {
  turnIndex: number;
  role: 'user' | 'assistant';
  content: string;
  intent: ChatLoreIntent;
  entities: MemoryEntity[];
  relationshipHints: string[];
  ontologyHits: string[];
  subtitle: string;
};

export type StoryMemoryState = {
  scenarioId: string | null;
  turnsProcessed: number;
  entities: Record<string, MemoryEntity>;
  connections: MemoryConnection[];
  situations: DetectedSituation[];
  atoms: NarrativeAtomDraft[];
  domains: Record<StoryDomain, number>;
  startedAt: string;
  updatedAt: string;
};

export type CompiledBookChapter = {
  id: string;
  title: string;
  summary: string;
  atomIds: string[];
  domain: StoryDomain;
};

export type CompiledBookVersion = {
  version: number;
  compiledAt: string;
  atomCount: number;
  entityCount: number;
  connectionCount: number;
  situationCount: number;
  sourceTurns: number;
  snapshotHash: string;
};

export type CompiledBookDraft = {
  id: string;
  title: string;
  subtitle: string;
  chapters: CompiledBookChapter[];
  versions: CompiledBookVersion[];
  latestVersion: CompiledBookVersion;
};
