import type { LivingBiographyPerson } from '../livingBiographyService';

export type IdentityDomain =
  | 'career'
  | 'projects'
  | 'creativity'
  | 'learning'
  | 'relationships'
  | 'family'
  | 'health'
  | 'community';

export type IdentityCoverageBand = 'strong' | 'developing' | 'sparse' | 'unknown';
export type IdentitySalience = 'dominant' | 'significant' | 'supporting';
export type IdentityStability = 'stable' | 'evolving' | 'volatile';
export type IdentityMomentum = 'growing' | 'steady' | 'declining' | 'dormant';
export type IdentityTrajectory = 'emerging' | 'continuing' | 'transforming' | 'fading';

export type IdentityEvidenceRef = {
  id: string;
  label: string;
  source: 'narrative_arc' | 'project' | 'skill' | 'goal' | 'turning_point' | 'relationship';
  date?: string | null;
  confidence: number;
};

export type IdentityThread = {
  id: string;
  domain: IdentityDomain;
  name: string;
  summary: string;
  salience: IdentitySalience;
  stability: IdentityStability;
  momentum: IdentityMomentum;
  trajectory: IdentityTrajectory;
  strength: number;
  confidence: number;
  supportingEvidence: IdentityEvidenceRef[];
  contradictions: string[];
  lastReinforced: string | null;
};

export type IdentityCoverage = {
  domain: IdentityDomain;
  score: number;
  band: IdentityCoverageBand;
  evidenceCount: number;
  sourceDiversity: number;
  lastReinforced: string | null;
};

export type IdentityTension = {
  label: string;
  evidence: string[];
  confidence: number;
};

export type IdentitySnapshot = {
  id: string;
  generatedAt: string;
  algorithmVersion: string;
  narrativeVersion: string;
  graphRevision: string;
  stale: boolean;
  confidence: number;
  coverage: IdentityCoverage[];
  coreIdentity: {
    name: string | null;
    education: string | null;
    employment: string | null;
    location: string | null;
  };
  currentChapter: {
    title: string;
    summary: string;
    confidence: number;
  } | null;
  threads: IdentityThread[];
  goals: Array<{ id: string; title: string; status: string }>;
  recentChanges: Array<{ id: string; label: string; confidence: number; date: string | null }>;
  importantPeople: LivingBiographyPerson[];
  tensions: IdentityTension[];
  provenance: {
    evidenceCount: number;
    sourceCounts: Record<string, number>;
    rejectedCounts: Record<string, number>;
    why: string;
  };
};
