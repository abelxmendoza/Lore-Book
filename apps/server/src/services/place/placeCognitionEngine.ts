import { resolveCognitionPlaceBoundary } from './placeBoundaryResolver';
import { resolvePlaceCanonical, isGenericPlaceNoun } from './placeCanonicalResolver';
import { classifyPlaceMentionContext } from './placeContextClassifier';
import { buildPlaceDescription } from './placeDescriptionBuilder';
import { buildPlaceDiagnostics } from './placeDiagnostics';
import { evaluatePlaceEligibility } from './placeEligibilityGate';
import { findExistingPlaceMatch, normalizePlaceTitle } from './placeNormalizer';
import { evidenceLooksGenerated, isPlaceSourceAllowed, isSyntheticNarrationSpan } from './placeSourcePolicy';
import { inferPlaceVisitSignals } from './placeVisitInference';
import type {
  PlaceCognitionInput,
  PlaceCognitionResult,
  PlaceDecision,
  PlaceEntityKind,
} from './placeTypes';

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.max(0.05, Math.min(0.98, value));
}

function hasSpatialMeaning(title: string, entityKind: PlaceEntityKind): boolean {
  if (entityKind === 'SYNTHETIC_NARRATION' || entityKind === 'FRAGMENT' || entityKind === 'NON_PLACE') {
    return false;
  }
  if (/^(?:next|because|when|user|assistant|the|a|an)$/i.test(title.trim())) return false;
  return title.trim().length >= 2;
}

export class PlaceCognitionEngine {
  evaluate(input: PlaceCognitionInput): PlaceCognitionResult {
    const rulesFired: string[] = [];
    const reasonsAccepted: string[] = [];
    const reasonsRejected: string[] = [];
    const originalSpan = normalizePlaceTitle(input.span);
    const evidenceText = (input.evidenceText ?? '').trim();
    const sourceType = input.sourceType ?? 'chat';

    // Layer 1 — synthetic narration
    if (isSyntheticNarrationSpan(originalSpan) || evidenceLooksGenerated(originalSpan)) {
      rulesFired.push('synthetic_narration_blacklist');
      return this.reject({
        originalSpan,
        canonicalTitle: originalSpan,
        entityKind: 'SYNTHETIC_NARRATION',
        rejectionReason: 'synthetic_narration',
        evidenceText,
        sourceType,
        proposedConfidence: 0.05,
        rulesFired,
        reasonsRejected: ['synthetic_narration'],
        reasonsAccepted,
      });
    }

    // Layer 2 — boundary
    const boundary = resolveCognitionPlaceBoundary(originalSpan);
    rulesFired.push(...boundary.fixes.map((fix) => `boundary:${fix}`));
    if (!boundary.clearBoundary || boundary.rejectionReason === 'fragment') {
      return this.reject({
        originalSpan,
        canonicalTitle: boundary.text || originalSpan,
        entityKind: 'FRAGMENT',
        rejectionReason: boundary.rejectionReason ?? 'fragment',
        evidenceText,
        sourceType,
        proposedConfidence: 0.1,
        rulesFired,
        reasonsRejected: ['boundary_leakage_or_fragment'],
        reasonsAccepted,
      });
    }

    // Layer 3 — canonical + kind
    const canonical = resolvePlaceCanonical(boundary.text, input.proposedType);
    rulesFired.push(...canonical.rulesFired.map((rule) => `canonical:${rule}`));
    let entityKind = canonical.entityKind;
    let subtype = canonical.subtype ?? input.proposedType;

    // Fix wrong private_residence on known nightlife venues.
    if (
      /^(?:catch\s+one|bad\s+dogg\s+compound)$/i.test(canonical.canonicalTitle)
      && /private_residence|house|home/i.test(subtype ?? '')
    ) {
      subtype = /catch\s+one/i.test(canonical.canonicalTitle) ? 'nightclub' : 'event_space';
      rulesFired.push('subtype_corrected_known_venue');
      reasonsAccepted.push('subtype_corrected');
    }

    if (isGenericPlaceNoun(canonical.canonicalTitle)) {
      entityKind = 'GENERIC_REFERENCE';
    }

    const sourceAllowed = isPlaceSourceAllowed({ sourceType, userConfirmed: input.userConfirmed });
    const spatialMeaning = hasSpatialMeaning(canonical.canonicalTitle, entityKind);
    const syntheticNarration = entityKind === 'SYNTHETIC_NARRATION';
    const notMerelyDescriptive = !/^(?:vibes|scene|energy|mood)\b/i.test(canonical.canonicalTitle)
      && !/\bvibes$/i.test(canonical.canonicalTitle);

    const eligibility = evaluatePlaceEligibility({
      entityKind,
      clearBoundary: boundary.clearBoundary,
      sourceAllowed,
      spatialMeaning,
      notMerelyDescriptive,
      syntheticNarration,
    });
    rulesFired.push(...eligibility.reasons.map((reason) => `eligibility:${reason}`));

    const mentionContext = classifyPlaceMentionContext(
      canonical.canonicalTitle,
      evidenceText,
      [originalSpan, boundary.text, ...canonical.aliases],
    );
    const visitInference = inferPlaceVisitSignals(canonical.canonicalTitle, evidenceText, {
      source: sourceType,
    });
    // Prefer education/work context over raw presence when the classifier says so.
    if (mentionContext === 'ATTENDED' || mentionContext === 'WORKED_AT' || mentionContext === 'REFERENCED') {
      visitInference.userVisited = false;
      visitInference.visitCount = 0;
      visitInference.context = mentionContext;
      if (mentionContext === 'ATTENDED') visitInference.attendanceCount = Math.max(1, visitInference.attendanceCount);
    }
    rulesFired.push(`context:${mentionContext}`);

    const existing = findExistingPlaceMatch(
      canonical.canonicalTitle,
      canonical.aliases,
      input.knownPlaceNames,
    );

    const description = buildPlaceDescription({
      canonicalTitle: canonical.canonicalTitle,
      subtype,
      evidenceText,
      mentionContext,
    });

    let decision: PlaceDecision = 'ACCEPT';
    let status: PlaceCognitionResult['status'] = 'new';
    let rejectionReason: string | undefined;
    let confidence = clampConfidence(input.proposedConfidence ?? 0.7);

    if (entityKind === 'EVENT' || entityKind === 'EVENT_SERIES') {
      decision = 'ROUTE_EVENT';
      status = 'rejected';
      rejectionReason = entityKind === 'EVENT_SERIES' ? 'event_series' : 'event';
      confidence = Math.min(confidence, 0.35);
      reasonsRejected.push(rejectionReason);
    } else if (entityKind === 'GENERIC_REFERENCE') {
      decision = 'HOLD_GENERIC';
      status = 'needs_review';
      rejectionReason = 'generic_location';
      confidence = Math.min(confidence, 0.4);
      reasonsRejected.push('generic_location_hold');
    } else if (!eligibility.eligible) {
      decision = 'REJECT';
      status = 'rejected';
      rejectionReason = eligibility.reasons[0] ?? 'ineligible';
      confidence = Math.min(confidence, 0.2);
      reasonsRejected.push(...eligibility.reasons);
    } else if (existing) {
      decision = 'MERGE_EXISTING';
      status = 'known';
      confidence = Math.max(confidence, 0.85);
      reasonsAccepted.push('canonical_match_existing');
    } else {
      decision = 'ACCEPT';
      status = 'new';
      reasonsAccepted.push('eligible_persistent_place');
      // Education references without user visit stay review-light, not visit-inflating.
      if (mentionContext === 'ATTENDED' || mentionContext === 'REFERENCED') {
        status = 'needs_review';
        reasonsAccepted.push('third_party_or_education_reference');
      }
    }

    // Never allow high confidence on boundary-fixed or narration-adjacent spans.
    if (boundary.fixes.length > 0 && decision !== 'MERGE_EXISTING') {
      confidence = Math.min(confidence, 0.75);
    }
    if (decision === 'HOLD_GENERIC' || decision === 'REJECT') {
      confidence = Math.min(confidence, decision === 'REJECT' ? 0.2 : 0.4);
    }

    const diagnostics = buildPlaceDiagnostics({
      originalSpan,
      canonicalTitle: canonical.canonicalTitle,
      entityKind,
      decision,
      subtype,
      mentionContext,
      visitInference,
      eligibility,
      description,
      reasonsAccepted,
      reasonsRejected,
      rulesFired,
      confidence,
    });

    return {
      decision,
      canonicalTitle: canonical.canonicalTitle,
      aliases: canonical.aliases,
      subtype,
      entityKind,
      mentionContext,
      visitInference,
      description,
      confidence,
      status,
      matchExistingName: existing,
      rejectionReason,
      diagnostics,
    };
  }

  private reject(input: {
    originalSpan: string;
    canonicalTitle: string;
    entityKind: PlaceEntityKind;
    rejectionReason: string;
    evidenceText: string;
    sourceType: PlaceCognitionInput['sourceType'];
    proposedConfidence: number;
    rulesFired: string[];
    reasonsRejected: string[];
    reasonsAccepted: string[];
  }): PlaceCognitionResult {
    const visitInference = inferPlaceVisitSignals(input.canonicalTitle, input.evidenceText, {
      source: input.sourceType,
    });
    const mentionContext = classifyPlaceMentionContext(input.canonicalTitle, input.evidenceText);
    const eligibility = evaluatePlaceEligibility({
      entityKind: input.entityKind,
      clearBoundary: false,
      sourceAllowed: isPlaceSourceAllowed({ sourceType: input.sourceType }),
      spatialMeaning: false,
      notMerelyDescriptive: false,
      syntheticNarration: input.entityKind === 'SYNTHETIC_NARRATION',
    });
    const confidence = clampConfidence(input.proposedConfidence);
    const diagnostics = buildPlaceDiagnostics({
      originalSpan: input.originalSpan,
      canonicalTitle: input.canonicalTitle,
      entityKind: input.entityKind,
      decision: 'REJECT',
      mentionContext,
      visitInference,
      eligibility,
      reasonsAccepted: input.reasonsAccepted,
      reasonsRejected: input.reasonsRejected,
      rulesFired: input.rulesFired,
      confidence,
    });
    return {
      decision: 'REJECT',
      canonicalTitle: input.canonicalTitle,
      aliases: [],
      entityKind: input.entityKind,
      mentionContext,
      visitInference,
      confidence,
      status: 'rejected',
      rejectionReason: input.rejectionReason,
      diagnostics,
    };
  }
}

export const placeCognitionEngine = new PlaceCognitionEngine();
