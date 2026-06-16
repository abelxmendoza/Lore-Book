/**
 * Thread Summarization Engine (Sprint Phase 1 / architecture doc Phase 2).
 *
 * Three living summaries per thread — SHORT (1 sentence), MEDIUM (1 paragraph),
 * LONG (retrieval context) — maintained INCREMENTALLY and VERSIONED.
 *
 * Consolidation, not a parallel system:
 *  - Summaries are stored in the SAME `conversation_sessions.metadata.threadMeta`
 *    blob owned by threadIntelligenceService (via writeSummaries). No new table,
 *    no second store.
 *  - Regeneration is STALENESS-GATED: we only call the LLM when enough new
 *    messages have accrued (message_count − summary_message_count ≥ N) or a caller
 *    forces it. Otherwise the prior summary is reused — never a full re-read.
 *  - Incremental input: we feed the LLM the PRIOR long summary plus only the most
 *    recent turns, asking it to UPDATE the summary rather than re-read the thread.
 *  - Determinism floor: if the LLM is unavailable/empty, summaries are derived
 *    deterministically from the thread metadata so a thread is never left blank.
 *
 * Pure helpers (isSummaryStale, deriveDeterministicSummaries, parseSummaryResponse,
 * buildIncrementalInput) are exported and unit-tested; the class is the thin
 * DB/LLM wrapper.
 */

import { config } from '../../config';
import { logger } from '../../logger';
import { tracedCompletion } from '../../lib/openai';
import {
  threadIntelligenceService,
  type ThreadMetadata,
} from './threadIntelligenceService';
import { loadThreadMessages } from './threadContentService';

/** Regenerate once this many new messages have accrued since the last build. */
export const STALENESS_THRESHOLD = 4;
/** How many recent messages to feed the incremental update (prior summary carries the rest). */
const RECENT_WINDOW = 12;

export interface ThreadSummaries {
  short: string | null;
  medium: string | null;
  long: string | null;
}

export interface SummaryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** True when the stored summary no longer reflects the latest messages. Pure. */
export function isSummaryStale(meta: ThreadMetadata, threshold = STALENESS_THRESHOLD): boolean {
  if (meta.message_count === 0) return false; // nothing to summarize yet
  if (!meta.summary_short && !meta.summary_medium && !meta.summary_long) return true; // never built
  return meta.message_count - meta.summary_message_count >= threshold;
}

/**
 * Deterministic summaries from metadata alone — the floor used when the LLM is
 * unavailable. Never empty when the thread has any known structure. Pure.
 */
export function deriveDeterministicSummaries(meta: ThreadMetadata): ThreadSummaries {
  const topic = meta.title?.trim();
  const people = meta.people.slice(0, 4);
  const places = meta.places.slice(0, 3);
  const projects = meta.projects.slice(0, 3);
  const themes = meta.themes.slice(0, 3);

  const subjectBits = [
    people.length ? people.join(', ') : '',
    projects.length ? `on ${projects.join(', ')}` : '',
    places.length ? `at ${places.join(', ')}` : '',
  ].filter(Boolean);

  if (!topic && subjectBits.length === 0) {
    // Truly nothing structured known — fall back to a minimal honest line.
    const count = meta.message_count;
    if (count === 0) return { short: null, medium: null, long: null };
    const line = `${count} message${count === 1 ? '' : 's'} in this thread.`;
    return { short: line, medium: line, long: line };
  }

  const short = topic
    ? topic
    : `Conversation about ${subjectBits.join(' ')}`.trim();

  const mediumParts: string[] = [];
  if (topic) mediumParts.push(topic + '.');
  if (people.length) mediumParts.push(`People: ${people.join(', ')}.`);
  if (places.length) mediumParts.push(`Places: ${places.join(', ')}.`);
  if (projects.length) mediumParts.push(`Projects: ${projects.join(', ')}.`);
  if (themes.length) mediumParts.push(`Themes: ${themes.join(', ')}.`);
  const medium = mediumParts.join(' ');

  // LONG reuses MEDIUM plus episode anchors for retrieval context.
  const longParts = [...mediumParts];
  if (meta.episodes.length) longParts.push(`Episodes on record: ${meta.episodes.length}.`);
  if (meta.open_loops.length) longParts.push(`Open loops: ${meta.open_loops.slice(0, 4).join('; ')}.`);
  const long = longParts.join(' ');

  return { short, medium, long };
}

/** Build the incremental LLM input: prior long summary + only the recent turns. Pure. */
export function buildIncrementalInput(
  priorLong: string | null,
  recentMessages: SummaryMessage[],
): string {
  const prior = priorLong?.trim()
    ? `PRIOR SUMMARY (everything before the recent turns):\n${priorLong.trim()}\n\n`
    : '';
  const recent = recentMessages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
  return `${prior}RECENT TURNS:\n${recent}`;
}

/** Parse the JSON the LLM returns; tolerant of fenced/loose output. Pure. */
export function parseSummaryResponse(raw: string): ThreadSummaries {
  const clean = (s: unknown): string | null => {
    if (typeof s !== 'string') return null;
    const t = s.trim();
    return t.length ? t : null;
  };
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        short: clean(obj.short ?? obj.summary_short),
        medium: clean(obj.medium ?? obj.summary_medium),
        long: clean(obj.long ?? obj.summary_long),
      };
    }
  } catch {
    /* fall through to null summaries */
  }
  return { short: null, medium: null, long: null };
}

const SYSTEM_PROMPT =
  'You maintain a living summary of an ongoing conversation thread. You are given a ' +
  'PRIOR SUMMARY plus the RECENT TURNS. UPDATE the summary to incorporate the recent ' +
  'turns — do not drop established facts from the prior summary. Stay strictly factual; ' +
  'never invent details not present in the text. Respond ONLY with JSON of the form ' +
  '{"short": "...", "medium": "...", "long": "..."} where short is one sentence, ' +
  'medium is one paragraph, and long is a denser retrieval-oriented recap covering ' +
  'people, places, projects, themes, major events and unresolved topics.';

class ThreadSummaryService {
  /** Regenerate only if stale (or forced). Returns the current summaries either way. */
  async maybeRefresh(
    userId: string,
    sessionId: string,
    opts: { force?: boolean } = {},
  ): Promise<ThreadSummaries & { version: number; stale: boolean }> {
    const meta = await threadIntelligenceService.getThreadMeta(userId, sessionId);
    const stale = isSummaryStale(meta);
    if (!opts.force && !stale) {
      return {
        short: meta.summary_short,
        medium: meta.summary_medium,
        long: meta.summary_long,
        version: meta.summary_version,
        stale: false,
      };
    }
    return this.refresh(userId, sessionId, meta);
  }

  /** Force a regeneration from the recent window + prior summary. */
  async refresh(
    userId: string,
    sessionId: string,
    knownMeta?: ThreadMetadata,
  ): Promise<ThreadSummaries & { version: number; stale: boolean }> {
    const meta = knownMeta ?? (await threadIntelligenceService.getThreadMeta(userId, sessionId));

    const loaded = await loadThreadMessages(userId, sessionId);
    const recent = loaded
      .slice(-RECENT_WINDOW)
      .map((r) => ({ role: r.role === 'user' ? 'user' : 'assistant', content: r.content } as SummaryMessage))
      .filter((m) => m.content?.trim());

    // Deterministic floor first — guarantees non-empty output when messages exist.
    const metaForSummary: ThreadMetadata = {
      ...meta,
      message_count: Math.max(meta.message_count, loaded.length),
      title: meta.title ?? null,
    };
    let summaries = deriveDeterministicSummaries(metaForSummary);

    if (recent.length > 0) {
      try {
        const input = buildIncrementalInput(meta.summary_long, recent);
        const resp = await tracedCompletion(
          {
            model: config.defaultModel,
            temperature: 0,
            max_tokens: 600,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: input },
            ],
          },
          { service: 'threadSummaryService', userId },
        );
        const parsed = parseSummaryResponse(resp.choices[0]?.message?.content ?? '');
        // Use LLM output where present, keep deterministic floor for any blank level.
        summaries = {
          short: parsed.short ?? summaries.short,
          medium: parsed.medium ?? summaries.medium,
          long: parsed.long ?? summaries.long,
        };
      } catch (err) {
        logger.warn({ err, sessionId }, 'threadSummary: LLM refresh failed, using deterministic floor');
      }
    }

    const written = await threadIntelligenceService.writeSummaries(userId, sessionId, {
      short: summaries.short,
      medium: summaries.medium,
      long: summaries.long,
      builtFromMessageCount: meta.message_count,
    });

    return {
      short: written.summary_short,
      medium: written.summary_medium,
      long: written.summary_long,
      version: written.summary_version,
      stale: false,
    };
  }
}

export const threadSummaryService = new ThreadSummaryService();
