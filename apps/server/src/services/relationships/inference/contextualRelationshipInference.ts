import type { RelationshipCandidate } from './relationshipInferenceTypes';
import { buildRelationshipContext } from './relationshipProvenanceService';
import { makeRelationshipCandidate } from './relationshipDirectionResolver';

const UNRESOLVED_INVESTOR_RE =
  /\b(Potential\s+Investor\s+from\s+[A-Z][A-Za-z0-9&.'\s-]+)\b/gi;

const NEW_GUY_NOAH_RE =
  /\b(New\s+Guy\s+with\s+[A-Z][a-z]+\s+from\s+[A-Z][A-Za-z\s]+)\b/gi;

const CONFLICT_RE =
  /\b(?:fought|got\s+into\s+it|beef|wanted\s+to\s+jump\s+me|kicked\s+me\s+out)\b[^.!?]*/gi;

export function inferContextualRelationships(text: string): RelationshipCandidate[] {
  const out: RelationshipCandidate[] = [];
  let match: RegExpExecArray | null;

  const investorRe = new RegExp(UNRESOLVED_INVESTOR_RE.source, 'gi');
  while ((match = investorRe.exec(text)) !== null) {
    const label = match[1].trim();
    const org = label.match(/\bfrom\s+(.+)$/i)?.[1]?.trim();
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: label, unresolved: true },
        predicate: 'role_at_organization',
        object: { displayName: org ?? 'Unknown Organization', unresolved: !org },
        relationshipType: 'social_contact',
        temporalStatus: 'uncertain',
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0], { organizationContext: org }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.75,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'mention_only',
      }),
    );
  }

  const newGuyRe = new RegExp(NEW_GUY_NOAH_RE.source, 'gi');
  while ((match = newGuyRe.exec(text)) !== null) {
    const label = match[1].trim();
    const linkedPerson = label.match(/\bwith\s+([A-Z][a-z]+)/i)?.[1];
    const event = label.match(/\bfrom\s+(.+)$/i)?.[1]?.trim();
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: label, unresolved: true },
        predicate: 'linked_to',
        object: { displayName: linkedPerson ?? 'Unknown Person', unresolved: !linkedPerson },
        relationshipType: 'social_contact',
        temporalStatus: 'uncertain',
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0], {
          eventContext: event,
          groupContext: linkedPerson ? `with ${linkedPerson}` : undefined,
        }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.76,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'mention_only',
      }),
    );
  }

  if (CONFLICT_RE.test(text)) {
    const evidence = text.match(CONFLICT_RE)?.[0] ?? 'conflict';
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: 'Unresolved Person', unresolved: true },
        predicate: 'conflict_with',
        object: { displayName: 'user', entityId: 'user' },
        relationshipType: 'conflict',
        temporalStatus: 'past',
        direction: 'unclear',
        context: buildRelationshipContext(text, evidence, { emotionalContext: evidence }),
        evidencePhrases: [evidence],
        sourceMessageIds: [],
        confidence: 0.7,
        inferredNotConfirmed: true,
        requiresReview: true,
        sensitive: true,
        promotionStatus: 'mention_only',
      }),
    );
  }

  return out;
}

export const BARE_RELATIONSHIP_WORDS = new Set([
  'friend',
  'cousin',
  'coworker',
  'boss',
  'family',
  'they',
  'we',
  'together',
]);

export function isBareRelationshipPhrase(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return BARE_RELATIONSHIP_WORDS.has(trimmed);
}
