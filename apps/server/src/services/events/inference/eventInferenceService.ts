import { normalizeNameKey } from '../../../utils/nameNormalization';
import { resolvePlaceBoundary } from '../../lexical/places/placeBoundaryResolver';
import { splitMixedSpan } from '../../lexical/places/placeSpanSplitter';
import {
  inferContextualEvents,
  inferRelationshipEvents,
  isBareGenericEvent,
} from './contextualEventInference';
import { inferConflictEvents } from './conflictEventInference';
import { evaluateEventPromotionStatus, countAnchors, canPromoteToEventCard } from './eventPromotionGate';
import {
  buildEventContext,
  extractEvidencePhrases,
  hasProvenance,
} from './eventProvenanceService';
import { inferNamedEvents } from './namedEventInference';
import { inferRecurringEvents } from './recurringEventInference';
import { inferSchoolEvents, isSchoolDayTimeOnly } from './schoolEventInference';
import { inferSocialEvents } from './socialEventInference';
import { inferTravelEvents } from './travelEventInference';
import { inferWorkEvents } from './workEventInference';
import { extractTimeAnchors, isTimeOnlySpan, splitEventTimeTail } from './eventTimeAnchorResolver';
import { pickPrimaryPlace } from './eventPlaceAnchorResolver';
import { hasPluralGroupOnly } from './eventParticipantResolver';
import type {
  EventCandidate,
  EventInferenceInput,
  EventInferenceResult,
} from './eventInferenceTypes';

function attachMessageMeta(
  candidates: EventCandidate[],
  input: EventInferenceInput,
): EventCandidate[] {
  return candidates.map((c) => ({
    ...c,
    sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
    context: {
      ...buildEventContext(input.text, c.displayName, c.context),
      place: c.context.place ?? pickPrimaryPlace(input.text),
      timeHint: c.context.timeHint ?? extractTimeAnchors(input.text)[0],
    },
    evidencePhrases:
      c.evidencePhrases.length > 0
        ? c.evidencePhrases
        : extractEvidencePhrases(input.text, c.displayName),
  }));
}

function applyEventBoundarySplit(candidate: EventCandidate): EventCandidate[] {
  const { eventName, timeHint } = splitEventTimeTail(candidate.displayName);
  const boundary = resolvePlaceBoundary(eventName);
  const pieces = splitMixedSpan(boundary.text);
  const results: EventCandidate[] = [];

  for (const piece of pieces) {
    if (piece.splitReason === 'time_period_tail' || piece.splitReason === 'time_after_in') continue;
    if (piece.splitReason === 'person_before_time_in') continue;
    if (piece.splitReason === 'trimmed_suffix' && isTimeOnlySpan(piece.text)) continue;

    results.push({
      ...candidate,
      displayName: piece.text.trim(),
      context: {
        ...candidate.context,
        timeHint: timeHint ?? candidate.context.timeHint,
      },
    });
  }

  return results.length > 0 ? results : [candidate];
}

function dedupeEvents(candidates: EventCandidate[]): EventCandidate[] {
  const out: EventCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.displayName);
    const idx = out.findIndex((c) => normalizeNameKey(c.displayName) === key);
    if (idx >= 0) {
      const existing = out[idx];
      out[idx] = {
        ...existing,
        confidence: Math.max(existing.confidence, candidate.confidence),
        evidencePhrases: [...new Set([...existing.evidencePhrases, ...candidate.evidencePhrases])],
        sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...candidate.sourceMessageIds])],
        context: { ...existing.context, ...candidate.context },
        sensitive: existing.sensitive || candidate.sensitive,
        requiresReview: existing.requiresReview || candidate.requiresReview,
      };
    } else {
      out.push(candidate);
    }
  }
  return out;
}

function applyWrongDomainGuard(
  candidate: EventCandidate,
  knownDomains?: EventInferenceInput['knownDomains'],
): EventCandidate | null {
  const key = normalizeNameKey(candidate.displayName);
  const known = knownDomains?.[key];
  if (known && known !== 'event' && known !== 'place') {
    if (countAnchors(candidate) < 2) return null;
  }
  return candidate;
}

function hasMinimumAnchors(candidate: EventCandidate): boolean {
  return countAnchors(candidate) >= 1;
}

function finalizeCandidate(
  candidate: EventCandidate,
  input: EventInferenceInput,
): EventCandidate {
  const promotionStatus = evaluateEventPromotionStatus(candidate, {
    mentionCount: input.mentionCount,
    userConfirmed: input.userConfirmed,
    anchorCount: countAnchors(candidate),
  });
  return { ...candidate, promotionStatus };
}

export class EventInferenceService {
  inferFromMessage(input: EventInferenceInput): EventInferenceResult {
    const rejected: EventInferenceResult['rejected'] = [];
    const timeAnchors = extractTimeAnchors(input.text);

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }],
        timeAnchors,
      };
    }

    if (isSchoolDayTimeOnly(input.text) && !/\b(?:detention|fight|party|interview|trip)\b/i.test(input.text)) {
      return {
        accepted: [],
        rejected: [{ displayName: 'lunch break', reason: 'school_day_time_only' }],
        timeAnchors,
      };
    }

    const raw = [
      ...inferNamedEvents(input.text),
      ...inferContextualEvents(input.text),
      ...inferRelationshipEvents(input.text),
      ...inferConflictEvents(input.text),
      ...inferRecurringEvents(input.text),
      ...inferSchoolEvents(input.text),
      ...inferWorkEvents(input.text),
      ...inferTravelEvents(input.text),
      ...inferSocialEvents(input.text),
    ];

    const expanded: EventCandidate[] = [];
    for (const candidate of raw) {
      expanded.push(...applyEventBoundarySplit(candidate));
    }

    const withMeta = attachMessageMeta(expanded, input);
    const deduped = dedupeEvents(withMeta);
    const accepted: EventCandidate[] = [];

    for (const candidate of deduped) {
      if (isBareGenericEvent(candidate.displayName) || isTimeOnlySpan(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_generic_event' });
        continue;
      }

      if (/^(?:show|party|fight|meeting|interview)$/i.test(candidate.displayName) && countAnchors(candidate) < 2) {
        rejected.push({ displayName: candidate.displayName, reason: 'generic_without_anchors' });
        continue;
      }

      if (hasPluralGroupOnly(input.text) && candidate.context.people?.length === 0) {
        rejected.push({ displayName: candidate.displayName, reason: 'unnamed_group_only' });
        continue;
      }

      if (!hasMinimumAnchors(candidate)) {
        rejected.push({ displayName: candidate.displayName, reason: 'missing_anchors' });
        continue;
      }

      const guarded = applyWrongDomainGuard(candidate, input.knownDomains);
      if (!guarded) {
        rejected.push({ displayName: candidate.displayName, reason: 'wrong_domain' });
        continue;
      }

      if (!hasProvenance(guarded)) {
        rejected.push({ displayName: candidate.displayName, reason: 'missing_provenance' });
        continue;
      }

      accepted.push(finalizeCandidate(guarded, input));
    }

    return { accepted, rejected, timeAnchors };
  }

  canPromote(
    candidate: EventCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean },
  ): boolean {
    return canPromoteToEventCard(candidate, opts);
  }
}

export const eventInferenceService = new EventInferenceService();
