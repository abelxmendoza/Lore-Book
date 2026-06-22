import { guardPlaceCandidate } from '../../lexical/places/placeTypeGuard';
import { resolvePlaceBoundary } from '../../lexical/places/placeBoundaryResolver';
import { splitMixedSpan } from '../../lexical/places/placeSpanSplitter';
import { isOrphanPossessiveResidence } from '../../lexical/places/privateResidenceGuard';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import { evaluateLocationPromotionStatus } from './locationPromotionGate';
import {
  buildLocationContext,
  extractEvidencePhrases,
} from './locationProvenanceService';
import { inferNamedPlaces, isBareGenericPlace, isKnownCountryToken } from './namedPlaceInference';
import { inferPrivateResidences, isBrokenResidenceSpan } from './privateResidenceInference';
import { isBareSchoolLabel, inferSchoolPlaces } from './schoolPlaceInference';
import { inferVenuePlaces } from './venueInference';
import {
  filterEmployerOrganizations,
  inferWorkplaceLocations,
  looksLikeEmployerOrg,
} from './workplaceLocationInference';
import {
  detectRelativePhrases,
  isRelativeOnlySpan,
  resolveRelativeAttachments,
} from './relativeLocationResolver';
import type {
  LocationCandidate,
  LocationInferenceInput,
  LocationInferenceResult,
  LocationType,
} from './locationInferenceTypes';

const LOCATION_PRIORITY: Record<LocationType, number> = {
  private_residence: 95,
  family_home: 94,
  deployment_site: 90,
  worksite: 88,
  university: 85,
  campus: 84,
  school: 83,
  music_venue: 80,
  event_space: 79,
  store: 78,
  restaurant: 77,
  bar: 76,
  workplace: 75,
  city: 70,
  neighborhood: 68,
  state: 65,
  country: 64,
  street: 60,
  gym: 55,
  dojo: 55,
  relative_location: 20,
  unknown_location: 10,
};

function attachMessageMeta(
  candidates: LocationCandidate[],
  input: LocationInferenceInput,
): LocationCandidate[] {
  return candidates.map((c) => ({
    ...c,
    sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
    context: {
      ...buildLocationContext(input.text, c.displayName),
      ...c.context,
    },
    evidencePhrases:
      c.evidencePhrases.length > 0
        ? c.evidencePhrases
        : extractEvidencePhrases(input.text, c.displayName),
  }));
}

function applyBoundaryAndSplit(candidate: LocationCandidate, text: string): LocationCandidate[] {
  const boundary = resolvePlaceBoundary(candidate.displayName);
  const pieces = splitMixedSpan(boundary.text);
  const results: LocationCandidate[] = [];

  for (const piece of pieces) {
    const trimmed = piece.text.trim();
    if (!trimmed || isBrokenResidenceSpan(trimmed)) continue;

    if (piece.splitReason === 'person_before_time_in' || piece.splitReason === 'time_after_in') {
      continue;
    }
    if (piece.splitReason === 'time_period_tail' || piece.splitReason === 'trimmed_suffix') {
      continue;
    }
    if (piece.splitReason === 'coordination_and' && !isLikelyPlacePiece(trimmed, text)) {
      continue;
    }

    results.push({
      ...candidate,
      displayName: trimmed,
      evidencePhrases: [...candidate.evidencePhrases, piece.splitReason],
    });
  }

  return results.length > 0 ? results : [candidate];
}

function isLikelyPlacePiece(piece: string, fullText: string): boolean {
  const key = normalizeNameKey(piece);
  if (key === 'la' || key === 'los angeles') return true;
  if (/^[A-Z]{2,5}$/.test(piece.trim())) return true;
  if (/\b(house|compound|walmart|csuf|club|denny|school|university)\b/i.test(piece)) return true;
  const escaped = piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b(?:at|in|from|near)\\s+${escaped}\\b`, 'i').test(fullText)) return true;
  return false;
}

function applyWrongDomainGuard(
  candidate: LocationCandidate,
  text: string,
  knownDomains?: LocationInferenceInput['knownDomains'],
): LocationCandidate | null {
  const key = normalizeNameKey(candidate.displayName);
  const known = knownDomains?.[key];
  if (known && known !== 'place') return null;

  if (
    candidate.locationType === 'country' ||
    candidate.locationType === 'school' ||
    candidate.locationType === 'university' ||
    candidate.locationType === 'private_residence' ||
    candidate.locationType === 'family_home' ||
    candidate.locationType === 'deployment_site' ||
    isKnownCountryToken(candidate.displayName)
  ) {
    if (looksLikeEmployerOrg(candidate.displayName) && !/denny|hollywood/i.test(candidate.displayName)) {
      return null;
    }
    return candidate;
  }

  const provenance = candidate.evidencePhrases.join(' ') || text;
  const guard = guardPlaceCandidate(candidate.displayName, provenance);
  if (!guard.allowed) {
    if (known === 'place') {
      // LoreBook history explicitly marks this span as a place.
    } else {
      return null;
    }
  }

  if (looksLikeEmployerOrg(candidate.displayName) && !/denny|hollywood/i.test(candidate.displayName)) {
    return null;
  }

  return candidate;
}

function dedupeCandidates(candidates: LocationCandidate[]): LocationCandidate[] {
  const out: LocationCandidate[] = [];

  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.displayName);
    const idx = out.findIndex((c) => normalizeNameKey(c.displayName) === key);

    if (idx >= 0) {
      const existing = out[idx];
      const existingScore = LOCATION_PRIORITY[existing.locationType] ?? 0;
      const incomingScore = LOCATION_PRIORITY[candidate.locationType] ?? 0;
      const preferred = incomingScore > existingScore ? candidate : existing;
      const other = preferred === candidate ? existing : candidate;
      out[idx] = {
        ...preferred,
        confidence: Math.max(preferred.confidence, other.confidence),
        evidencePhrases: [...new Set([...preferred.evidencePhrases, ...other.evidencePhrases])],
        sourceMessageIds: [...new Set([...preferred.sourceMessageIds, ...other.sourceMessageIds])],
        context: { ...other.context, ...preferred.context },
      };
    } else {
      out.push(candidate);
    }
  }

  return out;
}

function finalizeCandidate(
  candidate: LocationCandidate,
  input: LocationInferenceInput,
): LocationCandidate {
  const knownFromHistory = input.knownPlaces
    ? [...input.knownPlaces].some((p) => normalizeNameKey(p) === normalizeNameKey(candidate.displayName))
    : false;

  const promotionStatus = evaluateLocationPromotionStatus(candidate, {
    mentionCount: input.mentionCount,
    userConfirmed: input.userConfirmed,
    knownFromHistory,
  });

  return { ...candidate, promotionStatus };
}

function isTimeOnlySpan(name: string): boolean {
  return /^(?:last\s+night|yesterday|today|tonight|(?:a\s+)?(?:few|couple)\s+weeks?(?:\s+ago)?)$/i.test(
    name.trim(),
  );
}

export class LocationInferenceService {
  inferFromMessage(input: LocationInferenceInput): LocationInferenceResult {
    const rejected: LocationInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        relativeAttachments: [],
        rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }],
      };
    }

    const raw = [
      ...inferPrivateResidences(input.text),
      ...inferSchoolPlaces(input.text),
      ...inferWorkplaceLocations(input.text),
      ...inferVenuePlaces(input.text),
      ...inferNamedPlaces(input.text),
    ];

    const expanded: LocationCandidate[] = [];
    for (const candidate of raw) {
      expanded.push(...applyBoundaryAndSplit(candidate, input.text));
    }

    const withMeta = attachMessageMeta(expanded, input);
    let deduped = dedupeCandidates(withMeta);
    deduped = filterEmployerOrganizations(deduped, input.text);

    const accepted: LocationCandidate[] = [];

    for (const candidate of deduped) {
      if (isBareGenericPlace(candidate.displayName) || isRelativeOnlySpan(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_generic_place' });
        continue;
      }

      if (isBareSchoolLabel(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_school_label' });
        continue;
      }

      if (isTimeOnlySpan(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'time_only' });
        continue;
      }

      if (isBrokenResidenceSpan(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'broken_residence_span' });
        continue;
      }

      const guarded = applyWrongDomainGuard(candidate, input.text, input.knownDomains);
      if (!guarded) {
        rejected.push({ displayName: candidate.displayName, reason: 'wrong_domain' });
        continue;
      }

      accepted.push(finalizeCandidate(guarded, input));
    }

    const relativeAttachments = resolveRelativeAttachments(
      input.text,
      accepted,
      input.sourceMessageId,
    );

    if (detectRelativePhrases(input.text).length > 0) {
      for (const phrase of detectRelativePhrases(input.text)) {
        if (!relativeAttachments.some((a) => a.phrase === phrase)) {
          relativeAttachments.push({ phrase, sourceMessageId: input.sourceMessageId });
        }
      }
    }

    return { accepted, relativeAttachments, rejected };
  }

  canPromote(
    candidate: LocationCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean; knownFromHistory?: boolean },
  ): boolean {
    const status = evaluateLocationPromotionStatus(candidate, opts);
    if (opts.userConfirmed) return true;
    if (candidate.locationType === 'relative_location') return false;
    if (candidate.requiresReview && !opts.userConfirmed && (opts.mentionCount ?? 0) < 2) return false;
    return status === 'suggested_location' || status === 'confirmed_location';
  }
}

export const locationInferenceService = new LocationInferenceService();
