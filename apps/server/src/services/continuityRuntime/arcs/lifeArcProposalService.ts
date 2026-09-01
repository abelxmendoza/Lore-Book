import { createHash } from 'node:crypto';

import { logger } from '../../../logger';
import {
  stitchedTimelineService,
  type StitchedTimelineItem,
} from '../../chronologyV2/stitchedTimelineService';
import { supabaseAdmin } from '../../supabaseClient';

import { buildLoreEvidenceProvenance } from '../../provenance/loreSourceExtractor';
import type { LoreEntityRef, LoreIntakeChannel, LoreSourceRef } from '@lorebook/api-contracts';
import { arcService, type ArcTrack, type ArcType, type LifeArc } from './arcService';
import { lifeArcBarEligibility, type LifeArcSuppressionReason } from './lifeArcEligibility';

const DAY_MS = 86_400_000;
const MAX_CLUSTER_GAP_DAYS = 180;
const MIN_EVIDENCE = 2;

export type LifeArcProposalEvidence = {
  sourceKind: StitchedTimelineItem['sourceKind'];
  sourceId: string;
  sourceIds: string[];
  title: string;
  occurredAt: string;
  confidence: number;
  sourceType: string;
  intakeChannel: LoreIntakeChannel;
  sources: LoreSourceRef[];
  entities: LoreEntityRef[];
};

export type LifeArcProposalDraft = {
  fingerprint: string;
  title: string;
  arc_type: Exclude<ArcType, 'occasion'>;
  track: ArcTrack;
  start_date: string;
  end_date: string;
  confidence: number;
  explanation: string;
  source_record_ids: string[];
  evidence: LifeArcProposalEvidence[];
  metadata: Record<string, unknown>;
};

export type LifeArcProposal = LifeArcProposalDraft & {
  id: string;
  user_id: string;
  status: 'pending' | 'created' | 'merged' | 'dismissed';
  created_arc_id: string | null;
  merged_into_arc_id: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LifeArcProposalAudit = {
  canonicalItems: number;
  datedItems: number;
  eligibleItems: number;
  unresolvedItems: number;
  existingArcs: number;
  drawableArcs: number;
  suppressedArcs: Partial<Record<LifeArcSuppressionReason, number>>;
  proposedArcs: number;
  dataErrors: Array<{ source: string; message: string }>;
};

type DatedEvidence = LifeArcProposalEvidence & {
  dateMs: number;
  track: ArcTrack;
};

const TRACK_TITLES: Record<ArcTrack, string> = {
  career: 'Career chapter',
  romance: 'Love and dating chapter',
  relationships: 'Relationships chapter',
  creative: 'Creative chapter',
  health: 'Health chapter',
  inner: 'Inner life chapter',
  mixed: 'Life chapter',
  custom: 'Life chapter',
};

function textTrack(item: StitchedTimelineItem): ArcTrack {
  const explicit = item.timelineTrack?.toLowerCase();
  if (explicit && ['career', 'romance', 'relationships', 'creative', 'health', 'inner', 'mixed', 'custom'].includes(explicit)) {
    return explicit as ArcTrack;
  }
  const text = `${item.title} ${item.body} ${(item.tags ?? []).join(' ')}`.toLowerCase();
  if (/\b(job|work|career|company|interview|hired|project|business|school|college|university)\b/.test(text)) return 'career';
  if (/\b(date|dating|romance|romantic|girlfriend|boyfriend|partner|breakup|engaged|married)\b/.test(text)) return 'romance';
  if (/\b(friend|family|mother|father|sister|brother|community|relationship)\b/.test(text)) return 'relationships';
  if (/\b(write|writing|music|art|design|photo|creative|paint|draw)\b/.test(text)) return 'creative';
  if (/\b(health|doctor|hospital|therapy|gym|workout|running|injury|recovery)\b/.test(text)) return 'health';
  return 'inner';
}

function arcTypeForTrack(track: ArcTrack): Exclude<ArcType, 'occasion'> {
  if (track === 'career') return 'work';
  if (track === 'creative' || track === 'health') return 'skill';
  return 'life_era';
}

function proposalFingerprint(track: ArcTrack, evidence: LifeArcProposalEvidence[]): string {
  const stableIds = evidence
    .flatMap((item) => item.sourceIds.map((id) => `${item.sourceKind}:${id}`))
    .sort();
  return createHash('sha256').update(`${track}|${stableIds.join('|')}`).digest('hex');
}

function asDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function proposalTitle(track: ArcTrack, startMs: number, endMs: number): string {
  const startYear = new Date(startMs).getUTCFullYear();
  const endYear = new Date(endMs).getUTCFullYear();
  const years = startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
  return `${TRACK_TITLES[track]} · ${years}`;
}

export function buildArcProposalsFromItems(items: StitchedTimelineItem[]): LifeArcProposalDraft[] {
  const dated: DatedEvidence[] = items.flatMap((item) => {
    const occurredAt = item.occurredAt ?? item.temporalProjection?.occurredStart ?? null;
    if (!occurredAt || item.occurrenceStatus === 'unresolved' || item.projectionRole === 'unresolved') return [];
    const dateMs = new Date(occurredAt).getTime();
    if (!Number.isFinite(dateMs)) return [];
    const confidence = Math.max(0, Math.min(1, Number(item.timeConfidence ?? item.confidence ?? 0.5)));
    if (confidence < 0.4) return [];
    return [{
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
      sourceIds: [...new Set(item.sourceIds.length ? item.sourceIds : [item.sourceId])],
      title: item.title,
      occurredAt,
      confidence,
      dateMs,
      track: textTrack(item),
      ...buildLoreEvidenceProvenance(item),
    }];
  });

  const proposals: LifeArcProposalDraft[] = [];
  for (const track of ['career', 'romance', 'relationships', 'creative', 'health', 'inner'] as ArcTrack[]) {
    const trackItems = dated.filter((item) => item.track === track).sort((a, b) => a.dateMs - b.dateMs);
    const clusters: DatedEvidence[][] = [];
    for (const item of trackItems) {
      const current = clusters.at(-1);
      const previous = current?.at(-1);
      if (!current || !previous || (item.dateMs - previous.dateMs) / DAY_MS > MAX_CLUSTER_GAP_DAYS) {
        clusters.push([item]);
      } else {
        current.push(item);
      }
    }

    for (const cluster of clusters) {
      if (cluster.length < MIN_EVIDENCE) continue;
      const startMs = cluster[0].dateMs;
      const endMs = cluster.at(-1)!.dateMs;
      if (Math.round((endMs - startMs) / DAY_MS) < 2) continue;
      const evidence = cluster.map(({ dateMs: _dateMs, track: _track, ...item }) => item);
      const confidence = Number((evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length).toFixed(3));
      const startDate = asDateOnly(startMs);
      const endDate = asDateOnly(endMs);
      proposals.push({
        fingerprint: proposalFingerprint(track, evidence),
        title: proposalTitle(track, startMs, endMs),
        arc_type: arcTypeForTrack(track),
        track,
        start_date: startDate,
        end_date: endDate,
        confidence,
        explanation: `${evidence.length} dated moments in the ${TRACK_TITLES[track].toLowerCase()} connect across ${startDate} to ${endDate}.`,
        source_record_ids: [...new Set(evidence.flatMap((item) => item.sourceIds.map((id) => `${item.sourceKind}:${id}`)))],
        evidence,
        metadata: { detector: 'canonical_stitched_chronology', evidence_count: evidence.length },
      });
    }
  }
  return proposals;
}

export function proposalMatchesPriorDecision(
  draft: LifeArcProposalDraft,
  prior: Pick<LifeArcProposal, 'track' | 'start_date' | 'end_date' | 'source_record_ids' | 'status'>,
): boolean {
  if (prior.status === 'pending' || prior.track !== draft.track) return false;
  const draftStart = new Date(draft.start_date).getTime();
  const draftEnd = new Date(draft.end_date).getTime();
  const priorStart = new Date(prior.start_date).getTime();
  const priorEnd = new Date(prior.end_date).getTime();
  const datesOverlap = draftStart <= priorEnd && priorStart <= draftEnd;
  if (!datesOverlap) return false;
  const priorIds = new Set(prior.source_record_ids);
  return draft.source_record_ids.some((id) => priorIds.has(id));
}

function countSuppressed(arcs: LifeArc[]): Partial<Record<LifeArcSuppressionReason, number>> {
  const counts: Partial<Record<LifeArcSuppressionReason, number>> = {};
  for (const arc of arcs) {
    const result = lifeArcBarEligibility(arc);
    if (result.reason) counts[result.reason] = (counts[result.reason] ?? 0) + 1;
  }
  return counts;
}

export class LifeArcProposalService {
  async audit(userId: string): Promise<{ audit: LifeArcProposalAudit; drafts: LifeArcProposalDraft[] }> {
    const [timeline, arcs] = await Promise.all([
      stitchedTimelineService.getStitchedTimeline(userId, { scope_type: 'global' }),
      arcService.listForUser(userId),
    ]);
    const drafts = buildArcProposalsFromItems(timeline.items);
    const datedItems = timeline.items.filter((item) => {
      const date = item.occurredAt ?? item.temporalProjection?.occurredStart;
      return Boolean(date && Number.isFinite(new Date(date).getTime()));
    }).length;
    const dataErrors = (timeline.data_errors ?? []).filter((error) => !(
      error.source === 'timeline_events'
      && /does not exist|schema cache|PGRST205/i.test(error.message)
    ));
    return {
      drafts,
      audit: {
        canonicalItems: timeline.items.length,
        datedItems,
        eligibleItems: drafts.reduce((sum, draft) => sum + draft.evidence.length, 0),
        unresolvedItems: timeline.unresolved_items?.length ?? 0,
        existingArcs: arcs.length,
        drawableArcs: arcs.filter((arc) => lifeArcBarEligibility(arc).drawable).length,
        suppressedArcs: countSuppressed(arcs),
        proposedArcs: drafts.length,
        dataErrors,
      },
    };
  }

  async build(userId: string, persist: boolean): Promise<{ audit: LifeArcProposalAudit; proposals: LifeArcProposal[] | LifeArcProposalDraft[] }> {
    const { audit, drafts } = await this.audit(userId);
    if (!persist || drafts.length === 0) return { audit, proposals: drafts };

    const prior = await this.list(userId);
    const reviewable = drafts.filter((draft) => !prior.some((row) => proposalMatchesPriorDecision(draft, row)));
    const rows = reviewable.map((draft) => ({ ...draft, user_id: userId, status: 'pending' }));
    if (rows.length === 0) {
      return { audit: { ...audit, proposedArcs: 0 }, proposals: await this.list(userId, 'pending') };
    }
    const { error } = await supabaseAdmin
      .from('life_arc_proposals')
      .upsert(rows, { onConflict: 'user_id,fingerprint', ignoreDuplicates: true });
    if (error) throw error;
    return {
      audit: { ...audit, proposedArcs: reviewable.length },
      proposals: await this.list(userId, 'pending'),
    };
  }

  async list(userId: string, status?: LifeArcProposal['status']): Promise<LifeArcProposal[]> {
    let query = supabaseAdmin.from('life_arc_proposals').select('*').eq('user_id', userId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('start_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as LifeArcProposal[];
  }

  async get(userId: string, proposalId: string): Promise<LifeArcProposal | null> {
    const { data, error } = await supabaseAdmin
      .from('life_arc_proposals')
      .select('*')
      .eq('user_id', userId)
      .eq('id', proposalId)
      .maybeSingle();
    if (error) throw error;
    return (data as LifeArcProposal | null) ?? null;
  }

  async updateDraft(userId: string, proposalId: string, patch: Partial<Pick<LifeArcProposalDraft, 'title' | 'track' | 'arc_type' | 'start_date' | 'end_date'>>): Promise<LifeArcProposal> {
    const { data, error } = await supabaseAdmin
      .from('life_arc_proposals')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', proposalId)
      .eq('status', 'pending')
      .select('*')
      .single();
    if (error) throw error;
    return data as LifeArcProposal;
  }

  async createArc(userId: string, proposalId: string): Promise<{ proposal: LifeArcProposal; arc: LifeArc }> {
    const proposal = await this.requirePending(userId, proposalId);
    const arc = await this.createCanonicalArc(userId, proposal);
    await this.linkCanonicalEvidence(userId, arc.id, proposal);
    const decided = await this.decide(userId, proposalId, { status: 'created', created_arc_id: arc.id });
    return { proposal: decided, arc };
  }

  private async linkCanonicalEvidence(userId: string, arcId: string, proposal: LifeArcProposal): Promise<void> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const item of proposal.evidence) {
      if (item.sourceKind === 'timeline_event' || !uuid.test(item.sourceId)) continue;
      const row = {
        user_id: userId,
        arc_id: arcId,
        resolved_event_id: item.sourceKind === 'resolved_event' ? item.sourceId : null,
        journal_entry_id: item.sourceKind === 'journal_entry' ? item.sourceId : null,
        user_presence: item.sourceKind === 'journal_entry' ? 'attended' : 'unknown',
        temporal_role: 'during',
        sort_time: item.occurredAt,
        importance_score: item.confidence,
        metadata: { proposal_fingerprint: proposal.fingerprint },
      };
      const { error } = await supabaseAdmin.from('arc_event_links').insert(row);
      if (error && error.code !== '23505') throw error;
    }
  }

  private async createCanonicalArc(userId: string, proposal: LifeArcProposal): Promise<LifeArc> {
    const existing = await this.findCanonicalArc(userId, proposal.fingerprint);
    if (existing) return existing;

    const metadata = {
      ...proposal.metadata,
      proposal_fingerprint: proposal.fingerprint,
      source_record_ids: proposal.source_record_ids,
    };
    const { data, error } = await supabaseAdmin
      .from('life_arcs')
      .insert({
        user_id: userId,
        title: proposal.title,
        arc_type: proposal.arc_type,
        track: proposal.track,
        start_date: proposal.start_date,
        end_date: proposal.end_date,
        confidence: proposal.confidence,
        summary: proposal.explanation,
        source: 'inferred',
        metadata,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') {
        const raced = await this.findCanonicalArc(userId, proposal.fingerprint);
        if (raced) return raced;
      }
      throw error;
    }
    const created = await arcService.getById(userId, data.id as string);
    if (!created) throw new Error('Created arc could not be reloaded');
    return created;
  }

  private async findCanonicalArc(userId: string, fingerprint: string): Promise<LifeArc | null> {
    const { data, error } = await supabaseAdmin
      .from('life_arcs')
      .select('id')
      .eq('user_id', userId)
      .contains('metadata', { proposal_fingerprint: fingerprint })
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return null;
    return arcService.getById(userId, data.id as string);
  }

  async merge(userId: string, proposalId: string, arcId: string): Promise<LifeArcProposal> {
    const proposal = await this.requirePending(userId, proposalId);
    const target = await arcService.getById(userId, arcId);
    if (!target) throw new Error('Target arc not found');
    const startDate = [target.start_date, proposal.start_date].filter(Boolean).sort()[0] ?? proposal.start_date;
    const endDate = [target.end_date, proposal.end_date].filter(Boolean).sort().at(-1) ?? proposal.end_date;
    const priorSourceIds = Array.isArray((target.metadata as { source_record_ids?: unknown }).source_record_ids)
      ? ((target.metadata as { source_record_ids: unknown[] }).source_record_ids.filter((id): id is string => typeof id === 'string'))
      : [];
    await arcService.update(userId, target.id, {
      start_date: startDate,
      end_date: endDate,
      confidence: Math.max(target.confidence, proposal.confidence),
      metadata: {
        ...target.metadata,
        source_record_ids: [...new Set([...priorSourceIds, ...proposal.source_record_ids])],
        merged_proposal_fingerprints: [
          ...new Set([
            ...(Array.isArray(target.metadata.merged_proposal_fingerprints)
              ? target.metadata.merged_proposal_fingerprints.filter((value): value is string => typeof value === 'string')
              : []),
            proposal.fingerprint,
          ]),
        ],
      },
    });
    await this.linkCanonicalEvidence(userId, target.id, proposal);
    return this.decide(userId, proposalId, { status: 'merged', merged_into_arc_id: target.id });
  }

  async dismiss(userId: string, proposalId: string, reason?: string): Promise<LifeArcProposal> {
    await this.requirePending(userId, proposalId);
    return this.decide(userId, proposalId, { status: 'dismissed', decision_reason: reason ?? null });
  }

  private async requirePending(userId: string, proposalId: string): Promise<LifeArcProposal> {
    const proposal = await this.get(userId, proposalId);
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'pending') throw new Error(`Proposal already ${proposal.status}`);
    return proposal;
  }

  private async decide(
    userId: string,
    proposalId: string,
    patch: { status: LifeArcProposal['status']; created_arc_id?: string; merged_into_arc_id?: string; decision_reason?: string | null },
  ): Promise<LifeArcProposal> {
    const { data, error } = await supabaseAdmin
      .from('life_arc_proposals')
      .update({ ...patch, decided_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', proposalId)
      .eq('status', 'pending')
      .select('*')
      .single();
    if (error) {
      logger.error({ error, userId, proposalId }, 'lifeArcProposal decision failed');
      throw error;
    }
    return data as LifeArcProposal;
  }
}

export const lifeArcProposalService = new LifeArcProposalService();
