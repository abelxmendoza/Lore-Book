import type { EvidenceBundle, ProvenanceOrigin } from './provenanceInferenceTypes';

const SENSITIVE_PATTERNS = [
  /\b(?:family|mother|father|brother|sister|parent|child|son|daughter)\b/i,
  /\b(?:boyfriend|girlfriend|husband|wife|partner|romantic|dating|ex-)\b/i,
  /\b(?:fight|conflict|argument|cheated|betrayed|divorce)\b/i,
  /\b(?:drunk|intoxicated|tequila|vodka|whiskey|weed|cocaine|high)\b/i,
  /\b(?:diagnosis|medication|therapy|disorder|hospital|surgery|depression|anxiety)\b/i,
  /\b(?:salary|debt|bankruptcy|rent|mortgage|finances?|bank account)\b/i,
  /\b(?:gender|sexuality|trans|identity)\b/i,
  /\b(?:live at|lives at|address|apartment|home is)\b/i,
];

export function hasRequiredQuote(bundle: EvidenceBundle): boolean {
  return Boolean(bundle.sourceQuote?.trim());
}

export function canBecomeConfirmed(bundle: EvidenceBundle): boolean {
  if (bundle.origin === 'assistant_generated') return false;
  if (!hasRequiredQuote(bundle)) return false;
  if (bundle.truthState === 'contradicted' || bundle.truthState === 'rejected') return false;
  return true;
}

export function requiresSensitiveReview(claimText: string, sourceQuote: string): boolean {
  const blob = `${claimText} ${sourceQuote}`;
  return SENSITIVE_PATTERNS.some((re) => re.test(blob));
}

/** Provenance is metadata — never a LoreBook card. */
export function shouldCreateProvenanceCard(_bundle: EvidenceBundle): boolean {
  return false;
}

export function isDurableCandidate(bundle: EvidenceBundle): boolean {
  if (shouldCreateProvenanceCard(bundle)) return false;
  if (!hasRequiredQuote(bundle)) return false;
  if (bundle.origin === 'assistant_generated' && bundle.truthState === 'confirmed') return false;
  return bundle.truthState !== 'rejected';
}

export function rejectReason(bundle: EvidenceBundle): string | null {
  if (shouldCreateProvenanceCard(bundle)) return 'provenance_not_book_card';
  if (!hasRequiredQuote(bundle)) return 'missing_source_quote';
  if (bundle.origin === 'assistant_generated' && bundle.truthState === 'confirmed') {
    return 'assistant_cannot_be_confirmed_truth';
  }
  if (!bundle.claimText.trim()) return 'missing_claim_text';
  return null;
}

export function applySensitiveReviewGate(bundle: EvidenceBundle): EvidenceBundle {
  if (!requiresSensitiveReview(bundle.claimText, bundle.sourceQuote)) return bundle;
  return {
    ...bundle,
    truthState: bundle.truthState === 'confirmed' ? 'review' : 'review',
    confidence: Math.min(bundle.confidence, 0.75),
  };
}

export function capAssistantTruthState(bundle: EvidenceBundle): EvidenceBundle {
  if (bundle.origin !== 'assistant_generated') return bundle;
  return {
    ...bundle,
    truthState: bundle.truthState === 'confirmed' ? 'review' : bundle.truthState,
    confidence: Math.min(bundle.confidence, 0.55),
  };
}

export function hasProvenance(bundle: EvidenceBundle): boolean {
  return (
    hasRequiredQuote(bundle) &&
    Boolean(bundle.claimText.trim()) &&
    Boolean(bundle.sourceMessageId?.trim() || bundle.sourceType === 'manual_edit')
  );
}

export function maxConfirmableOrigin(origin: ProvenanceOrigin): 'candidate' | 'review' | 'confirmed' {
  if (origin === 'assistant_generated') return 'review';
  if (origin === 'system_inferred') return 'candidate';
  return 'confirmed';
}
