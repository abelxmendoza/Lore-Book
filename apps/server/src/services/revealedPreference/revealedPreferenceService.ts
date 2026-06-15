/**
 * Revealed Preference Engine — service layer.
 *
 * Orchestrates the pure extractor over a user's episodes (journal_entries +
 * their own chat_messages), aggregates stated-vs-revealed evidence, computes
 * alignment + trend, and persists signals + per-episode provenance.
 *
 * Trust guarantees:
 *  - A signal row only exists if it has ≥1 evidence row (rescan rebuilds both).
 *  - Every count maps to real supporting episodes (preference_evidence).
 *  - Fully deterministic — re-running on the same data yields the same result.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  extractSignals,
  confidenceFromEvidence,
  classifyAlignment,
  classifyTrend,
  type PreferenceType,
  type SignalType,
} from './preferenceTaxonomy';

const RECENT_DAYS = 30;
const PRIOR_DAYS = 60; // the 30→90 day window
const DAY_MS = 86_400_000;
const EVIDENCE_SAMPLE = 4; // supporting episodes returned per category in the report

interface EpisodeRow { source: 'journal' | 'chat'; id: string; text: string; occurredAt: string | null; }

interface EvidenceDraft {
  categoryKey: string; signalType: SignalType; source: 'journal' | 'chat';
  sourceId: string; matchedTerm: string; snippet: string; occurredAt: string | null;
}

interface CategoryAgg {
  categoryKey: string; type: PreferenceType; label: string;
  statedCount: number; revealedCount: number;
  recentRevealed: number; priorRevealed: number;
  firstSeen: string | null; lastSeen: string | null;
  evidence: EvidenceDraft[];
}

export interface RescanSummary {
  scannedEpisodes: number;
  categories: number;
  totalStated: number;
  totalRevealed: number;
  topRevealed: Array<{ key: string; label: string; revealedCount: number; statedCount: number }>;
}

function snippetAround(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return text.slice(0, 160).trim();
  const start = Math.max(0, i - 60);
  const end = Math.min(text.length, i + term.length + 80);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

class RevealedPreferenceService {
  /** Load every episode (journal + the user's own chat messages). */
  private async loadEpisodes(userId: string): Promise<EpisodeRow[]> {
    const [journals, chats] = await Promise.all([
      supabaseAdmin.from('journal_entries').select('id, content, date').eq('user_id', userId),
      supabaseAdmin.from('chat_messages').select('id, content, created_at').eq('user_id', userId).eq('role', 'user'),
    ]);

    const episodes: EpisodeRow[] = [];
    for (const j of journals.data ?? []) {
      if (j.content) episodes.push({ source: 'journal', id: j.id, text: j.content, occurredAt: j.date ?? null });
    }
    for (const c of chats.data ?? []) {
      if (c.content) episodes.push({ source: 'chat', id: c.id, text: c.content, occurredAt: c.created_at ?? null });
    }
    return episodes;
  }

  /** Full rebuild of a user's revealed-preference signals from their episodes. */
  async rescan(userId: string): Promise<RescanSummary> {
    const episodes = await this.loadEpisodes(userId);
    const now = Date.now();
    const aggByCategory = new Map<string, CategoryAgg>();

    for (const ep of episodes) {
      const matches = extractSignals(ep.text);
      for (const m of matches) {
        let agg = aggByCategory.get(m.categoryKey);
        if (!agg) {
          agg = {
            categoryKey: m.categoryKey, type: m.type, label: m.label,
            statedCount: 0, revealedCount: 0, recentRevealed: 0, priorRevealed: 0,
            firstSeen: null, lastSeen: null, evidence: [],
          };
          aggByCategory.set(m.categoryKey, agg);
        }

        if (m.signalType === 'stated') agg.statedCount += 1;
        else {
          agg.revealedCount += 1;
          // recency windows from the episode time
          if (ep.occurredAt) {
            const ageDays = (now - new Date(ep.occurredAt).getTime()) / DAY_MS;
            if (ageDays >= 0 && ageDays < RECENT_DAYS) agg.recentRevealed += 1;
            else if (ageDays >= RECENT_DAYS && ageDays < RECENT_DAYS + PRIOR_DAYS) agg.priorRevealed += 1;
          }
        }

        if (ep.occurredAt) {
          if (!agg.firstSeen || ep.occurredAt < agg.firstSeen) agg.firstSeen = ep.occurredAt;
          if (!agg.lastSeen || ep.occurredAt > agg.lastSeen) agg.lastSeen = ep.occurredAt;
        }

        agg.evidence.push({
          categoryKey: m.categoryKey, signalType: m.signalType, source: ep.source,
          sourceId: ep.id, matchedTerm: m.matchedTerm, snippet: snippetAround(ep.text, m.matchedTerm),
          occurredAt: ep.occurredAt,
        });
      }
    }

    const categories = [...aggByCategory.values()];
    const totalStated = categories.reduce((s, c) => s + c.statedCount, 0);
    const totalRevealed = categories.reduce((s, c) => s + c.revealedCount, 0);

    // Wipe + rebuild (idempotent, drift-free). Evidence cascades on signal delete.
    await supabaseAdmin.from('preference_signals').delete().eq('user_id', userId);

    const nowIso = new Date().toISOString();
    if (categories.length > 0) {
      const signalRows = categories.map((c) => {
        const statedShare = totalStated > 0 ? c.statedCount / totalStated : 0;
        const revealedShare = totalRevealed > 0 ? c.revealedCount / totalRevealed : 0;
        const { trend } = classifyTrend(c.recentRevealed, c.priorRevealed, RECENT_DAYS, PRIOR_DAYS);
        const evidenceCount = c.statedCount + c.revealedCount;
        return {
          user_id: userId, type: c.type, category_key: c.categoryKey, label: c.label,
          stated_count: c.statedCount, revealed_count: c.revealedCount, evidence_count: evidenceCount,
          confidence: confidenceFromEvidence(evidenceCount),
          stated_share: Number(statedShare.toFixed(4)), revealed_share: Number(revealedShare.toFixed(4)),
          alignment_score: Number((revealedShare - statedShare).toFixed(4)),
          alignment_label: classifyAlignment({ statedCount: c.statedCount, revealedCount: c.revealedCount, statedShare, revealedShare }),
          recent_revealed: c.recentRevealed, prior_revealed: c.priorRevealed, trend,
          first_seen_at: c.firstSeen, last_seen_at: c.lastSeen,
          created_at: nowIso, updated_at: nowIso,
        };
      });

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('preference_signals').insert(signalRows).select('id, category_key');
      if (insErr) {
        logger.error({ err: insErr, userId }, 'RevealedPreference: signal insert failed');
        throw insErr;
      }

      const idByCategory = new Map<string, string>();
      for (const row of inserted ?? []) idByCategory.set(row.category_key as string, row.id as string);

      // One evidence row per (episode, category, signalType) — matches the unique key.
      const seenEvidence = new Set<string>();
      const evidenceRows: Record<string, unknown>[] = [];
      for (const c of categories) {
        const signalId = idByCategory.get(c.categoryKey);
        if (!signalId) continue;
        for (const e of c.evidence) {
          const dedupe = `${signalId}:${e.source}:${e.sourceId}:${e.signalType}`;
          if (seenEvidence.has(dedupe)) continue;
          seenEvidence.add(dedupe);
          evidenceRows.push({
            user_id: userId, signal_id: signalId, category_key: e.categoryKey, signal_type: e.signalType,
            source: e.source, source_id: e.sourceId, matched_term: e.matchedTerm.slice(0, 120),
            snippet: e.snippet.slice(0, 400), occurred_at: e.occurredAt,
          });
        }
      }
      if (evidenceRows.length > 0) {
        const { error: evErr } = await supabaseAdmin.from('preference_evidence').insert(evidenceRows);
        if (evErr) {
          logger.error({ err: evErr, userId }, 'RevealedPreference: evidence insert failed');
          throw evErr;
        }
      }
    }

    logger.info({ userId, scanned: episodes.length, categories: categories.length, totalStated, totalRevealed }, 'RevealedPreference rescan complete');

    return {
      scannedEpisodes: episodes.length,
      categories: categories.length,
      totalStated, totalRevealed,
      topRevealed: [...categories].sort((a, b) => b.revealedCount - a.revealedCount).slice(0, 10)
        .map((c) => ({ key: c.categoryKey, label: c.label, revealedCount: c.revealedCount, statedCount: c.statedCount })),
    };
  }

  /** Build the "Revealed Self" report from stored signals (no recompute). */
  async getRevealedSelf(userId: string): Promise<RevealedSelfReport> {
    const { data: signals } = await supabaseAdmin
      .from('preference_signals').select('*').eq('user_id', userId);

    const rows = (signals ?? []) as SignalRow[];
    if (rows.length === 0) {
      return { generatedAt: new Date().toISOString(), hasData: false, totals: { stated: 0, revealed: 0, categories: 0 }, sections: emptySections(), categories: [] };
    }

    // Evidence samples (one query, grouped) — avoids N+1.
    const { data: evidence } = await supabaseAdmin
      .from('preference_evidence')
      .select('signal_id, signal_type, source, source_id, snippet, occurred_at')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false });

    const evBySignal = new Map<string, EvidenceItem[]>();
    for (const e of (evidence ?? []) as RawEvidence[]) {
      const sigId = e.signal_id;
      if (!sigId) continue;
      const list = evBySignal.get(sigId) ?? [];
      if (list.length < EVIDENCE_SAMPLE) {
        list.push({ signalType: e.signal_type, source: e.source, sourceId: e.source_id, snippet: e.snippet, occurredAt: e.occurred_at });
        evBySignal.set(sigId, list);
      }
    }

    const cats: RevealedCategory[] = rows.map((r) => ({
      id: r.id, key: r.category_key, label: r.label, type: r.type,
      statedCount: r.stated_count, revealedCount: r.revealed_count, evidenceCount: r.evidence_count,
      confidence: r.confidence, statedShare: r.stated_share, revealedShare: r.revealed_share,
      alignmentScore: r.alignment_score ?? 0, alignmentLabel: r.alignment_label ?? 'aligned',
      trend: r.trend, recentRevealed: r.recent_revealed, priorRevealed: r.prior_revealed,
      sampleEvidence: evBySignal.get(r.id) ?? [],
    }));

    const totalStated = rows.reduce((s, r) => s + r.stated_count, 0);
    const totalRevealed = rows.reduce((s, r) => s + r.revealed_count, 0);
    const byKey = (list: RevealedCategory[]) => list.map((c) => c.key);

    const sections: RevealedSections = {
      saysMatter: byKey([...cats].filter((c) => c.statedCount > 0).sort((a, b) => b.statedCount - a.statedCount).slice(0, 8)),
      receivesTime: byKey([...cats].filter((c) => c.revealedCount > 0).sort((a, b) => b.revealedCount - a.revealedCount).slice(0, 8)),
      stronglyAligned: byKey(cats.filter((c) => c.alignmentLabel === 'strongly_aligned' || c.alignmentLabel === 'aligned')),
      weaklyAligned: byKey(cats.filter((c) => c.alignmentLabel === 'weakly_aligned' || c.alignmentLabel === 'stated_only')),
      emerging: byKey([...cats].filter((c) => c.trend > 0.01).sort((a, b) => b.trend - a.trend)),
      declining: byKey([...cats].filter((c) => c.trend < -0.01).sort((a, b) => a.trend - b.trend)),
    };

    return {
      generatedAt: new Date().toISOString(), hasData: true,
      totals: { stated: totalStated, revealed: totalRevealed, categories: cats.length },
      sections, categories: cats,
    };
  }

  /** Full provenance for one signal. */
  async getEvidence(userId: string, signalId: string): Promise<EvidenceItem[]> {
    const { data } = await supabaseAdmin
      .from('preference_evidence')
      .select('signal_type, source, source_id, snippet, occurred_at, matched_term')
      .eq('user_id', userId).eq('signal_id', signalId)
      .order('occurred_at', { ascending: false });
    return ((data ?? []) as RawEvidence[]).map((e) => ({
      signalType: e.signal_type, source: e.source, sourceId: e.source_id,
      snippet: e.snippet, occurredAt: e.occurred_at, matchedTerm: e.matched_term,
    }));
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface SignalRow {
  id: string; type: PreferenceType; category_key: string; label: string;
  stated_count: number; revealed_count: number; evidence_count: number; confidence: number;
  stated_share: number; revealed_share: number; alignment_score: number | null; alignment_label: string | null;
  trend: number; recent_revealed: number; prior_revealed: number;
}
interface RawEvidence { signal_id?: string; signal_type: SignalType; source: 'journal' | 'chat'; source_id: string; snippet: string; occurred_at: string | null; matched_term?: string; }
export interface EvidenceItem { signalType: SignalType; source: 'journal' | 'chat'; sourceId: string; snippet: string; occurredAt: string | null; matchedTerm?: string; }
export interface RevealedCategory {
  id: string; key: string; label: string; type: PreferenceType;
  statedCount: number; revealedCount: number; evidenceCount: number; confidence: number;
  statedShare: number; revealedShare: number; alignmentScore: number; alignmentLabel: string;
  trend: number; recentRevealed: number; priorRevealed: number; sampleEvidence: EvidenceItem[];
}
export interface RevealedSections {
  saysMatter: string[]; receivesTime: string[]; stronglyAligned: string[];
  weaklyAligned: string[]; emerging: string[]; declining: string[];
}
export interface RevealedSelfReport {
  generatedAt: string; hasData: boolean;
  totals: { stated: number; revealed: number; categories: number };
  sections: RevealedSections; categories: RevealedCategory[];
}
function emptySections(): RevealedSections {
  return { saysMatter: [], receivesTime: [], stronglyAligned: [], weaklyAligned: [], emerging: [], declining: [] };
}

export const revealedPreferenceService = new RevealedPreferenceService();
