/**
 * Rank and select at most one return point for quiet surface.
 */

import { detectOpenThreads } from './detectOpenThreads';
import type {
  InteractionRecord,
  RejectedReturnPoint,
  RecommendedSurface,
  ReturnPoint,
  ReturnPointSelectionInput,
  ReturnPointSelectionResult,
  ReturnPointTrace,
  SensitivityClass,
} from './types';

const MAX_AGE_DAYS = 90;
const DISMISS_EXPIRE = 2;
const SURFACE_DECAY = 3;

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function getInteraction(
  map: Map<string, InteractionRecord>,
  id: string,
): InteractionRecord {
  return (
    map.get(id) ?? {
      returnPointId: id,
      surfaceCount: 0,
      dismissCount: 0,
      continuedCount: 0,
      resolvedCount: 0,
    }
  );
}

function sensitiveAllowed(
  sensitivity: SensitivityClass,
  input: ReturnPointSelectionInput,
): { allowed: boolean; surface: RecommendedSurface } {
  if (sensitivity === 'none') {
    return { allowed: true, surface: 'resume_prompt' };
  }
  if (input.allowSensitiveCategories?.includes(sensitivity)) {
    return { allowed: true, surface: 'quiet_context' };
  }
  // Same-thread resume: quiet_context only, never unsolicited greeting
  if (input.resumingSameThread && input.threadId) {
    return { allowed: true, surface: 'chat_only' };
  }
  return { allowed: false, surface: 'do_not_surface' };
}

function contextMismatch(p: ReturnPoint, contextHint?: string): boolean {
  if (!contextHint) return false;
  const c = contextHint.toLowerCase();
  // Vocabulary / definition questions: don't surface product or career threads
  if (/\b(define|meaning|what does|vocabulary|forlorn)\b/i.test(c)) {
    return true;
  }
  // Lorebook/dev thread only when context is product
  if (/staging|memory quality|lorebook/i.test(p.evidenceText) && !/lorebook|staging|product|continuity/i.test(c)) {
    // If context is empty/chat default, still allow product return points
    if (c.includes('unrelated') || c.includes('vocab')) return true;
  }
  return false;
}

export function selectReturnPoint(input: ReturnPointSelectionInput): ReturnPointSelectionResult {
  const now = input.now ?? new Date().toISOString();
  const interactions = new Map(
    (input.interactions ?? []).map((i) => [i.returnPointId, i]),
  );

  const detected = detectOpenThreads(input.evidence, now);
  const rejected: RejectedReturnPoint[] = [];
  const eligible: ReturnPoint[] = [];

  const unresolvedEvidence: string[] = [];
  const resolutionEvidence: string[] = [];

  for (const p of detected) {
    const ix = getInteraction(interactions, p.id);

    // Forced user lifecycle
    if (ix.forcedState === 'RESOLVED' || ix.resolvedCount > 0) {
      p.state = 'RESOLVED';
      p.expirationReason = 'user_resolved';
    }
    if (ix.forcedState === 'DISMISSED' || ix.dismissCount >= DISMISS_EXPIRE) {
      p.state = ix.dismissCount >= DISMISS_EXPIRE ? 'EXPIRED' : 'DISMISSED';
      p.expirationReason = ix.dismissCount >= DISMISS_EXPIRE ? 'repeated_dismissal' : 'user_dismissed';
    }
    if (ix.forcedState === 'SUPERSEDED') {
      p.state = 'SUPERSEDED';
    }

    if (p.state === 'RESOLVED') {
      rejected.push({ ...p, rejectReason: 'resolved' });
      resolutionEvidence.push(p.summary);
      continue;
    }
    if (p.state === 'SUPERSEDED') {
      rejected.push({ ...p, rejectReason: 'superseded' });
      resolutionEvidence.push(p.summary);
      continue;
    }
    if (p.state === 'EXPIRED') {
      rejected.push({ ...p, rejectReason: 'expired' });
      continue;
    }
    if (p.state === 'DISMISSED' && ix.dismissCount >= 1) {
      // Single dismiss hides until strong new evidence; treat as already_dismissed for surface
      rejected.push({ ...p, rejectReason: 'already_dismissed' });
      continue;
    }

    const age = daysBetween(p.lastUpdatedAt, now);
    if (age > MAX_AGE_DAYS) {
      p.state = 'EXPIRED';
      p.expirationReason = 'too_old';
      rejected.push({ ...p, rejectReason: 'too_old' });
      continue;
    }

    if (p.confidence < 0.45) {
      rejected.push({ ...p, rejectReason: 'weak_evidence' });
      continue;
    }

    const sens = sensitiveAllowed(p.sensitivity, input);
    if (!sens.allowed) {
      rejected.push({ ...p, rejectReason: 'too_sensitive' });
      continue;
    }

    if (contextMismatch(p, input.contextHint)) {
      rejected.push({ ...p, rejectReason: 'wrong_context' });
      continue;
    }

    // Thread affinity
    const sameThread =
      input.threadId && p.threadId && input.threadId === p.threadId
        ? 1
        : input.threadId && p.threadId
          ? 0
          : 0.4;

    const recency = clamp01(1 - age / MAX_AGE_DAYS);
    const unresolved =
      p.state === 'WAITING' ? 1 : p.state === 'IN_PROGRESS' ? 0.85 : p.state === 'OPEN' ? 0.7 : 0.4;

    const repetitionPenalty = clamp01(
      0.25 * ix.surfaceCount + 0.45 * ix.dismissCount - 0.1 * ix.continuedCount,
    );
    if (ix.surfaceCount >= SURFACE_DECAY && ix.continuedCount === 0) {
      rejected.push({ ...p, rejectReason: 'repetition' });
      continue;
    }

    const sensitivityPenalty = p.sensitivity === 'none' ? 0 : 0.15;
    const composite = clamp01(
      0.18 * sameThread +
        0.2 * recency +
        0.28 * unresolved +
        0.12 * p.confidence +
        0.12 * p.relevanceBreakdown.goalRelevance +
        0.1 * p.relevanceBreakdown.importance -
        repetitionPenalty -
        sensitivityPenalty,
    );

    p.relevanceBreakdown = {
      sameThread,
      recency,
      unresolved,
      importance: p.confidence,
      goalRelevance: p.relevanceBreakdown.goalRelevance,
      confidence: p.confidence,
      repetitionPenalty,
      sensitivityPenalty,
      composite,
    };

    // Surface recommendation
    if (composite < 0.4) {
      rejected.push({ ...p, rejectReason: 'low_relevance' });
      continue;
    }

    p.recommendedSurface =
      sens.surface === 'chat_only'
        ? 'chat_only'
        : composite >= 0.55
          ? 'resume_prompt'
          : 'quiet_context';

    if (p.recommendedSurface === 'do_not_surface') {
      rejected.push({ ...p, rejectReason: 'do_not_surface' });
      continue;
    }

    // chat_only never surfaces as banner
    if (p.recommendedSurface === 'chat_only') {
      rejected.push({ ...p, rejectReason: 'too_sensitive' });
      continue;
    }

    unresolvedEvidence.push(p.summary);
    eligible.push(p);
  }

  // Deduplicate by entity+state topic
  eligible.sort((a, b) => b.relevanceBreakdown.composite - a.relevanceBreakdown.composite);
  const selectedList: ReturnPoint[] = [];
  const seenKeys = new Set<string>();
  for (const p of eligible) {
    const key = `${p.state}:${[...p.involvedEntities].sort().join(',')}:${p.continuityMode}`;
    if (seenKeys.has(key)) {
      rejected.push({ ...p, rejectReason: 'duplicate' });
      continue;
    }
    seenKeys.add(key);
    selectedList.push(p);
  }

  // Max one surface
  const selected = selectedList[0] ?? null;
  for (const p of selectedList.slice(1)) {
    rejected.push({ ...p, rejectReason: 'duplicate' });
  }

  const finalSurfaceDecision: RecommendedSurface | 'none' = selected
    ? selected.recommendedSurface
    : 'none';

  const trace: ReturnPointTrace = {
    candidates: detected,
    selectedReturnPoint: selected,
    rejectionReasons: rejected.map((r) => ({
      id: r.id,
      reason: r.rejectReason,
      title: r.title,
    })),
    unresolvedEvidence,
    resolutionEvidence,
    sensitivityDecision: detected.map((p) => {
      const s = sensitiveAllowed(p.sensitivity, input);
      return { id: p.id, sensitivity: p.sensitivity, allowed: s.allowed };
    }),
    repetitionPenalty: detected.map((p) => {
      const ix = getInteraction(interactions, p.id);
      return {
        id: p.id,
        surfaceCount: ix.surfaceCount,
        dismissCount: ix.dismissCount,
        penalty: clamp01(0.25 * ix.surfaceCount + 0.45 * ix.dismissCount),
      };
    }),
    finalSurfaceDecision,
  };

  return { selected, rejected, trace };
}

export function applyAction(
  interactions: InteractionRecord[],
  returnPointId: string,
  action: 'continue' | 'dismiss' | 'resolve' | 'correct' | 'surface',
  now: string,
  correctionNote?: string,
): InteractionRecord[] {
  const map = new Map(interactions.map((i) => [i.returnPointId, { ...i }]));
  const cur = map.get(returnPointId) ?? {
    returnPointId,
    surfaceCount: 0,
    dismissCount: 0,
    continuedCount: 0,
    resolvedCount: 0,
  };

  cur.lastAction = action;
  cur.lastActionAt = now;

  if (action === 'surface') {
    cur.surfaceCount += 1;
    cur.lastSurfacedAt = now;
  } else if (action === 'continue') {
    cur.continuedCount += 1;
    cur.surfaceCount += 1;
    cur.lastSurfacedAt = now;
  } else if (action === 'dismiss') {
    cur.dismissCount += 1;
    cur.forcedState = cur.dismissCount >= DISMISS_EXPIRE ? 'EXPIRED' : 'DISMISSED';
  } else if (action === 'resolve') {
    cur.resolvedCount += 1;
    cur.forcedState = 'RESOLVED';
  } else if (action === 'correct') {
    cur.correctionNote = correctionNote;
    cur.forcedState = 'SUPERSEDED';
  }

  map.set(returnPointId, cur);
  return [...map.values()];
}
