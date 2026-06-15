/**
 * Contradiction Engine (P2-B) — service layer.
 *
 * Derives proven divergences between stated identity and revealed behavior from
 * the Revealed Preference Engine's preference_signals + preference_evidence.
 * The engine PROVES contradictions deterministically; a future LLM only explains
 * them. Persists with a lifecycle (open → resolved) so the "Resolved" section is real.
 *
 * Trust: a contradiction exists only with evidence; carries confidence,
 * evidence_count, and sample supporting episodes; phrased without accusation.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { revealedPreferenceService } from '../revealedPreference/revealedPreferenceService';
import {
  classifyDivergence, computeSeverity, confidenceFromEvidence, buildDetail, detectValueConflicts,
  type SignalView, type ContradictionType, type Section, type Severity,
} from './contradictionDetectors';
import type { PreferenceType } from '../revealedPreference/preferenceTaxonomy';

const DAY_MS = 86_400_000;
const EVIDENCE_SAMPLE = 4;

interface PrefSignalRow {
  id: string; category_key: string; label: string; type: PreferenceType;
  stated_count: number; revealed_count: number; evidence_count: number; confidence: number;
  stated_share: number; revealed_share: number; recent_revealed: number; trend: number;
  first_seen_at: string | null; last_seen_at: string | null;
}
interface PrefEvidenceRow { signal_id: string; signal_type: 'stated' | 'revealed'; source: string; source_id: string; snippet: string; occurred_at: string | null; }
interface EvidenceSample { side: 'stated' | 'revealed'; source: string; sourceId: string; snippet: string; occurredAt: string | null; }

interface DetectedContradiction {
  type: ContradictionType; section: Section; categoryKey: string; label: string;
  statedSignalId: string | null; revealedSignalId: string | null; conflictWithKey: string | null;
  statedCount: number; revealedCount: number; alignmentDelta: number; confidence: number;
  evidenceCount: number; severity: Severity; detail: string; evidence: EvidenceSample[];
  firstSeen: string | null; lastSeen: string | null;
}

export interface DetectSummary {
  categoriesEvaluated: number; contradictionsOpen: number; resolved: number;
  bySection: Record<string, number>; bySeverity: Record<string, number>;
}

class ContradictionEngine {
  /** Ensure RPE has run, then load its signals + evidence. */
  private async loadPreferenceData(userId: string): Promise<{ signals: PrefSignalRow[]; evidenceBySignal: Map<string, EvidenceSample[]> }> {
    let { data: signals } = await supabaseAdmin
      .from('preference_signals')
      .select('id, category_key, label, type, stated_count, revealed_count, evidence_count, confidence, stated_share, revealed_share, recent_revealed, trend, first_seen_at, last_seen_at')
      .eq('user_id', userId);

    if (!signals || signals.length === 0) {
      await revealedPreferenceService.rescan(userId);
      ({ data: signals } = await supabaseAdmin
        .from('preference_signals')
        .select('id, category_key, label, type, stated_count, revealed_count, evidence_count, confidence, stated_share, revealed_share, recent_revealed, trend, first_seen_at, last_seen_at')
        .eq('user_id', userId));
    }

    const { data: evidence } = await supabaseAdmin
      .from('preference_evidence')
      .select('signal_id, signal_type, source, source_id, snippet, occurred_at')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false });

    const evidenceBySignal = new Map<string, EvidenceSample[]>();
    for (const e of (evidence ?? []) as PrefEvidenceRow[]) {
      const list = evidenceBySignal.get(e.signal_id) ?? [];
      list.push({ side: e.signal_type, source: e.source, sourceId: e.source_id, snippet: e.snippet, occurredAt: e.occurred_at });
      evidenceBySignal.set(e.signal_id, list);
    }
    return { signals: (signals ?? []) as PrefSignalRow[], evidenceBySignal };
  }

  private toView(s: PrefSignalRow): SignalView {
    return {
      categoryKey: s.category_key, label: s.label, type: s.type,
      statedCount: s.stated_count, revealedCount: s.revealed_count,
      statedShare: s.stated_share, revealedShare: s.revealed_share,
      recentRevealed: s.recent_revealed, trend: s.trend,
      firstSeen: s.first_seen_at, lastSeen: s.last_seen_at,
    };
  }

  private durationDays(first: string | null, last: string | null): number {
    if (!first || !last) return 0;
    return Math.max(0, (new Date(last).getTime() - new Date(first).getTime()) / DAY_MS);
  }

  /** Build the supporting-evidence sample for a contradiction (both sides, capped). */
  private sampleEvidence(signalId: string, evidenceBySignal: Map<string, EvidenceSample[]>, preferSide?: 'stated' | 'revealed'): EvidenceSample[] {
    const all = evidenceBySignal.get(signalId) ?? [];
    if (!preferSide) return all.slice(0, EVIDENCE_SAMPLE);
    const preferred = all.filter((e) => e.side === preferSide);
    const rest = all.filter((e) => e.side !== preferSide);
    return [...preferred, ...rest].slice(0, EVIDENCE_SAMPLE);
  }

  /** Detect + persist contradictions with lifecycle. */
  async detect(userId: string): Promise<DetectSummary> {
    const { signals, evidenceBySignal } = await this.loadPreferenceData(userId);
    const byKey = new Map<string, SignalView>();
    const signalById = new Map<string, PrefSignalRow>();
    for (const s of signals) { byKey.set(s.category_key, this.toView(s)); signalById.set(s.category_key, s); }

    const detected: DetectedContradiction[] = [];

    // 1) Per-category stated-vs-revealed divergences.
    for (const s of signals) {
      const view = this.toView(s);
      const d = classifyDivergence(view);
      if (d.kind !== 'tension' && d.kind !== 'blind_spot') continue;

      const evidenceCount = d.kind === 'blind_spot' ? s.revealed_count : s.evidence_count;
      const { severity } = computeSeverity({
        evidenceCount, alignmentDelta: d.alignmentDelta,
        recentRevealed: s.recent_revealed, durationDays: this.durationDays(s.first_seen_at, s.last_seen_at),
      });
      const section = d.section!;
      detected.push({
        type: d.contradictionType!, section, categoryKey: s.category_key, label: s.label,
        statedSignalId: s.id, revealedSignalId: s.id, conflictWithKey: null,
        statedCount: s.stated_count, revealedCount: s.revealed_count, alignmentDelta: d.alignmentDelta,
        confidence: confidenceFromEvidence(evidenceCount), evidenceCount, severity,
        detail: buildDetail(section, s.label, s.stated_count, s.revealed_count),
        evidence: this.sampleEvidence(s.id, evidenceBySignal, d.kind === 'blind_spot' ? 'revealed' : 'stated'),
        firstSeen: s.first_seen_at, lastSeen: s.last_seen_at,
      });
    }

    // 2) Value conflicts (a stated value whose competing category dominates time).
    for (const c of detectValueConflicts(byKey)) {
      const valueSig = signalById.get(c.categoryKey)!;
      const rivalSig = signalById.get(c.conflictWith)!;
      const evidenceCount = valueSig.evidence_count + rivalSig.revealed_count;
      const { severity } = computeSeverity({
        evidenceCount, alignmentDelta: c.alignmentDelta,
        recentRevealed: rivalSig.recent_revealed, durationDays: this.durationDays(valueSig.first_seen_at, valueSig.last_seen_at),
      });
      detected.push({
        type: 'VALUE_CONFLICT', section: 'value_conflict', categoryKey: c.categoryKey, label: c.label,
        statedSignalId: valueSig.id, revealedSignalId: rivalSig.id, conflictWithKey: c.conflictWith,
        statedCount: valueSig.stated_count, revealedCount: rivalSig.revealed_count, alignmentDelta: c.alignmentDelta,
        confidence: confidenceFromEvidence(evidenceCount), evidenceCount, severity,
        detail: buildDetail('value_conflict', c.label, valueSig.stated_count, rivalSig.revealed_count, c.conflictLabel),
        evidence: [...this.sampleEvidence(valueSig.id, evidenceBySignal, 'stated').slice(0, 2), ...this.sampleEvidence(rivalSig.id, evidenceBySignal, 'revealed').slice(0, 2)],
        firstSeen: valueSig.first_seen_at, lastSeen: valueSig.last_seen_at,
      });
    }

    // 3) Persist with lifecycle.
    const { data: existing } = await supabaseAdmin
      .from('contradiction_signals')
      .select('id, type, category_key, status, first_detected_at')
      .eq('user_id', userId);
    const existingByKey = new Map<string, { id: string; status: string; first_detected_at: string }>();
    for (const e of existing ?? []) existingByKey.set(`${e.type}:${e.category_key}`, e as { id: string; status: string; first_detected_at: string });

    const nowIso = new Date().toISOString();
    const detectedKeys = new Set<string>();
    const upserts = detected.map((d) => {
      const key = `${d.type}:${d.categoryKey}`;
      detectedKeys.add(key);
      const prior = existingByKey.get(key);
      const status = prior?.status === 'dismissed' ? 'dismissed' : 'open';
      return {
        user_id: userId, type: d.type, category_key: d.categoryKey, label: d.label, section: d.section,
        stated_signal_id: d.statedSignalId, revealed_signal_id: d.revealedSignalId, conflict_with_key: d.conflictWithKey,
        stated_count: d.statedCount, revealed_count: d.revealedCount, alignment_delta: d.alignmentDelta,
        confidence: d.confidence, evidence_count: d.evidenceCount, severity: d.severity, status,
        detail: d.detail, evidence: d.evidence,
        first_detected_at: prior?.first_detected_at ?? nowIso, updated_at: nowIso,
      };
    });

    if (upserts.length > 0) {
      const { error } = await supabaseAdmin.from('contradiction_signals').upsert(upserts, { onConflict: 'user_id,type,category_key' });
      if (error) { logger.error({ err: error, userId }, 'Contradiction upsert failed'); throw error; }
    }

    // Anything previously open that is no longer detected → resolved.
    let resolved = 0;
    for (const [key, row] of existingByKey) {
      if (row.status === 'open' && !detectedKeys.has(key)) {
        await supabaseAdmin.from('contradiction_signals').update({ status: 'resolved', updated_at: nowIso }).eq('id', row.id);
        resolved += 1;
      }
    }

    const bySection: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const d of detected) { bySection[d.section] = (bySection[d.section] ?? 0) + 1; bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1; }

    logger.info({ userId, evaluated: signals.length, open: detected.length, resolved }, 'Contradiction detect complete');
    return { categoriesEvaluated: signals.length, contradictionsOpen: detected.length, resolved, bySection, bySeverity };
  }

  /** Read the Contradictions report (does NOT recompute). */
  async getReport(userId: string): Promise<ContradictionReport> {
    const [{ data: contradictions }, { signals, evidenceBySignal }] = await Promise.all([
      supabaseAdmin.from('contradiction_signals').select('*').eq('user_id', userId),
      this.loadPreferenceData(userId),
    ]);

    const rows = (contradictions ?? []) as ContradictionRow[];
    const items: ContradictionItem[] = rows.map(toItem);
    const open = items.filter((i) => i.status === 'open');

    // Per-category assessment (Phase 7): aligned | tension | blind_spot | insufficient.
    const assessments: CategoryAssessment[] = signals.map((s) => {
      const d = classifyDivergence(this.toView(s));
      return {
        key: s.category_key, label: s.label, type: s.type, statedCount: s.stated_count, revealedCount: s.revealed_count,
        status: d.kind, confidence: s.confidence,
        sampleEvidence: (evidenceBySignal.get(s.id) ?? []).slice(0, EVIDENCE_SAMPLE),
      };
    }).sort((a, b) => b.revealedCount - a.revealedCount);

    return {
      generatedAt: new Date().toISOString(),
      totals: { contradictions: open.length, resolved: items.filter((i) => i.status === 'resolved').length, categories: signals.length },
      sections: {
        strongAlignment: assessments.filter((a) => a.status === 'aligned').map((a) => a.key),
        tensions: open.filter((i) => i.section === 'tension' || i.section === 'value_conflict').map((i) => i.id),
        blindSpots: open.filter((i) => i.section === 'blind_spot').map((i) => i.id),
        identityConflicts: open.filter((i) => i.section === 'identity_conflict').map((i) => i.id),
        resolved: items.filter((i) => i.status === 'resolved').map((i) => i.id),
      },
      contradictions: items,
      assessments,
    };
  }

  /** Phase 6 — candidate epiphanies for the future Epiphany Engine. */
  async getEpiphanyCandidates(userId: string): Promise<EpiphanyCandidate[]> {
    const { data } = await supabaseAdmin
      .from('contradiction_signals')
      .select('id, type, section, category_key, label, confidence, evidence_count, severity, status, alignment_delta, detail')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('confidence', { ascending: false });

    return ((data ?? []) as ContradictionRow[])
      .filter((r) =>
        // Strong blind spots (revealed_only, high confidence/evidence) OR persistent high-severity divergences.
        (r.section === 'blind_spot' && r.confidence >= 0.7 && r.evidence_count >= 5) ||
        (r.severity === 'high'),
      )
      .map((r) => ({
        contradictionId: r.id, type: r.type, section: r.section, categoryKey: r.category_key, label: r.label,
        confidence: r.confidence, evidenceCount: r.evidence_count, severity: r.severity,
        kind: r.section === 'blind_spot' ? 'unstated_lived_priority' : 'persistent_divergence',
        seed: r.detail,
      }));
  }

  async getEvidence(userId: string, contradictionId: string): Promise<{ detail: string; evidence: EvidenceSample[] } | null> {
    const { data } = await supabaseAdmin
      .from('contradiction_signals').select('detail, evidence').eq('user_id', userId).eq('id', contradictionId).single();
    if (!data) return null;
    return { detail: data.detail as string, evidence: (data.evidence ?? []) as EvidenceSample[] };
  }
}

// ── Types ───────────────────────────────────────────────────────────────────
interface ContradictionRow {
  id: string; type: ContradictionType; category_key: string; label: string; section: Section;
  conflict_with_key: string | null; stated_count: number; revealed_count: number; alignment_delta: number;
  confidence: number; evidence_count: number; severity: Severity; status: string; detail: string;
  evidence: EvidenceSample[]; first_detected_at: string;
}
export interface ContradictionItem {
  id: string; type: ContradictionType; categoryKey: string; label: string; section: Section;
  conflictWithKey: string | null; statedCount: number; revealedCount: number; alignmentDelta: number;
  confidence: number; evidenceCount: number; severity: Severity; status: string; detail: string;
  evidence: EvidenceSample[]; firstDetectedAt: string;
}
function toItem(r: ContradictionRow): ContradictionItem {
  return {
    id: r.id, type: r.type, categoryKey: r.category_key, label: r.label, section: r.section,
    conflictWithKey: r.conflict_with_key, statedCount: r.stated_count, revealedCount: r.revealed_count,
    alignmentDelta: r.alignment_delta, confidence: r.confidence, evidenceCount: r.evidence_count,
    severity: r.severity, status: r.status, detail: r.detail, evidence: r.evidence ?? [], firstDetectedAt: r.first_detected_at,
  };
}
export interface CategoryAssessment {
  key: string; label: string; type: PreferenceType; statedCount: number; revealedCount: number;
  status: 'aligned' | 'tension' | 'blind_spot' | 'insufficient'; confidence: number; sampleEvidence: EvidenceSample[];
}
export interface ContradictionReport {
  generatedAt: string;
  totals: { contradictions: number; resolved: number; categories: number };
  sections: { strongAlignment: string[]; tensions: string[]; blindSpots: string[]; identityConflicts: string[]; resolved: string[] };
  contradictions: ContradictionItem[];
  assessments: CategoryAssessment[];
}
export interface EpiphanyCandidate {
  contradictionId: string; type: ContradictionType; section: Section; categoryKey: string; label: string;
  confidence: number; evidenceCount: number; severity: Severity; kind: string; seed: string;
}

export const contradictionEngine = new ContradictionEngine();
