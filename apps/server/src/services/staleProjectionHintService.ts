/**
 * Surfaces stale derived projections in chat when context likely used outdated summaries.
 */
import { BIOGRAPHY_RE } from './chat/recallIntentPatterns';
import type { WorkingMemoryAssembly, WorkingMemoryItem } from './chat/workingMemoryAssembler';
import { artifactRegistry } from './artifactRegistry';

export type StaleProjectionHint = {
  id: string;
  type: 'biography_snapshot' | 'timeline_event';
  title?: string;
  summary?: string;
};

const TIMELINE_CONTEXT_RE =
  /\b(timeline|when did|what happened|life chapter|chronolog|event timeline|my events)\b/i;

const LIFE_OVERVIEW_RE = /\b(my life|life story|summarize me|overview of me|who am i now)\b/i;

function collectWorkingMemoryItems(wm?: WorkingMemoryAssembly | null): WorkingMemoryItem[] {
  if (!wm) return [];
  return [
    ...wm.episodes,
    ...wm.events,
    ...wm.timeline,
    ...wm.preferences,
    ...wm.goals,
    ...wm.projects,
    ...wm.relationships,
  ];
}

function usesNarrativeAccounts(wm?: WorkingMemoryAssembly | null): boolean {
  return collectWorkingMemoryItems(wm).some((item) => item.source === 'narrative_accounts');
}

function usesResolvedEvents(wm?: WorkingMemoryAssembly | null): boolean {
  return collectWorkingMemoryItems(wm).some(
    (item) => item.source === 'resolved_events' || String(item.id).startsWith('resolved:')
  );
}

function toHint(
  entry: Awaited<ReturnType<typeof artifactRegistry.list>>[number]
): StaleProjectionHint {
  return {
    id: entry.id,
    type: entry.type as StaleProjectionHint['type'],
    title: entry.title,
    summary: entry.summary,
  };
}

export async function collectStaleProjectionHints(
  userId: string,
  options: {
    message: string;
    activePersona?: string;
    workingMemory?: WorkingMemoryAssembly | null;
    timelineUpdates?: string[];
  }
): Promise<{ hints: StaleProjectionHint[]; summary: string | null }> {
  const [bioArtifacts, timelineArtifacts] = await Promise.all([
    artifactRegistry.list(userId, { type: 'biography_snapshot', limit: 5 }),
    artifactRegistry.list(userId, { type: 'timeline_event', limit: 50 }),
  ]);

  const staleBio = bioArtifacts.filter((a) => a.stale);
  const staleTimeline = timelineArtifacts.filter((a) => a.stale);

  if (staleBio.length === 0 && staleTimeline.length === 0) {
    return { hints: [], summary: null };
  }

  const biographyContext =
    BIOGRAPHY_RE.test(options.message) ||
    LIFE_OVERVIEW_RE.test(options.message) ||
    options.activePersona === 'biography_writer' ||
    usesNarrativeAccounts(options.workingMemory);

  const timelineContext =
    TIMELINE_CONTEXT_RE.test(options.message) ||
    (options.timelineUpdates?.length ?? 0) > 0 ||
    usesResolvedEvents(options.workingMemory);

  const hints: StaleProjectionHint[] = [];

  if (biographyContext && staleBio.length > 0) {
    hints.push(...staleBio.map(toHint));
  }

  if (timelineContext && staleTimeline.length > 0) {
    hints.push(...staleTimeline.slice(0, 3).map(toHint));
  }

  if (hints.length === 0) {
    return { hints: [], summary: null };
  }

  const parts: string[] = [];
  if (hints.some((h) => h.type === 'biography_snapshot')) {
    parts.push('your life summary may be outdated');
  }
  if (hints.some((h) => h.type === 'timeline_event')) {
    parts.push('some timeline events may need refresh');
  }

  return {
    hints,
    summary:
      parts.length > 0
        ? `${parts.join('; ')} — review or refresh in What AI Knows`
        : null,
  };
}

export function summarizeStaleProjectionHints(hints: StaleProjectionHint[]): string | null {
  if (hints.length === 0) return null;
  const bio = hints.some((h) => h.type === 'biography_snapshot');
  const timeline = hints.some((h) => h.type === 'timeline_event');
  const parts: string[] = [];
  if (bio) parts.push('life summary outdated');
  if (timeline) parts.push('timeline events outdated');
  return parts.join('; ');
}
