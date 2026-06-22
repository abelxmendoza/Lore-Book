import { classifyOrigin, classifySourceType } from './claimOriginClassifier';
import { scoreConfidence } from './provenanceConfidenceScorer';
import type {
  ClaimCandidate,
  EvidenceBundle,
  ProvenanceClaimType,
  ProvenanceInferenceInput,
  ProvenanceOrigin,
  ProvenanceSourceType,
  ProvenanceTruthState,
} from './provenanceInferenceTypes';
import { extractBestQuoteForClaim, extractSourceQuote } from './sourceQuoteExtractor';

function newBundleId(): string {
  return crypto.randomUUID();
}

function resolveTruthState(
  origin: ProvenanceOrigin,
  sourceType: ProvenanceSourceType,
  requiresReview: boolean,
  userConfirmed?: boolean,
): ProvenanceTruthState {
  if (origin === 'assistant_generated') return requiresReview ? 'review' : 'candidate';
  if (requiresReview) return 'review';
  if (userConfirmed || origin === 'user_confirmed' || origin === 'user_corrected') {
    return sourceType === 'manual_edit' ? 'confirmed' : 'confirmed';
  }
  if (origin === 'explicit_user_statement') return 'candidate';
  if (origin === 'system_inferred' || origin === 'implicit_user_statement') return 'candidate';
  return 'candidate';
}

export function buildEvidenceBundle(params: {
  claimText: string;
  claimType: ProvenanceClaimType;
  sourceQuote: string;
  origin: ProvenanceOrigin;
  sourceType: ProvenanceSourceType;
  sourceMessageId?: string;
  sourceThreadId?: string;
  confidence: number;
  truthState?: ProvenanceTruthState;
  seenAt?: string;
  correctedFromId?: string;
  extractedSpanIds?: string[];
  parserFrameIds?: string[];
}): EvidenceBundle {
  return {
    id: newBundleId(),
    sourceType: params.sourceType,
    sourceMessageId: params.sourceMessageId,
    sourceThreadId: params.sourceThreadId,
    sourceQuote: params.sourceQuote.trim(),
    extractedSpanIds: params.extractedSpanIds,
    parserFrameIds: params.parserFrameIds,
    claimText: params.claimText.trim(),
    claimType: params.claimType,
    origin: params.origin,
    confidence: params.confidence,
    truthState: params.truthState ?? 'candidate',
    createdAt: params.seenAt ?? new Date().toISOString(),
    correctedFromId: params.correctedFromId,
  };
}

export function buildBundleFromCandidate(
  candidate: ClaimCandidate,
  input: ProvenanceInferenceInput,
  opts: { requiresReview?: boolean; mentionCount?: number } = {},
): EvidenceBundle {
  const authorRole = input.authorRole ?? 'user';
  const sourceType = classifySourceType(authorRole, input.sourceType);
  const origin = candidate.origin;
  const confidence = scoreConfidence(origin, sourceType, {
    mentionCount: opts.mentionCount,
    userConfirmed: input.userConfirmed,
  });
  const requiresReview = opts.requiresReview ?? false;

  return buildEvidenceBundle({
    claimText: candidate.claimText,
    claimType: candidate.claimType,
    sourceQuote: candidate.sourceQuote,
    origin,
    sourceType,
    sourceMessageId: input.sourceMessageId,
    sourceThreadId: input.sourceThreadId,
    confidence: Math.min(candidate.confidence, confidence),
    truthState: resolveTruthState(origin, sourceType, requiresReview, input.userConfirmed),
    seenAt: input.seenAt,
  });
}

export function buildManualEditBundle(input: ProvenanceInferenceInput): EvidenceBundle | null {
  const edit = input.manualEdit;
  if (!edit?.claimText.trim()) return null;

  const sourceType: ProvenanceSourceType = 'manual_edit';
  const origin: ProvenanceOrigin = edit.confirmed ? 'user_confirmed' : 'user_corrected';
  const quote = edit.sourceQuote?.trim() || edit.claimText.trim();

  return buildEvidenceBundle({
    claimText: edit.claimText,
    claimType: edit.claimType,
    sourceQuote: quote,
    origin,
    sourceType,
    sourceMessageId: input.sourceMessageId,
    sourceThreadId: input.sourceThreadId,
    confidence: scoreConfidence(origin, sourceType, { userConfirmed: edit.confirmed ?? true }),
    truthState: 'confirmed',
    seenAt: input.seenAt,
  });
}

export function buildFromExplicitStatement(
  text: string,
  input: ProvenanceInferenceInput,
): ClaimCandidate[] {
  const out: ClaimCandidate[] = [];

  const bestFriend = text.match(
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+my\s+best\s+friend/i,
  );
  if (bestFriend) {
    const name = bestFriend[1].trim();
    out.push({
      claimText: `${name} is my best friend`,
      claimType: 'relationship',
      origin: 'explicit_user_statement',
      sourceQuote: extractBestQuoteForClaim(text, name),
      confidence: 0.92,
      inferredSubject: name,
    });
  }

  const notBestFriend = text.match(
    /([A-Z][a-z]+)\s+(?:and I\s+)?(?:is|are)\s+not\s+my\s+best\s+friend/i,
  );
  if (notBestFriend) {
    const name = notBestFriend[1].trim();
    out.push({
      claimText: `${name} is not my best friend`,
      claimType: 'relationship',
      origin: 'explicit_user_statement',
      sourceQuote: extractBestQuoteForClaim(text, name),
      confidence: 0.9,
      inferredSubject: name,
    });
  }

  const workedAt = text.match(/\bI\s+worked\s+at\s+([A-Z][A-Za-z0-9\s'-]{2,60})/i);
  if (workedAt) {
    const org = workedAt[1].trim().replace(/\.$/, '');
    out.push({
      claimText: `I worked at ${org}`,
      claimType: 'entity',
      origin: 'explicit_user_statement',
      sourceQuote: extractBestQuoteForClaim(text, org),
      confidence: 0.9,
      inferredSubject: org,
    });
  }

  return out;
}

export function buildFromInference(text: string, input: ProvenanceInferenceInput): ClaimCandidate[] {
  const out: ClaimCandidate[] = [];

  const schoolmate = text.match(
    /\b(?:we|I)\s+went\s+to\s+(.+?)\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
  );
  if (schoolmate) {
    const school = schoolmate[1].trim();
    const person = schoolmate[2]?.trim();
    if (person) {
      out.push({
        claimText: `${person} is a schoolmate (attended ${school})`,
        claimType: 'relationship',
        origin: 'system_inferred',
        sourceQuote: extractSourceQuote(text, school),
        confidence: 0.68,
        inferredSubject: person,
      });
    }
  }

  return out;
}

export function buildFromAssistant(text: string, input: ProvenanceInferenceInput): ClaimCandidate[] {
  const out: ClaimCandidate[] = [];
  const important = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+was\s+important\s+to\s+you\b/i,
  );
  if (important) {
    const name = important[1].trim();
    out.push({
      claimText: `${name} was important to the user`,
      claimType: 'inference',
      origin: 'assistant_generated',
      sourceQuote: extractBestQuoteForClaim(text, name),
      confidence: 0.45,
      inferredSubject: name,
    });
  }
  return out;
}

export function buildFromCorrection(text: string, input: ProvenanceInferenceInput): ClaimCandidate[] {
  const out: ClaimCandidate[] = [];
  const nameFix = text.match(
    /\b(?:actually|correction:?)\s+(?:(?:his|her|their)|[A-Z][A-Za-z]*(?:['’][A-Za-z]+)?(?:\s+[A-Z][A-Za-z]+)*)\s+name\s+is\s+(.+?)[.!?]?\s*$/i,
  );
  if (nameFix) {
    const correctedName = nameFix[1].trim();
    out.push({
      claimText: `Person name is ${correctedName}`,
      claimType: 'identity',
      origin: 'user_corrected',
      sourceQuote: extractSourceQuote(text, correctedName),
      confidence: 0.98,
      inferredSubject: correctedName,
    });
  }
  return out;
}

export function extractClaimCandidates(
  text: string,
  input: ProvenanceInferenceInput,
): ClaimCandidate[] {
  const authorRole = input.authorRole ?? 'user';

  if (input.sourceType === 'manual_edit' && input.manualEdit) {
    return [];
  }

  if (authorRole === 'assistant') {
    return buildFromAssistant(text, input);
  }

  const correctionFirst = isCorrectionMessage(text);
  if (correctionFirst) {
    return buildFromCorrection(text, input);
  }

  return [
    ...buildFromExplicitStatement(text, input),
    ...buildFromInference(text, input),
  ];
}

function isCorrectionMessage(text: string): boolean {
  return /\b(?:actually|correction|I mean)\b/i.test(text);
}
