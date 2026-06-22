import { randomUUID } from 'crypto';

import { stitchEraPhrases } from './eraStitchingService';
import { inferActivityFromText, stitchRecurringPattern } from './recurringPatternStitcher';
import { extractTemporalExpressions, isStandaloneTimePhrase } from './temporalExpressionExtractor';
import { normalizeTemporalExpression, preservesFuzzyPrecision } from './temporalNormalizer';
import { findAttachmentTargets, pickNearestAttachment } from './timelineAttachmentService';
import {
  applyContradictionPolicy,
  detectTimelineContradictions,
} from './timelineContradictionService';
import { buildAnchorId, hasAnchorProvenance } from './timelineProvenanceService';
import type {
  TimelineAnchor,
  TimelineStitchingInput,
  TimelineStitchingResult,
} from './timelineStitchingTypes';

export function stitchTimelineFromMessage(
  input: TimelineStitchingInput,
  existingAnchors: Array<
    Pick<TimelineAnchor, 'id' | 'phrase' | 'attachedToLabel' | 'attachedToType' | 'normalizedTime'>
  > = [],
): TimelineStitchingResult {
  const { text, sourceMessageId, userId, messageTimestamp, attachmentCandidates = [] } = input;

  const anchors: TimelineAnchor[] = [];
  const rejectedStandaloneTime: Array<{ phrase: string; reason: string }> = [];
  const contradictions: TimelineStitchingResult['contradictions'] = [];
  const stitchLinks: TimelineStitchingResult['stitchLinks'] = [];

  const expressions = extractTemporalExpressions(text);
  const inferredTargets = findAttachmentTargets(text);
  const allCandidates = [...attachmentCandidates, ...inferredTargets];

  for (const expr of expressions) {
    if (expr.isStandaloneOnly && isStandaloneTimePhrase(expr.phrase)) {
      rejectedStandaloneTime.push({
        phrase: expr.phrase,
        reason: 'Time is metadata only — never a standalone book card',
      });
    }

    const target =
      pickNearestAttachment(expr.phrase, text, allCandidates) ??
      (expr.kind === 'era'
        ? { attachedToType: 'narrative_anchor' as const, attachedToLabel: expr.phrase, confidence: 0.7 }
        : undefined);

    if (!target) continue;

    const normalizedTime = normalizeTemporalExpression(expr, text, messageTimestamp);
    if (!preservesFuzzyPrecision(normalizedTime)) {
      normalizedTime.date = undefined;
      normalizedTime.startDate = undefined;
      normalizedTime.endDate = undefined;
    }

    let recurrence = undefined;
    if (expr.kind === 'recurring') {
      const activity = inferActivityFromText(text) ?? target.attachedToLabel;
      const stitched = stitchRecurringPattern(text, activity);
      if (stitched) recurrence = stitched.recurrence;
    }

    const draft: TimelineAnchor = {
      id: buildAnchorId(userId, expr.phrase, target.attachedToLabel),
      userId,
      attachedToType: target.attachedToType,
      attachedToId: target.attachedToId,
      attachedToLabel: target.attachedToLabel,
      phrase: expr.phrase,
      normalizedTime,
      recurrence,
      confidence: target.confidence,
      evidencePhrase: text.slice(0, 280),
      sourceMessageId,
      inferredNotConfirmed: true,
      requiresReview: false,
    };

    const conflicts = detectTimelineContradictions(draft, existingAnchors);
    contradictions.push(...conflicts);
    const finalAnchor = applyContradictionPolicy(draft, conflicts);

    if (!hasAnchorProvenance(finalAnchor)) continue;
    anchors.push(finalAnchor);
  }

  for (const era of stitchEraPhrases(text)) {
    for (const link of era.linkedTargets) {
      stitchLinks.push({
        fromLabel: era.eraLabel,
        toLabel: link.attachedToLabel,
        linkType: link.attachedToType,
      });

      const eraAnchor: TimelineAnchor = {
        id: buildAnchorId(userId, era.eraLabel, link.attachedToLabel),
        userId,
        attachedToType: link.attachedToType,
        attachedToId: link.attachedToId,
        attachedToLabel: link.attachedToLabel,
        phrase: era.eraLabel,
        normalizedTime: { precision: 'era', eraLabel: era.eraLabel },
        confidence: link.confidence,
        evidencePhrase: text.slice(0, 280),
        sourceMessageId,
        inferredNotConfirmed: true,
        requiresReview: false,
      };

      if (hasAnchorProvenance(eraAnchor)) {
        anchors.push(eraAnchor);
      }
    }
  }

  const activity = inferActivityFromText(text);
  if (activity) {
    const recurring = stitchRecurringPattern(text, activity);
    if (recurring) {
      const recurringAnchor: TimelineAnchor = {
        id: randomUUID(),
        userId,
        attachedToType: 'event',
        attachedToLabel: recurring.label,
        phrase: expressions.find((e) => e.kind === 'recurring')?.phrase ?? 'recurring',
        normalizedTime: { precision: 'recurring', relativeLabel: recurring.label },
        recurrence: recurring.recurrence,
        confidence: 0.86,
        evidencePhrase: text.slice(0, 280),
        sourceMessageId,
        inferredNotConfirmed: true,
        requiresReview: false,
      };
      if (hasAnchorProvenance(recurringAnchor)) anchors.push(recurringAnchor);
    }
  }

  return {
    anchors: dedupeAnchors(anchors),
    rejectedStandaloneTime,
    contradictions,
    stitchLinks,
  };
}

function dedupeAnchors(anchors: TimelineAnchor[]): TimelineAnchor[] {
  const seen = new Map<string, TimelineAnchor>();
  for (const a of anchors) {
    const key = `${a.attachedToType}:${a.attachedToLabel}:${a.phrase.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, a);
  }
  return [...seen.values()];
}

export function shouldCreateTimeBookCard(phrase: string): boolean {
  return !isStandaloneTimePhrase(phrase);
}
