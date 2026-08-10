import { createHash } from 'crypto';

import {
  hasLifeChangeSignal,
  hasProgressSignal,
  hasProjectSignal,
  hasQuestSignal,
  hasSkillSignal,
} from '../conversationCentered/extractionSignals';

import type {
  CognitiveChange,
  CognitiveDiff,
  CognitiveDomain,
  CognitiveEvidenceInput,
  CognitiveStateSnapshot,
} from './cognitiveUpdateTypes';
import { planProjectionImpacts } from './projectionDependencyGraph';

type ChangeSpec = Omit<CognitiveChange, 'evidenceIds'>;

const ACCEPTED_JOB_RE =
  /\b(accepted\s+(?:(?:a|the)\s+)?(?:[\w-]+\s+){0,4}(?:job|offer)|got (?:a |the )?(?:new )?job|was hired|starting (?:a |the )?(?:new )?job|start(?:ed|ing) (?:at|with) .+ as)\b/i;
const CAREER_END_RE = /\b(laid off|got fired|was fired|quit my job|left my job|retired from)\b/i;
const GRADUATION_RE = /\b(graduated|graduation|earned my degree|finished (?:college|university|school))\b/i;
const RELATIONSHIP_START_RE = /\b(started dating|we are dating|became official|got engaged|got married|we reconciled)\b/i;
const RELATIONSHIP_END_RE = /\b(broke up|breakup|ended (?:the|our) relationship|got divorced|we separated|no longer together)\b/i;
const GOAL_COMPLETED_RE = /\b(completed|finished|accomplished|achieved|done with)\b/i;
const GOAL_ABANDONED_RE = /\b(abandoned|gave up|no longer want|cancelled|canceled|stopped pursuing)\b/i;
const PROJECT_STARTED_RE = /\b(started|began|launched|created)\b/i;
const PROJECT_COMPLETED_RE = /\b(shipped|launched|released|deployed|finished|completed)\b/i;
const CORRECTION_RE = /\b(actually|correction|that(?:'s| is) wrong|wrong date|didn(?:'t| not)|no longer)\b/i;
const REPEATED_PATTERN_RE = /\b(again|keeps happening|always|every time|another time|same pattern)\b/i;
const PROJECT_DORMANT_RE = /\b(?:is not|isn't|is no longer)\s+(?:an?\s+)?active project\b|\b(?:haven't|have not)\s+worked on\s+(?:it|[\w.-]+)\s+since\b/i;
const CURRENT_FOCUS_RE = /\b(?:right now\s+)?i(?:'m| am)\s+(?:mainly|mostly|primarily)\s+focused on\b|\b(?:my\s+)?current priorities?\s+(?:are|is)\b/i;
const DETENTION_RE = /\b(?:i|we)\s+(?:(?:was|were|got|have been|had been)\s+)(?:detained|arrested|taken into custody)\b/i;

function addChange(
  changes: ChangeSpec[],
  spec: ChangeSpec,
): void {
  if (changes.some((change) => change.type === spec.type && change.domain === spec.domain)) return;
  changes.push(spec);
}

function identityDomain(text: string): CognitiveDomain | null {
  if (/\b(robot|robotics|engineering|software|developer|technical|career|job)\b/i.test(text)) return 'career';
  if (/\b(song|music|artist|recording|album|single|track)\b/i.test(text)) return 'music';
  if (/\b(fitness|gym|workout|health|training)\b/i.test(text)) return 'health';
  if (/\b(project|startup|built|launched|shipped)\b/i.test(text)) return 'projects';
  return null;
}

export function detectCognitiveChanges(
  evidence: CognitiveEvidenceInput,
  previous: CognitiveStateSnapshot | null = null,
): CognitiveChange[] {
  // Assistant prose and external claims may be evidence, but they cannot drive
  // autobiographical projection updates without review in this first version.
  if (evidence.authorRole !== 'user') return [];

  const text = evidence.content.trim();
  if (text.length < 8) return [];
  const evidenceIds = [evidence.evidenceId];
  const changes: ChangeSpec[] = [];

  if (ACCEPTED_JOB_RE.test(text)) {
    addChange(changes, {
      type: 'CAREER_MILESTONE',
      domain: 'career',
      summary: 'User explicitly reported accepting or starting a job.',
      confidence: 0.96,
      status: 'OBSERVED',
    });
    addChange(changes, {
      type: 'CHAPTER_STARTED',
      domain: 'career',
      summary: 'A new career chapter may have started.',
      confidence: 0.82,
      status: 'CANDIDATE',
      previousStateRef: previous?.currentChapter?.id,
    });
    if (previous?.currentChapter && /search|transition/i.test(previous.currentChapter.status)) {
      addChange(changes, {
        type: 'CHAPTER_ENDED',
        domain: previous.currentChapter.domain,
        summary: 'The previous career-search or transition chapter may have ended.',
        confidence: 0.88,
        status: 'CANDIDATE',
        previousStateRef: previous.currentChapter.id,
      });
    }
    const completedCareerGoal = previous?.activeGoals?.find((goal) =>
      /\b(job|career|interview|employment|offer)\b/i.test(goal.title) &&
      !/completed|cancelled|abandoned/i.test(goal.status),
    );
    if (completedCareerGoal) {
      addChange(changes, {
        type: 'GOAL_COMPLETED',
        domain: 'goals',
        summary: 'Accepting the job may complete an active career-search goal.',
        confidence: 0.86,
        status: 'REVIEW_REQUIRED',
        previousStateRef: completedCareerGoal.id,
      });
    }
  } else if (CAREER_END_RE.test(text) || GRADUATION_RE.test(text)) {
    addChange(changes, {
      type: 'CAREER_MILESTONE',
      domain: GRADUATION_RE.test(text) ? 'education' : 'career',
      summary: GRADUATION_RE.test(text)
        ? 'User explicitly reported an education milestone.'
        : 'User explicitly reported a career transition.',
      confidence: 0.94,
      status: 'OBSERVED',
    });
  }

  if (RELATIONSHIP_START_RE.test(text) || RELATIONSHIP_END_RE.test(text)) {
    addChange(changes, {
      type: 'RELATIONSHIP_CHANGED',
      domain: 'relationships',
      summary: RELATIONSHIP_END_RE.test(text)
        ? 'User explicitly reported a relationship ending or separation.'
        : 'User explicitly reported a relationship status change.',
      confidence: 0.94,
      status: 'REVIEW_REQUIRED',
    });
  }

  if (hasQuestSignal(text) && GOAL_ABANDONED_RE.test(text)) {
    addChange(changes, {
      type: 'GOAL_ABANDONED',
      domain: 'goals',
      summary: 'User explicitly reported abandoning or cancelling a goal.',
      confidence: 0.92,
      status: 'REVIEW_REQUIRED',
    });
  } else if (hasProgressSignal(text) && GOAL_COMPLETED_RE.test(text)) {
    addChange(changes, {
      type: 'GOAL_COMPLETED',
      domain: 'goals',
      summary: 'User explicitly reported completing a goal or milestone.',
      confidence: 0.88,
      status: 'REVIEW_REQUIRED',
    });
  }

  if (hasProjectSignal(text)) {
    if (PROJECT_COMPLETED_RE.test(text)) {
      addChange(changes, {
        type: 'PROJECT_COMPLETED',
        domain: 'projects',
        summary: 'User explicitly reported shipping or completing a project milestone.',
        confidence: 0.9,
        status: 'REVIEW_REQUIRED',
      });
    } else if (PROJECT_STARTED_RE.test(text)) {
      addChange(changes, {
        type: 'PROJECT_STARTED',
        domain: 'projects',
        summary: 'User explicitly reported starting a project.',
        confidence: 0.84,
        status: 'REVIEW_REQUIRED',
      });
    }
  }

  if (PROJECT_DORMANT_RE.test(text)) {
    addChange(changes, {
      type: 'PROJECT_STATUS_CHANGED',
      domain: 'projects',
      summary: 'User explicitly changed an existing project from active to dormant.',
      confidence: 0.96,
      status: 'OBSERVED',
    });
  }

  if (CURRENT_FOCUS_RE.test(text)) {
    addChange(changes, {
      type: 'CURRENT_FOCUS_CHANGED',
      domain: 'identity',
      summary: 'User explicitly replaced their current priorities or focus.',
      confidence: 0.95,
      status: 'OBSERVED',
    });
  }

  if (DETENTION_RE.test(text)) {
    addChange(changes, {
      type: 'LIFE_EVENT_DETECTED',
      domain: 'timeline',
      summary: 'User explicitly reported being detained or arrested.',
      confidence: 0.96,
      status: 'OBSERVED',
    });
  }

  const domain = identityDomain(text);
  if (
    domain &&
    (ACCEPTED_JOB_RE.test(text) || hasLifeChangeSignal(text) || hasProjectSignal(text) || hasSkillSignal(text))
  ) {
    addChange(changes, {
      type: 'IDENTITY_STRENGTHENED',
      domain,
      summary: `New evidence may strengthen the user's ${domain} identity thread.`,
      confidence: 0.72,
      status: 'CANDIDATE',
    });
  }

  if (CORRECTION_RE.test(text) && /\b(date|when|year|month|day|timeline)\b/i.test(text)) {
    addChange(changes, {
      type: 'TIMELINE_CORRECTION',
      domain: 'timeline',
      summary: 'User supplied an explicit temporal correction.',
      confidence: 0.9,
      status: 'REVIEW_REQUIRED',
    });
  } else if (CORRECTION_RE.test(text)) {
    addChange(changes, {
      type: 'CONTRADICTION_DETECTED',
      domain: 'narrative',
      summary: 'New user evidence may contradict an existing assertion.',
      confidence: 0.72,
      status: 'REVIEW_REQUIRED',
    });
  }

  if (REPEATED_PATTERN_RE.test(text)) {
    addChange(changes, {
      type: 'RECURRING_PATTERN_CANDIDATE',
      domain: 'narrative',
      summary: 'User language indicates a potentially recurring pattern.',
      confidence: 0.62,
      status: 'CANDIDATE',
    });
  }

  return changes.map((change) => ({ ...change, evidenceIds }));
}

export function evaluateCognitiveUpdate(input: {
  evidence: CognitiveEvidenceInput;
  previousState?: CognitiveStateSnapshot | null;
  now?: string;
}): CognitiveDiff {
  const evaluatedAt = input.now ?? new Date().toISOString();
  const changes = detectCognitiveChanges(input.evidence, input.previousState ?? null);
  const impacts = planProjectionImpacts(changes, { batchSize: input.evidence.batchSize });
  const confidence = changes.length
    ? Number((changes.reduce((sum, change) => sum + change.confidence, 0) / changes.length).toFixed(2))
    : 1;
  const id = createHash('sha256')
    .update(`cognitive-update-v1:${input.evidence.userId}:${input.evidence.evidenceId}:${input.previousState?.revision ?? 'none'}`)
    .digest('hex')
    .slice(0, 24);

  return {
    id: `cogdiff_${id}`,
    version: 'cognitive-update-v1',
    evaluatedAt,
    mode: 'SHADOW',
    trigger: {
      evidenceId: input.evidence.evidenceId,
      source: input.evidence.source,
      stateRevision: input.previousState?.revision ?? null,
    },
    changed: changes.length > 0,
    changes,
    impacts,
    confidence,
    requiresReview: changes.some((change) => change.status === 'REVIEW_REQUIRED'),
    ...(changes.length === 0
      ? { noChangeReason: 'No explicit, high-signal autobiographical state change was detected.' }
      : {}),
    invariants: {
      rawEvidenceMutated: false,
      canonicalStateMutated: false,
    },
  };
}
