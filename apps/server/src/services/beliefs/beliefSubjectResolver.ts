import type { BeliefCognitionInput, BeliefSubjectResolution } from './beliefTypes';

const FIRST_PERSON = /^(?:(?:yeah|so|well|right now|ok(?:ay)?)\s+)?(?:i(?:'m| am|'ve| ve)?|my|we(?:'re| are)?)\b/i;

/**
 * Resolve the proposition subject.
 * Hard rule: story group / group_label is organizational metadata and must never
 * become the subject unless independent parsing proves it is the grammatical actor.
 */
export function resolveBeliefSubject(input: BeliefCognitionInput): BeliefSubjectResolution {
  const claim = (input.claimText ?? '').trim();
  const source = (input.sourceText ?? claim).trim();
  const userName = (input.userDisplayName || 'The user').trim();
  const storyGroup = (input.storyGroupLabel || String(input.metadata?.group_label ?? '')).trim();
  const entityName = (input.entityName || '').trim();
  const rejected: BeliefSubjectResolution['rejectedCandidates'] = [];

  if (storyGroup) {
    rejected.push({
      label: storyGroup,
      reason: 'story_group_is_metadata_not_subject',
    });
  }
  if (entityName && entityName.toLowerCase() === storyGroup.toLowerCase()) {
    rejected.push({
      entityId: input.entityId,
      label: entityName,
      reason: 'entity_name_matches_story_group_rejected_as_default_subject',
    });
  }

  const namedLeadMatchesEntity =
    Boolean(entityName)
    && new RegExp(`^${escapeRegExp(entityName!)}\\b`, 'i').test(claim)
    && /\b(?:is|are|was|were)\b/i.test(claim);
  const storyGroupCollision = Boolean(storyGroup)
    && (
      (entityName ? labelsLooselyMatch(entityName, storyGroup) : false)
      || labelsLooselyMatch(claim.split(/\s+is\b/i)[0] ?? '', storyGroup)
    );
  const sourceHasFirstPerson = FIRST_PERSON.test(source) || /\bi(?:'m| am|'ve)?\b/i.test(source);
  // Explicit org/person subject only when the sentence truly leads with that name
  // and we are not repairing a story-group leak against first-person evidence.
  const explicitNamedSubject = namedLeadMatchesEntity && !(storyGroupCollision && sourceHasFirstPerson);

  // Evidence / source first-person wins over story-group-shaped claim subjects.
  const firstPersonEvidence = FIRST_PERSON.test(source)
    || FIRST_PERSON.test(claim)
    || sourceHasFirstPerson
    || (/\bi(?:'m| am|'ve)?\b/i.test(claim) && !explicitNamedSubject);

  if (firstPersonEvidence && !explicitNamedSubject) {
    if (storyGroupCollision) {
      rejected.push({
        label: storyGroup,
        reason: 'claim_subject_matches_story_group_overridden_by_first_person_evidence',
      });
    }
    return {
      subjectEntityId: `user:${input.userId}`,
      displayName: userName,
      entityType: 'USER',
      sourceSpan: source.match(FIRST_PERSON)?.[0] || claim.match(FIRST_PERSON)?.[0] || 'I',
      method: 'FIRST_PERSON',
      confidence: 0.95,
      rejectedCandidates: rejected,
    };
  }

  // Explicit third-person employer sentence: "Amazon is my new employer"
  if (explicitNamedSubject) {
    return {
      subjectEntityId: input.entityId,
      displayName: entityName,
      entityType: 'ORGANIZATION',
      sourceSpan: entityName,
      method: 'EXPLICIT_NAME',
      confidence: 0.9,
      rejectedCandidates: rejected,
    };
  }

  // Grammatical subject that is NOT the story group
  const gram = claim.match(/^([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3})\s+(?:is|are|was|were|went|felt|feels|works)\b/);
  if (gram?.[1]) {
    const label = gram[1].trim();
    if (storyGroup && labelsLooselyMatch(label, storyGroup)) {
      rejected.push({ label, reason: 'grammatical_subject_matches_story_group' });
      return {
        subjectEntityId: `user:${input.userId}`,
        displayName: userName,
        entityType: 'USER',
        sourceSpan: label,
        method: 'FIRST_PERSON',
        confidence: 0.8,
        rejectedCandidates: rejected,
      };
    }
    return {
      displayName: label,
      entityType: 'PERSON',
      sourceSpan: label,
      method: 'GRAMMATICAL_SUBJECT',
      confidence: 0.7,
      rejectedCandidates: rejected,
    };
  }

  // Default: if claim looks like it was wrongly prefixed with story group, repair to user
  if (storyGroup && claim.toLowerCase().startsWith(storyGroup.toLowerCase())) {
    return {
      subjectEntityId: `user:${input.userId}`,
      displayName: userName,
      entityType: 'USER',
      sourceSpan: storyGroup,
      method: 'FIRST_PERSON',
      confidence: 0.8,
      rejectedCandidates: [
        ...rejected,
        { label: storyGroup, reason: 'removed_story_group_prefix_from_claim' },
      ],
    };
  }

  if (entityName && !storyGroup) {
    return {
      subjectEntityId: input.entityId,
      displayName: entityName,
      entityType: 'UNKNOWN',
      sourceSpan: entityName,
      method: 'CONVERSATION_TOPIC',
      confidence: 0.45,
      rejectedCandidates: rejected,
    };
  }

  return {
    subjectEntityId: `user:${input.userId}`,
    displayName: userName,
    entityType: 'USER',
    sourceSpan: '',
    method: 'UNRESOLVED',
    confidence: 0.35,
    rejectedCandidates: rejected,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelsLooselyMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
