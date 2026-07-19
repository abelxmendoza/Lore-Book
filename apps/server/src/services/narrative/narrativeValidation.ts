/**
 * Narrative Validation — refuse to publish chapters that fail the ownership contract.
 */

import { isPublishableLifeLogTitle } from '../events/lifeLogEligibilityPolicy';
import type { AssembledChapter } from './chapterAssembler';
import { classifySceneNarrative, PERSON_DOMAINS } from './narrativeIdentity';

export type NarrativeValidationResult = {
  allow: boolean;
  reasons: string[];
};

/**
 * Validate that a chapter remains coherent under its ownership contract.
 */
export function validateChapterOwnership(chapter: AssembledChapter): NarrativeValidationResult {
  const reasons: string[] = [];
  const ownership = chapter.ownership;

  if (!ownership?.primaryNarrative?.trim()) {
    reasons.push('Missing primary narrative');
  }
  if (!chapter.title.trim() || !isPublishableLifeLogTitle(chapter.title)) {
    reasons.push('Title is not publishable');
  }

  const supporting = chapter.contributions.filter((c) => c.classification === 'supporting');
  if (supporting.length === 0 || chapter.scenes.length === 0) {
    reasons.push('No supporting evidence for the ownership contract');
  }

  // Every supporting scene must share domain (and subject when person-centered).
  const ownershipSubject = ownership?.primarySubject?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ?? null;
  for (const scene of chapter.scenes) {
    const identity = classifySceneNarrative(scene);
    if (ownership && identity.domain !== ownership.domain && identity.secondaryDomain !== ownership.domain) {
      reasons.push(`Supporting scene drifts domain: ${scene.id}`);
    }
    if (
      ownership &&
      PERSON_DOMAINS.has(ownership.domain) &&
      ownershipSubject &&
      identity.subject &&
      identity.subject !== ownershipSubject
    ) {
      reasons.push(`Competing subject in supporting set: ${identity.subject}`);
    }
  }

  // High-stakes domains should answer what changed when multiple beats exist.
  if (
    ownership &&
    (ownership.domain === 'romance' || ownership.domain === 'career') &&
    chapter.scenes.length >= 2 &&
    !ownership.primaryConflict &&
    !ownership.primaryOutcome
  ) {
    reasons.push('High-stakes chapter missing conflict/outcome');
  }

  return { allow: reasons.length === 0, reasons };
}

export function mayPublishOwnedChapter(chapter: AssembledChapter): NarrativeValidationResult {
  return validateChapterOwnership(chapter);
}
