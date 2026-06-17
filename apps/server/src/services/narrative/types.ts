/**
 * Narrative IR — canonical intermediate representation for story compilation.
 * All story surfaces (timeline, memoir, biography, family, project histories) consume this.
 */
import type { LifeArcConflict } from '../continuityRuntime/arcs/lifeArcSynthesisService';

export type StoryState = 'draft' | 'confirmed' | 'compiled' | 'archived';

export type ArcStatus =
  | 'emerging'
  | 'active'
  | 'growing'
  | 'plateaued'
  | 'declining'
  | 'completed';

export type ArcMomentum = 'positive' | 'neutral' | 'negative';

export type NarrativeEvidence = {
  id: string;
  label: string;
  source: string;
  date?: string | null;
  confidence: number;
  storyState?: StoryState;
};

export type CompiledChapter = {
  title: string;
  summary: string;
  startDate: string | null;
  endDate: string | null;
  dominantTheme: string;
  confidence: number;
  evidenceCount: number;
  evidence: NarrativeEvidence[];
  storyState: StoryState;
};

export type NarrativeArc = {
  id: string;
  title: string;
  category: string;
  status: ArcStatus;
  momentum: ArcMomentum;
  confidence: number;
  score: number;
  evidence: NarrativeEvidence[];
  storyState: StoryState;
  startDate: string | null;
  latestActivity: string | null;
};

export type TurningPointKind =
  | 'breakup'
  | 'new_relationship'
  | 'job_offer'
  | 'career_change'
  | 'move'
  | 'graduation'
  | 'launch'
  | 'death'
  | 'achievement'
  | 'major_failure'
  | 'awakening'
  | 'other';

export type NarrativeTurningPoint = {
  id: string;
  title: string;
  date: string | null;
  kind: TurningPointKind;
  importance: number;
  affectedArcIds: string[];
  evidence: NarrativeEvidence[];
  confidence: number;
  storyState: StoryState;
};

export type NarrativeScene = {
  id: string;
  title: string;
  arcCategory: string;
  cues: string[];
  confidence: number;
  evidence: string[];
};

export type NarrativeRelationship = {
  id: string;
  name: string;
  role: string;
  confidence: number;
};

export type NarrativeGoal = {
  id: string;
  title: string;
  status: string;
};

export type NarrativeProject = {
  id: string;
  name: string;
  type: string;
};

export type NarrativeCommunity = {
  id: string;
  name: string;
};

export type TimelineEntry = {
  date: string;
  label: string;
  source: string;
  confidence: number;
};

export type NarrativeFamilySummary = {
  householdCount: number;
  memberCount: number;
  groupCount: number;
  headOfHousehold?: string | null;
};

export type BookOutlineChapter = {
  title: string;
  summary: string;
  startDate: string | null;
  endDate: string | null;
  themes: string[];
};

export type BookOutline = {
  title: string;
  kind: 'autobiography' | 'family_chronicle' | 'relationship_story' | 'career_story' | 'year_in_review';
  chapters: BookOutlineChapter[];
  timeline: TimelineEntry[];
  characters: string[];
  locations: string[];
  themes: string[];
  generatedAt: string;
};

export type StoryHealthMetrics = {
  coverage: number;
  missingPeriods: Array<{ start: string; end: string; label: string }>;
  orphanEventCount: number;
  unresolvedEntityCount: number;
  unsupportedConclusionCount: number;
  confidenceDistribution: { low: number; medium: number; high: number };
  storyStateCounts: Record<StoryState, number>;
};

export type NarrativeIR = {
  generatedAt: string;
  currentChapter: CompiledChapter;
  activeArcs: NarrativeArc[];
  dormantArcs: NarrativeArc[];
  conflicts: LifeArcConflict[];
  goals: NarrativeGoal[];
  projects: NarrativeProject[];
  relationships: NarrativeRelationship[];
  communities: NarrativeCommunity[];
  turningPoints: NarrativeTurningPoint[];
  scenes: NarrativeScene[];
  timeline: TimelineEntry[];
  family: NarrativeFamilySummary;
  evidence: NarrativeEvidence[];
  provenance: {
    confidence: number;
    signalInventory: Record<string, number>;
    why: string;
  };
};

export type GoldenStoryAnswer = {
  question: string;
  answer: string;
  confidence: number;
  evidence: NarrativeEvidence[];
};
