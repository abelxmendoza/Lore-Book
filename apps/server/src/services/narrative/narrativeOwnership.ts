/**
 * Narrative Ownership — a chapter must know what story it tells before
 * collecting evidence.
 *
 * Pipeline: Discovery → Ownership Contract → Evidence Scoring → (Validation elsewhere)
 *
 * Pure functions: no DB.
 */

import {
  classifySceneNarrative,
  PERSON_DOMAINS,
  type ChapterSceneInput,
  type NarrativeDomain,
  type NarrativeIdentity,
} from './narrativeIdentity';

/** Align with arc-thesis CHAPTER_CONTRIBUTION_THRESHOLD. */
export const SCENE_CONTRIBUTION_THRESHOLD = 60;

export type ContributionClassification = 'supporting' | 'background' | 'excluded';

export type NarrativeOwnership = {
  primaryNarrative: string;
  primarySubject: string | null;
  primaryConflict: string | null;
  primaryOutcome: string | null;
  domain: NarrativeDomain;
};

export type SceneNarrativeContribution = {
  sceneId: string;
  supportsNarrative: boolean;
  strength: number;
  reason: string;
  classification: ContributionClassification;
};

function compact(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sceneBlob(scene: ChapterSceneInput): string {
  return `${scene.title} ${scene.summary} ${scene.primaryGoal ?? ''} ${(scene.themes ?? []).join(' ')}`.toLowerCase();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function pickProjectName(blob: string): string | null {
  const m = blob.match(/\b(?:building|built|build|working on|worked on)\s+([a-z][\w'-]+)/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pick the anchor scene that best declares the story (significance + clear identity).
 */
export function discoverNarrative(scenes: ChapterSceneInput[]): {
  identity: NarrativeIdentity;
  anchor: ChapterSceneInput;
} | null {
  if (scenes.length === 0) return null;

  const ranked = [...scenes].sort((a, b) => {
    const ia = classifySceneNarrative(a);
    const ib = classifySceneNarrative(b);
    const clarityA = (ia.domain !== 'unknown' ? 40 : 0) + (ia.subject ? 20 : 0);
    const clarityB = (ib.domain !== 'unknown' ? 40 : 0) + (ib.subject ? 20 : 0);
    const scoreA = (a.significanceScore ?? 0) + clarityA;
    const scoreB = (b.significanceScore ?? 0) + clarityB;
    return scoreB - scoreA;
  });

  const anchor = ranked[0];
  const identity = classifySceneNarrative(anchor);
  if (identity.domain === 'unknown' && !identity.subject) return null;
  return { identity, anchor };
}

function inferConflictOutcome(
  domain: NarrativeDomain,
  blob: string,
): { conflict: string | null; outcome: string | null } {
  if (domain === 'romance') {
    if (/\b(?:blocked|block(?:ed|ing)?|unfollowed)\b/.test(blob)) {
      return { conflict: 'Ghosting and eventual blocking', outcome: 'No contact' };
    }
    if (/\b(?:breakup|broke up|ended things|ended the relationship)\b/.test(blob)) {
      return { conflict: 'Relationship ended', outcome: 'Separation' };
    }
    if (/\b(?:ghost(?:ed|ing)?|no contact|radio silence)\b/.test(blob)) {
      return { conflict: 'Silence and uncertainty', outcome: 'No contact' };
    }
    if (/\b(?:first date|started dating|met (?:her|him)|crush|fell for)\b/.test(blob)) {
      return { conflict: 'New romantic connection', outcome: 'Relationship beginning' };
    }
    return { conflict: 'Relationship tension', outcome: null };
  }
  if (domain === 'career') {
    if (/\b(?:onboard|hired|started|first day|accepted the offer)\b/.test(blob)) {
      return { conflict: 'Starting a new role', outcome: 'Career chapter begins' };
    }
    if (/\b(?:laid off|fired|quit|resigned|left the job)\b/.test(blob)) {
      return { conflict: 'Job ending', outcome: 'Left the role' };
    }
    if (/\b(?:promotion|promoted)\b/.test(blob)) {
      return { conflict: 'Advancement at work', outcome: 'Promotion' };
    }
    return { conflict: 'Work-life developments', outcome: null };
  }
  if (domain === 'creative') {
    if (/\b(?:shipped|launched|released|deployed)\b/.test(blob)) {
      return { conflict: 'Shipping creative work', outcome: 'Release' };
    }
    if (/\b(?:built|building|build|coded|coding|working on|worked on)\b/.test(blob)) {
      return { conflict: 'Building something that matters', outcome: 'Ongoing creative work' };
    }
    return { conflict: 'Creative effort', outcome: null };
  }
  if (domain === 'family') {
    if (/\b(?:costco|grocery|groceries|errand|shopping)\b/.test(blob)) {
      return { conflict: 'Family errands and caregiving', outcome: null };
    }
    return { conflict: 'Family time and obligations', outcome: null };
  }
  if (domain === 'friends') {
    return { conflict: 'Friendship and social connection', outcome: null };
  }
  if (domain === 'social_scene') {
    if (/\b(?:lame|weirdo|posting me|calling me|uncomfortable)\b/.test(blob)) {
      return { conflict: 'Reputation and fallout in the scene', outcome: 'Social strain' };
    }
    if (/\b(?:missed out|another weekend)\b/.test(blob)) {
      return { conflict: 'Chasing nights and missing scenes', outcome: null };
    }
    return { conflict: 'Nights out and the social scene', outcome: null };
  }
  if (domain === 'health') {
    if (/\b(?:depressed|depression|anxious|anxiety|lonely)\b/.test(blob)) {
      return { conflict: 'Mental health and emotional weight', outcome: null };
    }
    return { conflict: 'Health and recovery', outcome: null };
  }
  if (domain === 'errands') {
    return { conflict: 'Daily logistics', outcome: null };
  }
  return { conflict: null, outcome: null };
}

function ownershipNarrative(
  identity: NarrativeIdentity,
  conflict: string | null,
  outcome: string | null,
  scenes: ChapterSceneInput[],
): string {
  const subject = identity.subjectLabel;
  const blob = scenes.map(sceneBlob).join(' ');

  if (identity.domain === 'romance') {
    if (subject) {
      if (outcome && /no contact|separation/i.test(outcome)) {
        return `Your relationship with ${subject} came to an end.`;
      }
      if (conflict && /beginning|new romantic/i.test(conflict)) {
        return `You began a romance with ${subject}.`;
      }
      return `Your relationship with ${subject}.`;
    }
    if (outcome && /no contact|separation/i.test(outcome)) {
      if (/\bmet (?:her|him)\b/.test(blob) && /\bblocked\b/.test(blob)) {
        return 'You met someone at the afters, then the connection ended in no contact.';
      }
      return 'A romance that ended in no contact.';
    }
    if (conflict && /beginning|new romantic/i.test(conflict)) {
      return 'A new romantic connection.';
    }
    return 'A romance chapter.';
  }
  if (identity.domain === 'career') {
    if (outcome && /begins|promotion/i.test(outcome)) {
      return compact(`A career turning point${outcome ? `: ${outcome.toLowerCase()}` : ''}.`);
    }
    return 'A chapter of your work life.';
  }
  if (identity.domain === 'creative') {
    const project = pickProjectName(blob);
    if (project) {
      return outcome && /ongoing/i.test(outcome)
        ? `You kept building ${project}.`
        : `A chapter of building ${project}.`;
    }
    return 'A chapter of building and creative work.';
  }
  if (identity.domain === 'family') {
    if (subject && /\b(?:costco|grocery|errand|shopping)\b/.test(blob)) {
      return `Errands and time with ${subject}.`;
    }
    if (subject) return `Family life with ${subject}.`;
    return 'Family life and everyday obligations.';
  }
  if (identity.domain === 'social_scene') {
    if (outcome && /social strain/i.test(outcome)) {
      return 'Nights out in the scene, and the fallout that followed.';
    }
    if (/\b(?:club|afters|danced|dancing)\b/.test(blob)) {
      return 'A stretch of nights out in the scene.';
    }
    return 'Nights out and the social scene.';
  }
  if (identity.domain === 'health') {
    if (/\b(?:depressed|depression)\b/.test(blob)) {
      return 'A heavier stretch when you stayed in and felt depressed.';
    }
    return 'A chapter about your health and emotional state.';
  }
  if (identity.domain === 'friends') {
    if (subject) return `Time and friendship with ${subject}.`;
    return 'Time with friends.';
  }
  if (identity.statement) {
    return identity.statement.replace(/^This chapter is about\s+/i, '').replace(/\.$/, '') + '.';
  }
  return identity.statement || '';
}

/**
 * Declare the ownership contract from identity + scene evidence cues.
 */
export function declareOwnership(
  identity: NarrativeIdentity,
  scenes: ChapterSceneInput[],
): NarrativeOwnership | null {
  if (identity.domain === 'unknown' && !identity.subject) return null;

  const blob = scenes.map(sceneBlob).join(' ');
  const { conflict, outcome } = inferConflictOutcome(identity.domain, blob);
  const primaryNarrative = ownershipNarrative(identity, conflict, outcome, scenes);
  if (!primaryNarrative.trim()) return null;

  return {
    primaryNarrative: compact(primaryNarrative),
    primarySubject: identity.subjectLabel ?? identity.subject,
    primaryConflict: conflict,
    primaryOutcome: outcome,
    domain: identity.domain,
  };
}

/**
 * Does this scene help tell the owned story?
 */
export function scoreSceneContribution(
  ownership: NarrativeOwnership,
  scene: ChapterSceneInput,
): SceneNarrativeContribution {
  const identity = classifySceneNarrative(scene);
  const blob = sceneBlob(scene);
  const sceneSubject = identity.subject;
  const ownershipSubject = ownership.primarySubject
    ? normalizeToken(ownership.primarySubject)
    : null;

  // Wrong person in a person-centered story → hard exclude
  if (
    PERSON_DOMAINS.has(ownership.domain) &&
    ownershipSubject &&
    sceneSubject &&
    sceneSubject !== ownershipSubject
  ) {
    return {
      sceneId: scene.id,
      supportsNarrative: false,
      strength: 5,
      reason: 'Different subject than the chapter ownership contract',
      classification: 'excluded',
    };
  }

  const domainMatch =
    identity.domain === ownership.domain || identity.secondaryDomain === ownership.domain;

  // Wrong domain (e.g. errands during a breakup) → hard exclude
  if (identity.domain !== 'unknown' && !domainMatch) {
    // Soft background only if the ownership subject appears in cast and domain is weak social glue
    const cast = (scene.participants ?? []).map(normalizeToken);
    if (
      ownershipSubject &&
      cast.includes(ownershipSubject) &&
      (identity.domain === 'friends' || identity.domain === 'social_scene')
    ) {
      return {
        sceneId: scene.id,
        supportsNarrative: false,
        strength: 35,
        reason: 'Subject present but scene domain is only weak context',
        classification: 'background',
      };
    }
    return {
      sceneId: scene.id,
      supportsNarrative: false,
      strength: 8,
      reason: 'Unrelated domain for this narrative',
      classification: 'excluded',
    };
  }

  let strength = 35;
  const reasons: string[] = [];

  if (identity.domain === ownership.domain) {
    strength += 30;
    reasons.push('Same narrative domain');
  } else if (identity.secondaryDomain === ownership.domain) {
    strength += 28;
    reasons.push('Secondary domain matches ownership');
  } else if (identity.domain === 'unknown' && ownership.domain === 'social_scene' && /\b(?:club|bar|afters|scene|danced)\b/.test(blob)) {
    strength += 28;
    reasons.push('Nightlife cues under social-scene ownership');
  }

  if (ownershipSubject && sceneSubject === ownershipSubject) {
    strength += 25;
    reasons.push('Matches primary subject');
  } else if (ownershipSubject && (scene.participants ?? []).map(normalizeToken).includes(ownershipSubject)) {
    strength += 15;
    reasons.push('Primary subject appears in cast');
  } else if (ownershipSubject && blob.includes(ownershipSubject)) {
    strength += 15;
    reasons.push('Primary subject mentioned in scene');
  }

  // Conflict/outcome cue alignment
  if (ownership.primaryConflict && /\b(?:block|ghost|breakup|onboard|hired|built|building|depressed|costco|club)\b/.test(blob)) {
    strength += 10;
    reasons.push('Aligns with chapter conflict cues');
  }

  strength = clamp(strength, 0, 100);
  const classification: ContributionClassification =
    strength >= SCENE_CONTRIBUTION_THRESHOLD
      ? 'supporting'
      : strength >= 30
        ? 'background'
        : 'excluded';

  return {
    sceneId: scene.id,
    supportsNarrative: classification === 'supporting',
    strength,
    reason: reasons.join('; ') || 'Weak narrative fit',
    classification,
  };
}

export function collectEvidence(
  ownership: NarrativeOwnership,
  scenes: ChapterSceneInput[],
): {
  supporting: ChapterSceneInput[];
  background: ChapterSceneInput[];
  excluded: ChapterSceneInput[];
  contributions: SceneNarrativeContribution[];
} {
  const contributions = scenes.map((s) => scoreSceneContribution(ownership, s));
  const byId = new Map(contributions.map((c) => [c.sceneId, c]));
  const supporting: ChapterSceneInput[] = [];
  const background: ChapterSceneInput[] = [];
  const excluded: ChapterSceneInput[] = [];
  for (const scene of scenes) {
    const c = byId.get(scene.id)!;
    if (c.classification === 'supporting') supporting.push(scene);
    else if (c.classification === 'background') background.push(scene);
    else excluded.push(scene);
  }
  return { supporting, background, excluded, contributions };
}

/**
 * Discover + declare ownership for a candidate scene set.
 */
export function establishOwnership(scenes: ChapterSceneInput[]): NarrativeOwnership | null {
  const discovered = discoverNarrative(scenes);
  if (!discovered) return null;
  return declareOwnership(discovered.identity, scenes);
}
