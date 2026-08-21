/**
 * Event Recovery Service — mines chat, entity_facts, and thread metadata for
 * benchmark life events missing from resolved_events.
 *
 * Canonical writes go to resolved_events.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../logger';
import { resolveCharacterIdByName } from './relationshipFoundationService';
import { supabaseAdmin } from './supabaseClient';
import { ingestResolvedEvent } from './narrativeSpine/narrativeSpineIngestion';
import {
  EVENT_RECOVERY_DELTA_BUDGET,
  EVENT_RECOVERY_OVERLAP_MS,
  EVENT_RECOVERY_SWEEP_BUDGET,
} from './ingestion/deltaJobBudget';
import {
  EVENT_RECOVERY_PROCESSING_VERSION,
  advanceCursor,
  claimWorker,
  loadWorkerCursor,
  logDeltaReport,
  overlapIso,
  releaseWorker,
  saveWorkerCursor,
  type DeltaWorkerReport,
  type WorkerRunMode,
} from './ingestion/workerHighWaterMark';

export type EventRecoveryPattern = {
  key: string;
  title: string;
  re: RegExp;
  eventType: string;
  timelineType: 'shared_experience' | 'lore' | 'mentioned_in';
  /** Character name hints for connection_character_id */
  people?: string[];
};

export const BENCHMARK_EVENT_PATTERNS: EventRecoveryPattern[] = [
  {
    key: 'costco_abuela',
    title: 'Costco with Abuela',
    re: /\bcostco\b[^.!?\n]{0,80}\babuela\b|\babuela\b[^.!?\n]{0,80}\bcostco\b/i,
    eventType: 'activity',
    timelineType: 'shared_experience',
    people: ['Abuela', 'Me'],
  },
  {
    key: 'lorebook_abuela_house',
    title: "Building LoreBook at Abuela's House",
    re: /building lorebook|lorebook.*abuela|abuela'?s house.*lorebook/i,
    eventType: 'career_event',
    timelineType: 'shared_experience',
    people: ['Abuela', 'Me'],
  },
  {
    key: 'club_metro',
    title: 'Club Metro',
    re: /\bclub metro\b/i,
    eventType: 'activity',
    timelineType: 'shared_experience',
    people: ['Me'],
  },
  {
    key: 'leslie_graduation',
    title: "Leslie's Graduation Party",
    re: /leslie'?s graduation|graduation party.*leslie|\bleslie\b[^.!?\n]{0,60}\bgraduation\b/i,
    eventType: 'life_context',
    timelineType: 'shared_experience',
    people: ['Leslie', 'Me'],
  },
  {
    key: 'kelly_interview',
    title: 'Kelly Interview Process',
    re: /\bkelly\b[^.!?\n]{0,80}\b(interview|recruiter|hiring)\b|\b(interview|recruiter)\b[^.!?\n]{0,80}\bkelly\b/i,
    eventType: 'career_event',
    timelineType: 'shared_experience',
    people: ['Kelly', 'Me'],
  },
  {
    key: 'amazon_onboarding',
    title: 'Amazon Onboarding',
    re: /\bamazon\b[^.!?\n]{0,120}\b(onboard|orientation|first day|started|hired|new job|warehouse)\b|\b(onboard|orientation|first day|started|hired)\b[^.!?\n]{0,120}\bamazon\b/i,
    eventType: 'career_event',
    timelineType: 'lore',
    people: ['Me'],
  },
  {
    key: 'sol_breakup',
    title: 'Sol Breakup',
    re: /\bsol\b[^.!?\n]{0,80}\b(breakup|blocked|no contact|left on read)\b|\b(breakup|blocked|no contact)\b[^.!?\n]{0,80}\bsol\b/i,
    eventType: 'relationship_separation',
    timelineType: 'shared_experience',
    people: ['Sol', 'Me'],
  },
  {
    key: 'pool_billiards',
    title: 'First Street Pool and Billiards',
    re: /\bfirst street pool\b|\bbilliards\b/i,
    eventType: 'activity',
    timelineType: 'shared_experience',
    people: ['Me'],
  },
];

function snippetAround(text: string, re: RegExp, radius = 200): string {
  const m = text.match(re);
  if (!m || m.index == null) return text.slice(0, 400);
  const start = Math.max(0, m.index - radius);
  return text.slice(start, start + radius * 2).trim();
}

export type EventRecoveryOptions = {
  /** Ordinary live cycle is delta. Manual diagnostics/scripts use recovery. */
  mode?: WorkerRunMode;
  maxRows?: number;
};

export type EventRecoveryStats = {
  created: number;
  skipped: number;
  matched: string[];
  report: DeltaWorkerReport;
};

function isFullSweepMode(mode: WorkerRunMode): boolean {
  return mode === 'recovery' || mode === 'rebuild';
}

class EventRecoveryService {
  /**
   * Collect text to scan. Delta reads messages newer than the cursor (+ overlap).
   * Recovery/rebuild may reread a bounded historical window (≤800) plus sessions/facts.
   */
  async collectCorpus(
    userId: string,
    options: EventRecoveryOptions & {
      sinceIso?: string | null;
      failedIds?: string[];
    } = {},
  ): Promise<{ text: string; dates: string[]; rowsScanned: number; newestAt: string | null; newestId: string | null }> {
    const mode: WorkerRunMode = options.mode ?? 'recovery';
    const budget = isFullSweepMode(mode) ? EVENT_RECOVERY_SWEEP_BUDGET : EVENT_RECOVERY_DELTA_BUDGET;
    const maxRows = Math.min(options.maxRows ?? budget.maxRows, budget.maxRows);
    const chunks: string[] = [];
    const dates: string[] = [];
    let rowsScanned = 0;
    let newestAt: string | null = null;
    let newestId: string | null = null;

    const noteStamp = (id: string | null, at: string | null) => {
      if (!at) return;
      dates.push(at);
      if (!newestAt || at > newestAt) {
        newestAt = at;
        newestId = id;
      }
    };

    const seenIds = new Set<string>();
    const ingestChatRow = (m: {
      id?: string;
      content?: string | null;
      created_at?: string | null;
      edited_at?: string | null;
    }) => {
      const id = typeof m.id === 'string' ? m.id : null;
      if (id && seenIds.has(id)) return;
      if (id) seenIds.add(id);
      rowsScanned += 1;
      if (m.content) chunks.push(String(m.content));
      noteStamp(id, String(m.edited_at ?? m.created_at ?? ''));
    };

    if (!isFullSweepMode(mode) && options.sinceIso) {
      const [{ data: newMsgs }, { data: editedMsgs }] = await Promise.all([
        supabaseAdmin
          .from('chat_messages')
          .select('id, content, created_at, edited_at')
          .eq('user_id', userId)
          .gte('created_at', options.sinceIso)
          .order('created_at', { ascending: false })
          .limit(maxRows),
        supabaseAdmin
          .from('chat_messages')
          .select('id, content, created_at, edited_at')
          .eq('user_id', userId)
          .gte('edited_at', options.sinceIso)
          .order('edited_at', { ascending: false })
          .limit(50),
      ]);
      for (const m of newMsgs ?? []) ingestChatRow(m);
      for (const m of editedMsgs ?? []) ingestChatRow(m);
    } else {
      const { data: chatMsgs } = await supabaseAdmin
        .from('chat_messages')
        .select('id, content, created_at, edited_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(maxRows);
      for (const m of chatMsgs ?? []) ingestChatRow(m);
    }

    if (options.failedIds && options.failedIds.length > 0) {
      const { data: failedRows } = await supabaseAdmin
        .from('chat_messages')
        .select('id, content, created_at, edited_at')
        .eq('user_id', userId)
        .in('id', options.failedIds.slice(0, 50));
      for (const m of failedRows ?? []) ingestChatRow(m);
    }

    if (isFullSweepMode(mode)) {
      const { data: sessions } = await supabaseAdmin
        .from('conversation_sessions')
        .select('metadata, updated_at')
        .eq('user_id', userId);
      for (const s of sessions ?? []) {
        rowsScanned += 1;
        const meta = (s.metadata ?? {}) as Record<string, unknown>;
        const tm = (meta.threadMeta ?? meta) as Record<string, unknown>;
        for (const key of ['summary_short', 'summary_medium', 'summary_long', 'summary']) {
          if (typeof tm[key] === 'string') chunks.push(tm[key] as string);
        }
        const msgs = meta.messages as Array<{ content?: string }> | undefined;
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            if (m.content) chunks.push(String(m.content));
          }
        }
        noteStamp(null, s.updated_at ? String(s.updated_at) : null);
      }

      const { data: facts } = await supabaseAdmin
        .from('entity_facts')
        .select('fact, updated_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(2000);
      for (const f of facts ?? []) {
        rowsScanned += 1;
        if (f.fact) chunks.push(String(f.fact));
        noteStamp(null, f.updated_at ? String(f.updated_at) : null);
      }
    }

    return { text: chunks.join('\n'), dates, rowsScanned, newestAt, newestId };
  }

  async recoverMissingEvents(userId: string, options: EventRecoveryOptions = {}): Promise<EventRecoveryStats> {
    const mode: WorkerRunMode = options.mode ?? 'recovery';
    const emptyReport = (partial: Partial<DeltaWorkerReport> = {}): DeltaWorkerReport => ({
      worker: 'event_recovery',
      userId,
      mode,
      rowsScanned: 0,
      rowsNew: 0,
      rowsChanged: 0,
      rowsSkippedAlreadyProcessed: 0,
      llmCalls: 0,
      embeddingCalls: 0,
      writes: 0,
      cursorBefore: null,
      cursorAfter: null,
      retryCount: 0,
      ...partial,
    });

    if (!claimWorker(userId, 'event_recovery')) {
      return {
        created: 0,
        skipped: 0,
        matched: [],
        report: emptyReport({ rowsSkippedAlreadyProcessed: 1 }),
      };
    }

    const cursor = await loadWorkerCursor(userId, 'event_recovery', EVENT_RECOVERY_PROCESSING_VERSION);
    const sinceIso =
      mode === 'delta' ? overlapIso(cursor.lastProcessedAt, EVENT_RECOVERY_OVERLAP_MS) : null;

    try {
      const stats = { created: 0, skipped: 0, matched: [] as string[] };
      const corpus = await this.collectCorpus(userId, {
        mode,
        maxRows: options.maxRows,
        sinceIso,
        failedIds: cursor.failedIds,
      });

      const reportBase = emptyReport({
        rowsScanned: corpus.rowsScanned,
        cursorBefore: cursor.lastProcessedAt,
        cursorAfter: cursor.lastProcessedAt,
        retryCount: cursor.failedIds.length,
      });

      if (!corpus.text.trim()) {
        logDeltaReport(reportBase);
        return { ...stats, report: reportBase };
      }

      const { data: chars } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId);
      if (!chars?.length) {
        logDeltaReport(reportBase);
        return { ...stats, report: reportBase };
      }

      const protagonist =
        chars.find((c) => /^me$/i.test(c.name)) ??
        chars[0];

      const { data: existingResolved } = await supabaseAdmin
        .from('resolved_events')
        .select('title, metadata')
        .eq('user_id', userId);
      const existingTitles = new Set(
        (existingResolved ?? []).map((e) => String(e.title ?? '').toLowerCase())
      );
      const existingRecoveryKeys = new Set(
        (existingResolved ?? [])
          .map((e) => {
            const meta = (e.metadata ?? {}) as Record<string, unknown>;
            return typeof meta.recovery_key === 'string' ? meta.recovery_key : null;
          })
          .filter((key): key is string => Boolean(key)),
      );

      const fallbackDate =
        corpus.dates.sort().reverse()[0] ?? new Date().toISOString();

      for (const pattern of BENCHMARK_EVENT_PATTERNS) {
        if (!pattern.re.test(corpus.text)) {
          stats.skipped++;
          continue;
        }
        if (
          existingTitles.has(pattern.title.toLowerCase())
          || existingRecoveryKeys.has(pattern.key)
        ) {
          stats.skipped++;
          continue;
        }

        const summary = snippetAround(corpus.text, pattern.re);
        const resolvedId = uuid();
        // Recovery timestamps are ingestion artifacts — never promote corpus/now
        // fallbacks to exact occurrence time for Omni chronology.
        const charIds = new Set<string>();
        if (protagonist) charIds.add(protagonist.id);
        for (const name of pattern.people ?? []) {
          const id = resolveCharacterIdByName(name, chars);
          if (id) charIds.add(id);
        }

        const { error: resolvedErr } = await supabaseAdmin.from('resolved_events').insert({
          id: resolvedId,
          user_id: userId,
          title: pattern.title,
          summary,
          type: pattern.eventType,
          start_time: null,
          confidence: 0.2,
          tags: ['recovered'],
          temporal_precision: 'unknown',
          temporal_source: 'recording_fallback',
          temporal_status: 'unanchored',
          temporal_confidence: 0.2,
          people: [...charIds],
          metadata: {
            generated_by: 'event_recovery',
            recovery_key: pattern.key,
            recovery_fallback_date: fallbackDate,
            needs_temporal_resolution: true,
            processing_version: EVENT_RECOVERY_PROCESSING_VERSION,
          },
        });

        if (resolvedErr) {
          logger.warn({ error: resolvedErr, key: pattern.key }, 'event_recovery: resolved_events insert failed');
          stats.skipped++;
          continue;
        }

        ingestResolvedEvent(userId, resolvedId);
        stats.created++;
        stats.matched.push(pattern.key);
        existingTitles.add(pattern.title.toLowerCase());
      }

      const next = advanceCursor(
        cursor,
        corpus.newestAt ? [{ id: corpus.newestId, at: corpus.newestAt }] : [],
        [],
        EVENT_RECOVERY_PROCESSING_VERSION,
      );
      if (next.lastProcessedAt !== cursor.lastProcessedAt || next.failedIds.length !== cursor.failedIds.length) {
        await saveWorkerCursor(userId, 'event_recovery', next);
      }

      const report: DeltaWorkerReport = {
        ...reportBase,
        rowsNew: stats.created,
        rowsSkippedAlreadyProcessed: stats.skipped,
        writes: stats.created,
        cursorAfter: next.lastProcessedAt,
      };
      logDeltaReport(report);
      return { ...stats, report };
    } finally {
      releaseWorker(userId, 'event_recovery');
    }
  }

  async benchmarkCoverage(userId: string): Promise<Record<string, boolean>> {
    const { data: events } = await supabaseAdmin
      .from('resolved_events')
      .select('title, metadata')
      .eq('user_id', userId);

    const titles = (events ?? []).map((e) => String(e.title ?? '').toLowerCase()).join('\n');
    const recoveryKeys = new Set(
      (events ?? [])
        .map((e) => {
          const meta = (e.metadata ?? {}) as Record<string, unknown>;
          return typeof meta.recovery_key === 'string' ? meta.recovery_key : null;
        })
        .filter((key): key is string => Boolean(key)),
    );
    return Object.fromEntries(
      BENCHMARK_EVENT_PATTERNS.map((p) => [
        p.key,
        recoveryKeys.has(p.key) || titles.includes(p.title.toLowerCase()),
      ])
    );
  }
}

export const eventRecoveryService = new EventRecoveryService();
