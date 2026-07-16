/**
 * Coworker / teammate inference — "with Gary and Jeff".
 * Never assumes manager unless explicit evidence exists elsewhere.
 */
import {
  inferenceBase,
  type HistoryContext,
  type InferredPersonAssociation,
  type InferredRelationshipAssociation,
} from '../inferenceAssociationTypes';
import { matchExistingPerson } from '../historyAssociationService';

const WITH_NAMES_RE =
  /\bwith\s+([A-Z][\p{L}'’-]+(?:\s*,\s*[A-Z][\p{L}'’-]+)*(?:\s*,?\s+and\s+[A-Z][\p{L}'’-]+)?)/gu;
const MANAGER_EVIDENCE_RE = /\b(?:my\s+)?(?:boss|manager|supervisor|reports?\s+to)\s+([A-Z][a-z]+)\b/i;

export interface CoworkerCandidate {
  name: string;
  relationshipType: 'coworker_candidate' | 'manager_candidate' | 'teammate_candidate';
  existingEntityId?: string;
  confidence: number;
  evidencePhrase: string;
}

export function extractCoworkerNames(text: string): CoworkerCandidate[] {
  const candidates: CoworkerCandidate[] = [];
  const managerMatch = MANAGER_EVIDENCE_RE.exec(text);
  const managerName = managerMatch?.[1]?.toLowerCase();

  WITH_NAMES_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WITH_NAMES_RE.exec(text)) !== null) {
    // Preserve the final coordinated member: "with Chris, Jesse, and
    // Jimani" must produce all three names, not silently drop the tail.
    const names = m[1].match(/[A-Z][\p{L}'’-]+/gu) ?? [];
    for (const name of names) {
      if (/^(I|We|My|Our|The)$/i.test(name)) continue;
      const isManager = managerName === name.toLowerCase();
      candidates.push({
        name,
        relationshipType: isManager ? 'manager_candidate' : 'coworker_candidate',
        confidence: isManager ? 0.85 : 0.82,
        evidencePhrase: m[0],
      });
    }
  }
  return candidates;
}

export function inferCoworkerAssociations(
  text: string,
  messageId: string,
  history: HistoryContext,
  employerName?: string,
  userLabel = 'User'
): {
  people: InferredPersonAssociation[];
  relationships: InferredRelationshipAssociation[];
} {
  const people: InferredPersonAssociation[] = [];
  const relationships: InferredRelationshipAssociation[] = [];
  const candidates = extractCoworkerNames(text);

  for (const c of candidates) {
    const existing = matchExistingPerson(history, c.name);
    const relType =
      c.relationshipType === 'manager_candidate' ? 'manager' : 'coworker';

    people.push({
      ...inferenceBase(messageId, [c.evidencePhrase], c.confidence, 'coworker_with_pattern'),
      name: c.name,
      normalizedName: c.name.toLowerCase(),
      existingEntityId: existing?.id,
      aliasLikely: existing?.aliasLikely,
      roles: [c.relationshipType],
      associatedCommunities: employerName ? [`${employerName} Community`] : [],
      associatedPlaces: [],
      hobbyCandidates: [],
      skillCandidates: [],
      interestCandidates: [],
    });

    relationships.push({
      ...inferenceBase(messageId, [c.evidencePhrase], c.confidence, 'worked_with'),
      subjectName: userLabel,
      objectName: c.name,
      relationshipType: relType === 'manager' ? 'reports_to' : 'worked_with',
      direction: 'user_to_person',
    });

    if (employerName) {
      relationships.push({
        ...inferenceBase(messageId, [c.evidencePhrase], c.confidence * 0.9, 'coworker_same_org'),
        subjectName: c.name,
        objectName: employerName,
        relationshipType: 'member_of',
        direction: 'person_to_community',
      });
    }
  }

  return { people, relationships };
}
