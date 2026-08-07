import type {
  KnowledgeAssertionInput,
  ReportedClaimPair,
  ReportedClaimPairInput,
} from './types';

export type AssertionValidationResult =
  | { valid: true; requiresHumanReview: boolean }
  | { valid: false; errors: string[]; requiresHumanReview: boolean };

const HIGH_RISK_STANCES = new Set([
  'system_hypothesis',
  'established_knowledge',
]);

export function validateKnowledgeAssertion(
  input: KnowledgeAssertionInput,
): AssertionValidationResult {
  const errors: string[] = [];

  if (!input.subject.label.trim()) errors.push('subject.label is required');
  if (!input.subject.kind.trim()) errors.push('subject.kind is required');
  if (!input.predicate.trim()) errors.push('predicate is required');
  if (input.objectValue === undefined) errors.push('objectValue must be explicit');
  if (input.certainty != null && (input.certainty < 0 || input.certainty > 1)) {
    errors.push('certainty must be between 0 and 1');
  }
  if (input.validFrom && input.validTo && input.validFrom > input.validTo) {
    errors.push('validFrom cannot be after validTo');
  }

  const requiresHumanReview =
    (
      (input.sensitivity === 'high_impact' || input.sensitivity === 'restricted')
      && input.derivationMethod !== 'user_confirmed'
    )
    || input.epistemicStance === 'system_hypothesis'
    || (
      input.epistemicStance === 'established_knowledge'
      && input.assertedBy.kind === 'lorebook'
    );

  if (
    (input.sensitivity === 'high_impact' || input.sensitivity === 'restricted')
    && input.status === 'active'
    && input.derivationMethod !== 'user_confirmed'
  ) {
    errors.push('high-impact assertions cannot become active without user confirmation');
  }

  if (
    input.epistemicStance === 'direct_observation'
    && input.derivationMethod === 'inferred'
  ) {
    errors.push('an inferred assertion cannot be labeled as a direct observation');
  }

  if (
    HIGH_RISK_STANCES.has(input.epistemicStance)
    && input.assertedBy.kind === 'unknown'
  ) {
    errors.push('hypotheses and established knowledge require a known author');
  }

  return errors.length > 0
    ? { valid: false, errors, requiresHumanReview }
    : { valid: true, requiresHumanReview };
}

/**
 * Preserve the difference between evidence that somebody made a statement and
 * evidence that the statement's underlying contents occurred.
 *
 * The uploaded artifact supports only `sourceStatement`. `underlyingClaim`
 * remains a proposed, reported claim until separately reviewed/corroborated.
 */
export function buildReportedClaimPair(input: ReportedClaimPairInput): ReportedClaimPair {
  const sensitivity = input.sensitivity ?? 'sensitive';

  return {
    sourceStatement: {
      subject: {
        kind: input.reporter.kind,
        id: input.reporter.id,
        label: input.reporter.label,
      },
      predicate: 'stated',
      objectValue: {
        subject: input.subject,
        predicate: input.predicate,
        objectValue: input.objectValue,
      },
      assertionClass: 'statement',
      domain: input.domain,
      epistemicStance: 'reported_statement',
      assertedBy: input.reporter,
      derivationMethod: 'quoted',
      polarity: 'affirmed',
      status: 'proposed',
      sensitivity,
      occurredAt: input.occurredAt ?? null,
      metadata: {
        kernelRole: 'source_statement',
        doesNotEstablishUnderlyingOccurrence: true,
      },
    },
    underlyingClaim: {
      subject: input.subject,
      predicate: input.predicate,
      objectValue: input.objectValue,
      assertionClass: 'statement',
      domain: input.domain,
      epistemicStance: 'reported_statement',
      assertedBy: input.reporter,
      derivationMethod: 'extracted',
      polarity: 'uncertain',
      certainty: null,
      status: 'proposed',
      sensitivity,
      occurredAt: input.occurredAt ?? null,
      metadata: {
        kernelRole: 'underlying_reported_claim',
        requiresIndependentSupport: true,
      },
    },
    sourceEvidence: {
      evidenceKind: input.evidenceKind,
      evidenceId: input.evidenceId,
      relation: 'supports',
      weight: 1,
      excerpt: input.evidenceExcerpt ?? null,
      linkedBy: 'system',
      rationale: 'The artifact supports that the attributed statement was made, not that its contents occurred.',
    },
  };
}
