import type { ProjectCardData } from './ProjectProfileCard';

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export type ProjectMilestoneKind = 'milestone' | 'pivot' | 'pause' | 'breakthrough' | 'start' | 'end';

export type ProjectMilestone = {
  id: string;
  title: string;
  date: string;
  kind: ProjectMilestoneKind;
  summary?: string;
};

export type ProjectContributor = {
  id: string;
  name: string;
  role: string;
  momentCount: number;
  lastActive?: string;
};

export type ProjectSkillLink = {
  id: string;
  name: string;
  level?: string;
};

export type ProjectResourceLink = {
  id: string;
  title: string;
  url?: string;
  kind: 'file' | 'link' | 'thread' | 'doc';
};

export type ProjectDecision = {
  id: string;
  decision: string;
  date: string;
  options?: string;
  chosen: string;
  reason?: string;
};

export type ProjectStoryBeat = {
  id: string;
  title: string;
  body: string;
  date?: string;
};

export type ProjectBrief = {
  what: string;
  why: string;
  currentState: string;
  lastActivity: string;
  nextStep: string;
  openQuestion?: string;
};

export type ProjectDetailProfile = {
  purpose: string;
  tagline: string;
  currentPhase: string;
  brief: ProjectBrief;
  stats: {
    momentCount: number;
    threadCount: number;
    dayCount: number;
    lastActiveLabel: string;
  };
  milestones: ProjectMilestone[];
  contributors: ProjectContributor[];
  skills: ProjectSkillLink[];
  resources: ProjectResourceLink[];
  decisions: ProjectDecision[];
  storyBeats: ProjectStoryBeat[];
  locations: Array<{ id: string; name: string }>;
  openLoops: string[];
};

export type EnrichedProject = ProjectCardData & {
  summary?: string | null;
  ended_at?: string | null;
  importance_score?: number | null;
};
