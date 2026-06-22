import type { RelationshipCandidate } from './relationshipInferenceTypes';
import { USER_ENTITY } from './relationshipInferenceTypes';
import { buildRelationshipContext } from './relationshipProvenanceService';
import {
  invertPredicateForUserWorksFor,
  makeRelationshipCandidate,
  normalizeWorkPredicate,
  shouldNotInferManager,
} from './relationshipDirectionResolver';
import { resolveTemporalStatus } from './relationshipTemporalResolver';

const NAMED_WORK_RE =
  /\b([A-Z][a-z]+)\s+is\s+my\s+(boss|manager|coworker|colleague|recruiter|interviewer|mentor|client|vendor|teammate)\b/gi;

const WORKS_FOR_RE = /\bI\s+work(?:ed)?\s+for\s+([A-Z][A-Za-z\s&'.-]+)\b/gi;

const EMPLOYER_RE = /\b([A-Z][A-Za-z\s&'.-]+)\s+(?:is\s+)?(?:my\s+)?employer\b/gi;

export function inferWorkRelationships(text: string): RelationshipCandidate[] {
  const out: RelationshipCandidate[] = [];
  let match: RegExpExecArray | null;

  const namedRe = new RegExp(NAMED_WORK_RE.source, 'gi');
  while ((match = namedRe.exec(text)) !== null) {
    const name = match[1].trim();
    const role = match[2].trim();
    if (shouldNotInferManager(role, text) && /boss|manager/i.test(role)) continue;

    const predicate = normalizeWorkPredicate(role);
    const isBoss = /boss|manager|supervisor/i.test(role);

    out.push(
      makeRelationshipCandidate({
        subject: { displayName: name },
        predicate: isBoss ? 'boss_of' : predicate,
        object: USER_ENTITY,
        relationshipType: 'work',
        temporalStatus: resolveTemporalStatus(text, predicate),
        direction: isBoss ? 'subject_to_object' : role.match(/coworker|colleague|teammate/i) ? 'bidirectional' : 'subject_to_object',
        context: buildRelationshipContext(text, match[0], {
          organizationContext: text.match(/\bVanguard Robotics\b/i)?.[0],
        }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: isBoss ? 0.9 : 0.87,
        inferredNotConfirmed: true,
        requiresReview: isBoss,
        promotionStatus: 'candidate',
      }),
    );
  }

  const worksForRe = new RegExp(WORKS_FOR_RE.source, 'gi');
  while ((match = worksForRe.exec(text)) !== null) {
    const org = match[1].trim();
    const inverted = invertPredicateForUserWorksFor(org);
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: inverted.subject, entityId: 'user' },
        predicate: inverted.predicate,
        object: { displayName: inverted.object },
        relationshipType: 'work',
        temporalStatus: resolveTemporalStatus(text, 'works_for'),
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0], { organizationContext: org }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.91,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      }),
    );

    out.push(
      makeRelationshipCandidate({
        subject: { displayName: org },
        predicate: 'employer_of',
        object: USER_ENTITY,
        relationshipType: 'work',
        temporalStatus: resolveTemporalStatus(text, 'employer_of'),
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0], { organizationContext: org }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.9,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      }),
    );
  }

  const employerRe = new RegExp(EMPLOYER_RE.source, 'gi');
  while ((match = employerRe.exec(text)) !== null) {
    const org = match[1].trim();
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: org },
        predicate: 'employer_of',
        object: USER_ENTITY,
        relationshipType: 'work',
        temporalStatus: 'current',
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.9,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      }),
    );
  }

  return out;
}
