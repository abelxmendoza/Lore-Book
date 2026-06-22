import type { RelationshipCandidate } from './relationshipInferenceTypes';
import { USER_ENTITY } from './relationshipInferenceTypes';
import { buildRelationshipContext } from './relationshipProvenanceService';
import { makeRelationshipCandidate } from './relationshipDirectionResolver';

const SHARED_SCHOOL_RE =
  /\b(?:we\s+)?went\s+to\s+([A-Z][A-Za-z\s]+(?:School|Middle School|High School|University|College))\b/gi;

const CLASSMATE_RE =
  /\b([A-Z][a-z]+)\s+is\s+my\s+(classmate|schoolmate|bandmate|teammate|clubmate)\b/gi;

const PROFESSOR_RE =
  /\b(Professor|Dr\.?)\s+([A-Z][a-z]+)\s+is\s+my\s+(?:professor|teacher)\b/gi;

export function inferSchoolRelationships(text: string): RelationshipCandidate[] {
  const out: RelationshipCandidate[] = [];
  let match: RegExpExecArray | null;

  const schoolRe = new RegExp(SHARED_SCHOOL_RE.source, 'gi');
  while ((match = schoolRe.exec(text)) !== null) {
    const school = match[1].trim();
    out.push(
      makeRelationshipCandidate({
        subject: USER_ENTITY,
        predicate: 'schoolmate_at',
        object: { displayName: school },
        relationshipType: 'school',
        temporalStatus: /\bused\s+to|went\b/i.test(match[0]) ? 'past' : 'current',
        direction: 'bidirectional',
        context: buildRelationshipContext(text, match[0], { placeContext: school }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.84,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      }),
    );
  }

  const mateRe = new RegExp(CLASSMATE_RE.source, 'gi');
  while ((match = mateRe.exec(text)) !== null) {
    const name = match[1].trim();
    const role = match[2].trim().toLowerCase();
    const predicate =
      role === 'bandmate' ? 'bandmate_of' : role === 'teammate' ? 'teammate_of' : 'schoolmate_of';

    out.push(
      makeRelationshipCandidate({
        subject: { displayName: name },
        predicate,
        object: USER_ENTITY,
        relationshipType: 'school',
        temporalStatus: 'current',
        direction: 'bidirectional',
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.88,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      }),
    );
  }

  const profRe = new RegExp(PROFESSOR_RE.source, 'gi');
  while ((match = profRe.exec(text)) !== null) {
    const name = `${match[1]} ${match[2]}`.trim();
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: name },
        predicate: 'professor_of',
        object: USER_ENTITY,
        relationshipType: 'mentor_student',
        temporalStatus: 'current',
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.9,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'candidate',
      }),
    );
  }

  return out;
}
