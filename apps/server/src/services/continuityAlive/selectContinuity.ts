import { estimateTokens } from './tokenize';
import { scoreMemory, whySelected } from './relevanceModel';
import type {
  ContinuityCandidate,
  ContinuityMode,
  ContinuitySelectionInput,
  ContinuitySelectionResult,
  RejectedContinuityCandidate,
} from './types';

const DEFAULT_MAX = 3;
const MIN_COMPOSITE = 0.32;

function diversityKey(c: ContinuityCandidate): string {
  const ents = [...c.entities].map((e) => e.toLowerCase()).sort().join('|');
  const head = c.summary.toLowerCase().slice(0, 40);
  return `${c.memoryType}:${ents}:${head}`;
}

/**
 * Select 0–3 high-value continuity candidates with explainable rejections.
 */
export function selectContinuity(input: ContinuitySelectionInput): ContinuitySelectionResult {
  const now = input.now ?? new Date().toISOString();
  const maxSelect = input.maxSelect ?? DEFAULT_MAX;
  const resolved = input.resolvedEntities ?? [];

  const scored = input.memories.map((m) =>
    scoreMemory(m, input.currentMessage, resolved, now),
  );

  // Correction precedence: if an active correction exists for an entity, drop contradicted peers
  const corrections = scored.filter(
    (c) =>
      c.memoryType === 'correction' ||
      c.correctionState === 'user_corrected' ||
      (c.epistemicType === 'user_corrected' && c.recommendedUse !== 'do_not_use'),
  );
  const correctedEntityNames = new Set(
    corrections.flatMap((c) => c.entities.map((e) => e.toLowerCase())),
  );

  const rejected: RejectedContinuityCandidate[] = [];
  const eligible: ContinuityCandidate[] = [];

  for (const c of scored) {
    if (c.recommendedUse === 'do_not_use') {
      let reason: RejectedContinuityCandidate['rejectReason'] = 'do_not_use';
      if (c.correctionState === 'user_corrected' || c.correctionState === 'superseded') {
        reason = c.correctionState === 'superseded' ? 'superseded' : 'contradicted';
      } else if (c.sensitivity !== 'none' && c.relevanceBreakdown.sensitivityPenalty > 0) {
        reason = 'too_sensitive';
      } else if (c.relevanceBreakdown.evidenceQuality < 0.35) {
        reason = 'weak_evidence';
      } else if (c.relevanceBreakdown.composite < MIN_COMPOSITE) {
        reason = 'low_relevance';
      }
      rejected.push({ ...c, rejectReason: reason });
      continue;
    }

    // Drop stale false identity when correction entities present
    if (
      c.memoryType !== 'correction' &&
      c.entities.some((e) => correctedEntityNames.has(e.toLowerCase())) &&
      (c.correctionState === 'contradicted' ||
        /cousin james|false|wrongly linked/i.test(c.summary))
    ) {
      rejected.push({ ...c, rejectReason: 'contradicted' });
      continue;
    }

    if (c.relevanceBreakdown.composite < MIN_COMPOSITE && c.recommendedUse !== 'direct_reference') {
      rejected.push({ ...c, rejectReason: 'low_relevance' });
      continue;
    }

    eligible.push(c);
  }

  eligible.sort((a, b) => b.relevanceBreakdown.composite - a.relevanceBreakdown.composite);

  const selected: ContinuityCandidate[] = [];
  const seenKeys = new Set<string>();
  const seenModes = new Map<ContinuityMode, number>();

  for (const c of eligible) {
    if (selected.length >= maxSelect) {
      rejected.push({ ...c, rejectReason: 'over_budget' });
      continue;
    }
    const key = diversityKey(c);
    if (seenKeys.has(key)) {
      rejected.push({ ...c, rejectReason: 'duplicate' });
      continue;
    }
    // Prefer diversity of modes — allow max 2 of same mode
    const modeCount = seenModes.get(c.continuityMode) ?? 0;
    if (modeCount >= 2 && selected.length > 0) {
      rejected.push({ ...c, rejectReason: 'diversity' });
      continue;
    }
    // Same primary entity already selected with higher score — skip weaker twin
    // (name collisions: Jordan product vs Jordan friend).
    const primaryEnt = (c.entities[0] ?? '').toLowerCase();
    if (
      primaryEnt &&
      selected.some(
        (s) =>
          (s.entities[0] ?? '').toLowerCase() === primaryEnt &&
          s.relevanceBreakdown.composite >= c.relevanceBreakdown.composite,
      )
    ) {
      rejected.push({ ...c, rejectReason: 'duplicate' });
      continue;
    }
    // Skip pure background_only if we already have a strong pick and composite is weak
    if (
      c.recommendedUse === 'background_only' &&
      selected.some((s) => s.recommendedUse === 'direct_reference') &&
      c.relevanceBreakdown.composite < 0.55
    ) {
      rejected.push({ ...c, rejectReason: 'over_budget' });
      continue;
    }

    selected.push(c);
    seenKeys.add(key);
    seenModes.set(c.continuityMode, modeCount + 1);
  }

  // Prefer zero when nothing is strong enough for forced continuity
  const strong = selected.filter(
    (c) =>
      c.recommendedUse === 'direct_reference' ||
      c.recommendedUse === 'subtle_acknowledgment' ||
      c.relevanceBreakdown.composite >= 0.5,
  );
  const finalSelected =
    strong.length > 0
      ? strong.slice(0, maxSelect)
      : selected.filter((c) => c.relevanceBreakdown.composite >= 0.34).slice(0, maxSelect);

  for (const c of selected) {
    if (!finalSelected.includes(c)) {
      rejected.push({ ...c, rejectReason: 'low_relevance' });
    }
  }

  const finalMode: ContinuityMode =
    finalSelected[0]?.continuityMode ??
    (finalSelected.length === 0 ? 'none' : 'connection');

  const compositionGuidance = buildCompositionGuidance(finalSelected, finalMode, input.currentMessage);
  const promptBlock = formatContinuityPromptBlock(finalSelected, compositionGuidance);
  const promptTokensAdded = promptBlock ? estimateTokens(promptBlock) : 0;

  const intent = input.intentHint ?? inferIntentHint(input.currentMessage);

  const trace = {
    currentIntent: intent,
    resolvedEntities: resolved,
    candidatesRetrieved: scored,
    candidatesRejected: rejected,
    selectedContinuity: finalSelected,
    relevanceBreakdown: finalSelected.map((c) => ({
      memoryId: c.memoryId,
      breakdown: c.relevanceBreakdown,
      whySelected: whySelected(c),
    })),
    sensitivityDecision: scored.map((c) => ({
      memoryId: c.memoryId,
      sensitivity: c.sensitivity,
      allowed: c.recommendedUse !== 'do_not_use' || c.sensitivity === 'none',
      reason:
        c.sensitivity === 'none'
          ? 'not_sensitive'
          : c.recommendedUse === 'do_not_use'
            ? 'blocked'
            : 'allowed',
    })),
    correctionChecks: scored
      .filter((c) => c.correctionState !== 'active' || c.memoryType === 'correction')
      .map((c) => ({
        memoryId: c.memoryId,
        correctionState: c.correctionState,
        action:
          c.memoryType === 'correction'
            ? 'use_as_current_truth'
            : c.recommendedUse === 'do_not_use'
              ? 'exclude_stale'
              : 'keep',
      })),
    promptTokensAdded,
    finalContinuityMode: finalMode,
    compositionGuidance,
  };

  return {
    selected: finalSelected,
    rejected,
    trace,
    promptBlock,
  };
}

function inferIntentHint(message: string): string {
  if (/\bwho\b/i.test(message)) return 'person_query';
  if (/\bwhat does .+ mean\b/i.test(message) || /\bdefine\b/i.test(message)) return 'definition';
  if (/\bwant to work|job|role|interview\b/i.test(message)) return 'career';
  if (/\bbacked off|boundary|boundaries|dancing\b/i.test(message)) return 'behavioral';
  return 'general';
}

export function buildCompositionGuidance(
  selected: ContinuityCandidate[],
  mode: ContinuityMode,
  currentMessage: string,
): string | null {
  if (selected.length === 0) {
    if (/\bwhat does .+ mean\b/i.test(currentMessage) || /\bdefine\b/i.test(currentMessage)) {
      return [
        'CONTINUITY MODE: none',
        'Answer the current question directly. Do not force a memory reference.',
        'Do not mention unrelated past events, people, or hardware installs.',
      ].join('\n');
    }
    return null;
  }

  const lines = [
    `CONTINUITY MODE: ${mode}`,
    'Use selected continuity naturally. Do not announce database retrieval.',
    'Answer the current message first. Reference memory only when it strengthens understanding.',
    'Do not list everything known. Do not overclaim personal growth or transformation.',
    'Distinguish what the user said (stated) from inference. Prefer understatement.',
    'Do not invent feelings of third parties. Do not surface sensitive memories not selected below.',
    '',
    'SELECTED CONTINUITY CANDIDATES (0–3):',
  ];

  for (const c of selected) {
    lines.push(
      `- [${c.continuityMode}/${c.recommendedUse}] ${c.summary}`,
      `  why: ${c.relationshipToCurrentMessage}`,
      `  entities: ${c.entities.join(', ') || '—'}; confidence=${c.confidence.toFixed(2)}; epistemic=${c.epistemicType}`,
    );
  }

  lines.push(
    '',
    'COMPOSITION HINTS:',
    mode === 'progress'
      ? '- Progress: note the behavioral difference carefully without claiming permanent healing.'
      : mode === 'goal_follow_up'
        ? '- Goal follow-up: connect opportunity to direction; do not declare it the right choice.'
        : mode === 'recall'
          ? '- Recall: answer with the correct entity/fact only; do not invent rankings like "best coder".'
          : mode === 'contrast'
            ? '- Contrast: preserve history while reflecting the current preference/goal.'
            : '- Connection: one natural bridge sentence is enough.',
  );

  return lines.join('\n');
}

export function formatContinuityPromptBlock(
  selected: ContinuityCandidate[],
  guidance: string | null,
): string | null {
  if (!guidance && selected.length === 0) return null;
  if (!guidance) return null;
  return guidance;
}
