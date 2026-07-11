/**
 * Session delta ranking — "what changed while you were away"
 *
 * Distinct from return points (unfinished):
 *   - return points = still open / waiting
 *   - session delta = new durable facts that completed or appeared
 *
 * Pure ranking over a factual summary — no OpenAI.
 */

export type SessionDeltaInput = {
  gapDays: number;
  newMemoryCount: number;
  newChatMessageCount?: number;
  newCharacters: Array<{ id: string; name: string }>;
  newTimelineEventCount: number;
  reinforcedEntities: Array<{ name: string; newMentionCount: number }>;
  completedGoals?: string[];
  abandonedGoals?: string[];
  newMeaningLabels?: string[];
  resolvedWaits?: string[];
  strongestTheme?: string | null;
};

export type SessionDeltaLine = {
  kind:
    | 'completed_goal'
    | 'abandoned_goal'
    | 'resolved_wait'
    | 'new_people'
    | 'reinforced_person'
    | 'new_memories'
    | 'new_events'
    | 'new_meaning'
    | 'theme';
  text: string;
  priority: number;
};

export type SessionDeltaResult = {
  headline: string | null;
  lines: string[];
  hasChanges: boolean;
  ranked: SessionDeltaLine[];
};

const MAX_LINES = 3;

/**
 * Rank factual deltas into at most 3 quiet lines.
 * Prefers concrete named outcomes over raw counts.
 */
export function rankSessionDelta(input: SessionDeltaInput): SessionDeltaResult {
  const ranked: SessionDeltaLine[] = [];

  for (const g of input.completedGoals ?? []) {
    ranked.push({
      kind: 'completed_goal',
      text: `You finished: ${truncate(g, 80)}`,
      priority: 0.95,
    });
  }
  for (const g of input.abandonedGoals ?? []) {
    ranked.push({
      kind: 'abandoned_goal',
      text: `You moved on from: ${truncate(g, 80)}`,
      priority: 0.88,
    });
  }
  for (const w of input.resolvedWaits ?? []) {
    ranked.push({
      kind: 'resolved_wait',
      text: `Resolved: ${truncate(w, 80)}`,
      priority: 0.92,
    });
  }

  if (input.newCharacters.length > 0) {
    const names = input.newCharacters
      .slice(0, 3)
      .map((c) => c.name)
      .join(', ');
    const more =
      input.newCharacters.length > 3 ? ` (+${input.newCharacters.length - 3} more)` : '';
    ranked.push({
      kind: 'new_people',
      text: `${input.newCharacters.length === 1 ? 'New person' : 'New people'} in your record — ${names}${more}`,
      priority: 0.84,
    });
  }

  for (const e of (input.reinforcedEntities ?? []).slice(0, 2)) {
    ranked.push({
      kind: 'reinforced_person',
      text: `${e.name} showed up in ${e.newMentionCount} more ${e.newMentionCount === 1 ? 'memory' : 'memories'}`,
      priority: 0.78 + Math.min(0.1, e.newMentionCount * 0.02),
    });
  }

  for (const m of (input.newMeaningLabels ?? []).slice(0, 2)) {
    ranked.push({
      kind: 'new_meaning',
      text: `Noted: ${truncate(m, 80)}`,
      priority: 0.8,
    });
  }

  const memCount = input.newMemoryCount + (input.newChatMessageCount ?? 0);
  if (memCount > 0 && ranked.filter((r) => r.kind === 'new_people' || r.kind === 'reinforced_person').length === 0) {
    ranked.push({
      kind: 'new_memories',
      text: `${memCount} new ${memCount === 1 ? 'memory' : 'memories'} recorded`,
      priority: 0.55,
    });
  } else if (memCount >= 3) {
    ranked.push({
      kind: 'new_memories',
      text: `${memCount} new ${memCount === 1 ? 'memory' : 'memories'} recorded`,
      priority: 0.5,
    });
  }

  if (input.newTimelineEventCount > 0) {
    ranked.push({
      kind: 'new_events',
      text: `${input.newTimelineEventCount} new timeline ${input.newTimelineEventCount === 1 ? 'event' : 'events'}`,
      priority: 0.48,
    });
  }

  // Theme alone is not a session delta — only with other signal
  if (input.strongestTheme && ranked.length > 0 && memCount + input.newCharacters.length > 0) {
    ranked.push({
      kind: 'theme',
      text: `${input.strongestTheme} still shows up as a strong thread`,
      priority: 0.35,
    });
  }

  ranked.sort((a, b) => b.priority - a.priority);

  // Diversity: at most one of each kind in top lines
  const selected: SessionDeltaLine[] = [];
  const kinds = new Set<string>();
  for (const line of ranked) {
    if (selected.length >= MAX_LINES) break;
    if (kinds.has(line.kind) && line.kind !== 'reinforced_person' && line.kind !== 'completed_goal') {
      continue;
    }
    // Cap reinforced people at 1 in top-3
    if (line.kind === 'reinforced_person' && kinds.has('reinforced_person')) continue;
    selected.push(line);
    kinds.add(line.kind);
  }

  const lines = selected.map((s) => s.text);
  return {
    headline: lines[0] ?? null,
    lines,
    hasChanges: lines.length > 0,
    ranked: selected,
  };
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}
