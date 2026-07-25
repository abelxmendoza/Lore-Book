import type {
  BeliefDuplicateDecision,
  CompiledProposition,
  PropositionFingerprint,
} from './beliefTypes';

export function buildPropositionFingerprint(input: {
  proposition: CompiledProposition;
  evidenceIds: string[];
}): PropositionFingerprint {
  const { proposition, evidenceIds } = input;
  return {
    normalizedSubjectId: proposition.subject.entityId || normalize(proposition.subject.displayName),
    normalizedPredicate: normalize(proposition.predicate),
    normalizedObjectId: proposition.object?.entityId
      || (proposition.object?.displayName ? normalize(proposition.object.displayName) : undefined),
    normalizedLiteral: proposition.object?.literalValue != null
      ? normalize(String(proposition.object.literalValue))
      : normalize(proposition.renderedText),
    polarity: proposition.polarity,
    modality: proposition.modality,
    temporalBucket: proposition.temporalScope?.referenceExpression
      || proposition.temporalScope?.occurredAt?.slice(0, 10)
      || undefined,
    attributionFingerprint: proposition.attribution?.status,
    evidenceId: evidenceIds[0],
  };
}

export function resolveBeliefDuplicate(input: {
  fingerprint: PropositionFingerprint;
  existingFingerprints?: PropositionFingerprint[];
  existingTexts?: Array<{ id: string; text: string }>;
  renderedText: string;
}): {
  decision: BeliefDuplicateDecision;
  matchIds: string[];
} {
  const matches: string[] = [];
  const rendered = normalize(input.renderedText);

  for (const existing of input.existingFingerprints ?? []) {
    if (
      existing.evidenceId
      && input.fingerprint.evidenceId
      && existing.evidenceId === input.fingerprint.evidenceId
      && existing.normalizedPredicate === input.fingerprint.normalizedPredicate
      && existing.normalizedSubjectId === input.fingerprint.normalizedSubjectId
    ) {
      return { decision: 'EXACT_DUPLICATE', matchIds: [existing.evidenceId] };
    }
    if (
      existing.normalizedSubjectId === input.fingerprint.normalizedSubjectId
      && existing.normalizedPredicate === input.fingerprint.normalizedPredicate
      && existing.normalizedLiteral === input.fingerprint.normalizedLiteral
    ) {
      return { decision: 'SEMANTIC_DUPLICATE', matchIds: existing.evidenceId ? [existing.evidenceId] : [] };
    }
  }

  for (const row of input.existingTexts ?? []) {
    if (normalize(row.text) === rendered) {
      matches.push(row.id);
      return { decision: 'SEMANTIC_DUPLICATE', matchIds: matches };
    }
    if (normalize(row.text).includes(rendered) || rendered.includes(normalize(row.text))) {
      matches.push(row.id);
      return { decision: 'ENTAILS_EXISTING', matchIds: matches };
    }
  }

  return { decision: 'NOT_DUPLICATE', matchIds: [] };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
