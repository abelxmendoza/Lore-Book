/**
 * Character provenance backfill.
 *
 * Cards created by recovery / un-merge (or any path that didn't capture a
 * source) land with empty `context_of_mention` and no provenance metadata, so
 * the card audit reports them as "Needs context — No provenance captured yet"
 * even though the conversations that named them are fully intact in chat
 * history. This service reconnects the two: for each character lacking
 * provenance it searches the user's chat + conversation messages for
 * word-boundary mentions of the name (and aliases), preferring the user's own
 * messages ("what I said about them"), and writes a representative snippet plus
 * source message ids back onto the card.
 *
 * It is read-mostly and idempotent: cards that already carry provenance are
 * skipped unless `force` is set, and re-running only refreshes the same fields.
 *
 * Cost model — deterministic first, LLM optional:
 *   Tier 1 (always, free, no network to OpenAI): word-boundary matching over the
 *     FTS-indexed chat tables produces the snippet + source ids. This is the
 *     default and makes the feature fully self-sufficient.
 *   Tier 2 (opt-in via `enrich`, gated on a configured key): a SINGLE batched
 *     completion turns the deterministic evidence into a one-line "who is this
 *     person" narrative for the whole roster at once. It writes to a separate
 *     metadata field and never overwrites Tier-1 data, and fails open — any
 *     error keeps the deterministic result. So the app leans on OpenAI only when
 *     asked, and degrades to independent operation when it can't.
 */

import { supabaseAdmin } from '../../supabaseClient';
import { logger } from '../../../logger';
import { config } from '../../../config';
import { tracedCompletion } from '../../openaiClient';

type MessageRow = {
  id: string;
  role: string | null;
  content: string | null;
  created_at: string;
};

type CharacterRow = {
  id: string;
  name: string;
  alias: string[] | null;
  metadata: Record<string, unknown> | null;
  context_of_mention: string | null;
};

export type CharacterProvenanceBackfillResult = {
  characterId: string;
  name: string;
  mentionCount: number;
  sourceMessageIds: string[];
  summary: string;
  updated: boolean;
};

export type CharacterProvenanceBackfillReport = {
  scanned: number;
  updated: number;
  /** Cards given an LLM narrative (Tier 2). 0 unless `enrich` was requested. */
  enriched: number;
  results: CharacterProvenanceBackfillResult[];
};

/** Internal queue item carrying the evidence used for optional LLM enrichment. */
type EnrichQueueItem = {
  id: string;
  name: string;
  evidence: string[];
  metadata: Record<string, unknown>;
};

const CANDIDATES_PER_TABLE = 60;
const MAX_SOURCE_MESSAGE_IDS = 25;
/**
 * After an empty scan (card has no chat mentions yet), don't re-scan it for this
 * long. Keeps the automatic auto-heal cheap: cards that genuinely have nothing
 * to find aren't re-queried on every audit load.
 */
const EMPTY_RESCAN_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const SNIPPET_WINDOW_BEFORE = 70;
const SNIPPET_WINDOW_AFTER = 190;
const SUMMARY_MAX = 220;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary regex for a name/alias. Uses lookarounds (not \b) so it behaves
 * correctly for multi-word names ("Baby Bats") and names with punctuation
 * ("Mr. Chino"): a match must not be flanked by word characters, which keeps
 * short tokens like "Sol" from matching "solution"/"console".
 */
function boundaryRegex(term: string, flags = 'i'): RegExp {
  return new RegExp(`(?<![\\w])${escapeRegExp(term)}(?![\\w])`, flags);
}

/** Search terms for a character: the name plus any aliases, deduped, length >= 2. */
function searchTerms(row: CharacterRow): string[] {
  const terms = [row.name, ...(row.alias ?? [])]
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t) => t.length >= 2);
  return Array.from(new Set(terms));
}

function hasProvenance(row: CharacterRow): boolean {
  if (row.context_of_mention?.trim()) return true;
  const meta = row.metadata ?? {};
  if (typeof meta.provenanceSummary === 'string' && meta.provenanceSummary.trim()) return true;
  if (Array.isArray(meta.sourceMessageIds) && meta.sourceMessageIds.length > 0) return true;
  return false;
}

/** True if an empty scan ran recently — skip to keep automatic runs cheap. */
function recentlyAttemptedEmpty(row: CharacterRow): boolean {
  const at = row.metadata?.provenanceBackfillAttemptedAt;
  if (typeof at !== 'string') return false;
  const ts = Date.parse(at);
  return Number.isFinite(ts) && Date.now() - ts < EMPTY_RESCAN_COOLDOWN_MS;
}

/** Extract a snippet windowed around the first matched term in the content. */
function extractSnippet(content: string, terms: string[]): string {
  const text = content.replace(/\s+/g, ' ').trim();
  let matchIndex = -1;
  for (const term of terms) {
    const m = boundaryRegex(term, 'i').exec(text);
    if (m && (matchIndex === -1 || m.index < matchIndex)) matchIndex = m.index;
  }
  if (matchIndex === -1) {
    return text.length <= SUMMARY_MAX ? text : `${text.slice(0, SUMMARY_MAX - 1)}…`;
  }
  const start = Math.max(0, matchIndex - SNIPPET_WINDOW_BEFORE);
  const end = Math.min(text.length, matchIndex + SNIPPET_WINDOW_AFTER);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

/** PostgREST `.or()` ilike clause for the given terms (terms are simple names). */
function ilikeOrClause(terms: string[]): string {
  return terms
    // Strip characters that have meaning in PostgREST's filter grammar.
    .map((t) => t.replace(/[,()*]/g, ' ').trim())
    .filter(Boolean)
    .map((t) => `content.ilike.%${t}%`)
    .join(',');
}

class CharacterProvenanceBackfillService {
  /** Fetch candidate messages mentioning any term from one message table. */
  private async fetchCandidates(
    table: 'chat_messages' | 'conversation_messages',
    userId: string,
    terms: string[],
  ): Promise<MessageRow[]> {
    const orClause = ilikeOrClause(terms);
    if (!orClause) return [];
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .or(orClause)
      .order('created_at', { ascending: true })
      .limit(CANDIDATES_PER_TABLE);
    if (error) {
      logger.warn({ error, table }, 'provenance backfill: candidate fetch failed');
      return [];
    }
    return (data ?? []) as MessageRow[];
  }

  /** Build provenance for one character from its matched messages. */
  private buildProvenance(
    row: CharacterRow,
    terms: string[],
    candidates: MessageRow[],
  ): { matches: MessageRow[]; userMatches: MessageRow[] } {
    const regexes = terms.map((t) => boundaryRegex(t, 'i'));
    const seen = new Set<string>();
    const matches: MessageRow[] = [];
    for (const msg of candidates) {
      if (!msg.content || seen.has(msg.id)) continue;
      if (regexes.some((re) => re.test(msg.content!))) {
        seen.add(msg.id);
        matches.push(msg);
      }
    }
    const userMatches = matches.filter((m) => m.role === 'user');
    return { matches, userMatches };
  }

  async backfillUser(
    userId: string,
    opts?: { force?: boolean; characterIds?: string[]; enrich?: boolean },
  ): Promise<CharacterProvenanceBackfillReport> {
    let query = supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata, context_of_mention')
      .eq('user_id', userId)
      .neq('status', 'archived');
    if (opts?.characterIds?.length) {
      query = query.in('id', opts.characterIds);
    }
    const { data, error } = await query;
    if (error) throw error;

    const rows = ((data ?? []) as CharacterRow[]).filter((r) => String(r.name ?? '').trim());
    const results: CharacterProvenanceBackfillResult[] = [];
    const enrichQueue: EnrichQueueItem[] = [];
    let updated = 0;

    for (const row of rows) {
      if (!opts?.force && (hasProvenance(row) || recentlyAttemptedEmpty(row))) continue;
      const terms = searchTerms(row);
      if (terms.length === 0) continue;

      const [chatRows, convRows] = await Promise.all([
        this.fetchCandidates('chat_messages', userId, terms),
        this.fetchCandidates('conversation_messages', userId, terms),
      ]);
      const { matches, userMatches } = this.buildProvenance(row, terms, [...chatRows, ...convRows]);

      if (matches.length === 0) {
        // Record the empty attempt so the cooldown skips this card next time.
        await supabaseAdmin
          .from('characters')
          .update({
            metadata: {
              ...(row.metadata ?? {}),
              provenanceBackfillAttemptedAt: new Date().toISOString(),
            },
          })
          .eq('id', row.id)
          .eq('user_id', userId);
        results.push({
          characterId: row.id,
          name: row.name,
          mentionCount: 0,
          sourceMessageIds: [],
          summary: '',
          updated: false,
        });
        continue;
      }

      // Prefer the user's own words for the visible snippet; fall back to any
      // matched message (e.g. an assistant summary) only if the user never
      // typed the name themselves.
      const snippetSource =
        userMatches.find((m) => (m.content ?? '').length >= 40) ??
        userMatches[0] ??
        matches[0];
      const summary = extractSnippet(snippetSource.content ?? '', terms);

      // Source ids: user messages first, then the rest, deduped and capped.
      const ordered = [...userMatches, ...matches.filter((m) => m.role !== 'user')];
      const sourceMessageIds = Array.from(new Set(ordered.map((m) => m.id))).slice(
        0,
        MAX_SOURCE_MESSAGE_IDS,
      );
      const sorted = [...matches].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      const nextMetadata = {
        ...(row.metadata ?? {}),
        provenanceSummary: summary,
        sourceMessageIds,
        mentionCount: matches.length,
        firstMentionedAt: sorted[0]?.created_at,
        lastMentionedAt: sorted[sorted.length - 1]?.created_at,
        provenanceSource: 'chat_backfill',
        provenanceBackfilledAt: new Date().toISOString(),
      };

      const { error: updateError } = await supabaseAdmin
        .from('characters')
        .update({
          context_of_mention: summary,
          metadata: nextMetadata,
        })
        .eq('id', row.id)
        .eq('user_id', userId);

      if (updateError) {
        logger.warn({ error: updateError, characterId: row.id }, 'provenance backfill: update failed');
        results.push({
          characterId: row.id,
          name: row.name,
          mentionCount: matches.length,
          sourceMessageIds,
          summary,
          updated: false,
        });
        continue;
      }

      updated += 1;
      results.push({
        characterId: row.id,
        name: row.name,
        mentionCount: matches.length,
        sourceMessageIds,
        summary,
        updated: true,
      });

      // Queue a few user snippets as evidence for optional Tier-2 enrichment.
      const evidenceRows = (userMatches.length ? userMatches : matches).slice(0, 3);
      enrichQueue.push({
        id: row.id,
        name: row.name,
        evidence: evidenceRows.map((m) => extractSnippet(m.content ?? '', terms)),
        metadata: nextMetadata,
      });
    }

    let enriched = 0;
    if (opts?.enrich && enrichQueue.length > 0) {
      enriched = await this.enrichWithLLM(userId, enrichQueue);
    }

    return { scanned: rows.length, updated, enriched, results };
  }

  /**
   * Tier 2 (optional): one batched completion that turns the deterministic
   * evidence into a one-line narrative per character. Gated on a configured key,
   * writes only `metadata.provenanceNarrative` (never the Tier-1 fields), and
   * fails open — any error leaves the deterministic result untouched.
   */
  private async enrichWithLLM(userId: string, items: EnrichQueueItem[]): Promise<number> {
    if (!config.openAiKey) return 0;
    const roster = items.slice(0, 40).map((it, ref) => ({
      ref,
      name: it.name,
      evidence: it.evidence.slice(0, 3),
    }));
    if (roster.length === 0) return 0;

    try {
      const completion = await tracedCompletion(
        {
          model: config.extractionModel,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You summarize who each person is to the user, using ONLY the supplied evidence quotes from the user\'s own chat history. Write one factual sentence per person — their relationship/role and any concrete detail present in the evidence. Never speculate or add facts not in the evidence; if the evidence is too thin, return an empty string for that person. Respond as JSON: {"people":[{"ref":number,"summary":string}]}.',
            },
            { role: 'user', content: JSON.stringify({ people: roster }) },
          ],
        },
        { service: 'characterProvenanceBackfill', userId },
      );

      const content = completion.choices[0]?.message?.content;
      if (!content) return 0;
      const parsed = JSON.parse(content) as { people?: Array<{ ref: number; summary: string }> };

      let enriched = 0;
      const enrichedAt = new Date().toISOString();
      for (const person of parsed.people ?? []) {
        const item = items[person.ref];
        const summary = typeof person.summary === 'string' ? person.summary.trim() : '';
        if (!item || !summary) continue;
        const { error: updateError } = await supabaseAdmin
          .from('characters')
          .update({
            metadata: {
              ...item.metadata,
              provenanceNarrative: summary,
              provenanceNarrativeModel: config.extractionModel,
              provenanceEnrichedAt: enrichedAt,
            },
          })
          .eq('id', item.id)
          .eq('user_id', userId);
        if (!updateError) enriched += 1;
      }
      return enriched;
    } catch (err) {
      logger.warn({ err, userId }, 'provenance enrichment failed — kept deterministic result');
      return 0;
    }
  }
}

export const characterProvenanceBackfillService = new CharacterProvenanceBackfillService();
export {
  CharacterProvenanceBackfillService,
  extractSnippet,
  boundaryRegex,
  hasProvenance,
  recentlyAttemptedEmpty,
};
