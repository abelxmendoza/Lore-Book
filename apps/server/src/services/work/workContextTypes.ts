/**
 * Work Context — one focused object answering "what is the user's work life
 * right now", built only from explicit work evidence. Work people never
 * default to romantic/family/friend.
 */

export type WorkRelationship =
  | 'manager'
  | 'team_lead'
  | 'lead_engineer'
  | 'lead_developer'
  | 'coworker'
  | 'veteran_team_member'
  | 'unknown_work_relation';

export type WorkPerson = {
  personId?: string;
  displayName: string;
  relationship: WorkRelationship;
  /** e.g. "not on-site often", "main on-site lead when X is absent". */
  attendancePattern?: string;
  confidence: number;
  evidenceIds: string[];
};

export type WorkTool = { name: string; purpose?: string; evidenceIds: string[] };
export type WorkTask = { description: string; status?: string; evidenceIds: string[] };
export type WorkBlocker = { description: string; evidenceIds: string[] };

export type WorkTenure = {
  phrase?: string;
  /** Inclusive ISO date window for the estimated start — never a fake exact date. */
  inferredStartDateRange?: { earliest: string; latest: string };
  precision: 'exact' | 'week' | 'month' | 'fuzzy';
  confidence: number;
};

export type WorkContext = {
  currentRole?: {
    title: string;
    status: 'current' | 'former' | 'planned' | 'uncertain';
    confidence: number;
    evidenceIds: string[];
  };
  organization?: { id?: string; name: string };
  parentOrganization?: { id?: string; name: string };
  team?: { id?: string; name: string };

  managers: WorkPerson[];
  leads: WorkPerson[];
  coworkers: WorkPerson[];

  tools: WorkTool[];
  currentTasks: WorkTask[];
  blockers: WorkBlocker[];

  tenure?: WorkTenure;

  correctionsApplied: string[];
  warnings: string[];
};

/** Raw inputs the pure resolver builds from — loaded from DB or supplied in tests. */
export type WorkContextInputs = {
  /** e.g. biography facts identity.employment phrase. */
  employmentPhrase?: string | null;
  organizations: Array<{
    id?: string;
    name: string;
    parentName?: string | null;
    orgType?: string | null;
    isTeam?: boolean;
    userRole?: string | null;
  }>;
  workPeople: Array<{
    personId?: string;
    name: string;
    /** Free-text role/relationship evidence: "lead engineer", "on-site lead when X is absent". */
    roleEvidence?: string | null;
    /** The stored relationship type, if any — romantic/family types are rejected here. */
    storedRelationshipType?: string | null;
    evidenceIds?: string[];
  }>;
  tools?: Array<{ name: string; purpose?: string; evidenceIds?: string[] }>;
  tasks?: Array<{ description: string; status?: string; evidenceIds?: string[] }>;
  blockers?: Array<{ description: string; evidenceIds?: string[] }>;
  /** "It's my 4th week here" + when it was said. */
  tenureStatements?: Array<{ text: string; statedAt: string }>;
};
