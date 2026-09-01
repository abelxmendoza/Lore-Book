import { createHash } from 'node:crypto';

import { logger } from '../../../logger';
import {
  extractLoreEntityRefsFromMetadata,
  extractLoreSourcesFromMetadata,
  intakeChannelFromSourceType,
  type LoreEntityRef,
  type LoreIntakeChannel,
  type LoreSourceRef,
} from '@lorebook/api-contracts';
import {
  stitchedTimelineService,
  type StitchedTimelineItem,
} from '../../chronologyV2/stitchedTimelineService';
import { supabaseAdmin } from '../../supabaseClient';

import { arcService, type ArcTrack, type ArcType, type LifeArc } from './arcService';
import { lifeArcBarEligibility, type LifeArcSuppressionReason } from './lifeArcEligibility';

const DAY_MS = 86_400_000;
const MAX_CLUSTER_GAP_DAYS = 180;
const IMPORT_CLUSTER_GAP_DAYS = 730;
const MIN_EVIDENCE = 2;
const IMPORT_MIN_EVIDENCE = 1;
const MIN_ITEM_CONFIDENCE = 0.4;
const IMPORT_MIN_ITEM_CONFIDENCE = 0.35;
const MIN_CLUSTER_SPAN_DAYS = 2;
const IMPORT_MIN_CLUSTER_SPAN_DAYS = 1;

const IMPORT_SOURCE_TYPES = new Set(['chatgpt_export', 'chatgpt_memory_handoff']);

function isImportTaggedTimelineItem(item: StitchedTimelineItem): boolean {
  const sourceType = item.sourceType ?? item.sourceKind;
  if (IMPORT_SOURCE_TYPES.has(sourceType)) return true;
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const source = metadata.source;
  if (source === 'chatgpt_export' || source === 'chatgpt_memory_handoff') return true;
  return intakeChannelFromSourceType(sourceType) === 'external_conversation';
}

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
  importTagged: boolean;
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

function evidenceProvenance(item: StitchedTimelineItem): Pick<
  LifeArcProposalEvidence,
  'sourceType' | 'intakeChannel' | 'sources' | 'entities'
> {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const sourceType = item.sourceType ?? item.sourceKind;
  return {
    sourceType,
    intakeChannel: intakeChannelFromSourceType(sourceType),
    sources: extractLoreSourcesFromMetadata(metadata, {
      sourceType,
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
    }),
    entities: extractLoreEntityRefsFromMetadata(metadata),
  };
}

function arcTypeForTrack(track: ArcTrack): Exclude<ArcType, 'occasion'> {
  if (track === 'career') return 'work';
  if (track === 'creative' || track === 'health') return 'skill';
  return 'life_era';
}

/** Pure merge patch — promote multi-day occasions so they can render as bars. */
export function buildMergeUpdatePatch(
  target: Pick<LifeArc, 'arc_type' | 'track' | 'start_date' | 'end_date' | 'confidence' | 'metadata'>,
  proposal: Pick<LifeArcProposalDraft, 'arc_type' | 'track' | 'start_date' | 'end_date' | 'confidence' | 'source_record_ids' | 'fingerprint'>,
): Partial<LifeArc> {
  const startDate = [target.start_date, proposal.start_date].filter(Boolean).sort()[0] ?? proposal.start_date;
  const endDate = [target.end_date, proposal.end_date].filter(Boolean).sort().at(-1) ?? proposal.end_date;
  const priorSourceIds = Array.isArray((target.metadata as { source_record_ids?: unknown }).source_record_ids)
    ? ((target.metadata as { source_record_ids: unknown[] }).source_record_ids.filter((id): id is string => typeof id === 'string'))
    : [];
  const spanDays = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY_MS,
  );
  const promoteOccasion = target.arc_type === 'occasion' && Number.isFinite(spanDays) && spanDays >= 2;
  const metadata: Record<string, unknown> = {
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
  };
  if (promoteOccasion) {
    delete metadata.occasion_key;
    delete metadata.occasion_day;
    metadata.promoted_from_occasion = true;
  }
  return {
    start_date: startDate,
    end_date: endDate,
    confidence: Math.max(target.confidence, proposal.confidence),
    ...(promoteOccasion
      ? { arc_type: proposal.arc_type, track: proposal.track }
      : {}),
    metadata,
  };
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
    const importTagged = isImportTaggedTimelineItem(item);
    const confidence = Math.max(0, Math.min(1, Number(item.timeConfidence ?? item.confidence ?? 0.5)));
    const minConfidence = importTagged ? IMPORT_MIN_ITEM_CONFIDENCE : MIN_ITEM_CONFIDENCE;
    if (confidence < minConfidence) return [];
    return [{
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
      sourceIds: [...new Set(item.sourceIds.length ? item.sourceIds : [item.sourceId])],
      title: item.title,
      occurredAt,
      confidence,
      dateMs,
      track: textTrack(item),
      importTagged,
      ...evidenceProvenance(item),
    }];
  });

  const proposals: LifeArcProposalDraft[] = [];
  for (const track of ['career', 'romance', 'relationships', 'creative', 'health', 'inner'] as ArcTrack[]) {
    const trackItems = dated.filter((item) => item.track === track).sort((a, b) => a.dateMs - b.dateMs);
    const clusters: DatedEvidence[][] = [];
    for (const item of trackItems) {
      const current = clusters.at(-1);
      const previous = current?.at(-1);
      const gapLimit = item.importTagged || previous?.importTagged
        ? IMPORT_CLUSTER_GAP_DAYS
        : MAX_CLUSTER_GAP_DAYS;
      if (!current || !previous || (item.dateMs - previous.dateMs) / DAY_MS > gapLimit) {
        clusters.push([item]);
      } else {
        current.push(item);
      }
    }

    for (const cluster of clusters) {
      const importCluster = cluster.some((item) => item.importTagged);
      const minEvidence = importCluster ? IMPORT_MIN_EVIDENCE : MIN_EVIDENCE;
      if (cluster.length < minEvidence) continue;
      const startMs = cluster[0].dateMs;
      const endMs = cluster.at(-1)!.dateMs;
      const minSpanDays = importCluster ? IMPORT_MIN_CLUSTER_SPAN_DAYS : MIN_CLUSTER_SPAN_DAYS;
      if (Math.round((endMs - startMs) / DAY_MS) < minSpanDays) continue;
      const evidence = cluster.map(({ dateMs: _dateMs, track: _track, importTagged: _importTagged, ...item }) => item);
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
        explanation: `${evidence.length} dated moment${evidence.length === 1 ? '' : 's'} in the ${TRACK_TITLES[track].toLowerCase()} connect across ${startDate} to ${endDate}.`,
        source_record_ids: [...new Set(evidence.flatMap((item) => item.sourceIds.map((id) => `${item.sourceKind}:${id}`)))],
        evidence,
        metadata: {
          detector: 'canonical_stitched_chronology',
          evidence_count: evidence.length,
          ...(importCluster ? { import_tagged: true } : {}),
        },
      });
    }
  }
  return proposals;
}

export const AUTO_CREATE_MIN_CONFIDENCE = 0.75;
export const AUTO_CREATE_MIN_SPAN_DAYS = 14;
export const AUTO_CREATE_MIN_EVIDENCE = 2;
export const AUTO_CREATE_STRONG_EVIDENCE = 3;

function proposalSpanDays(proposal: Pick<LifeArcProposalDraft, 'start_date' | 'end_date'>): number {
  const start = new Date(proposal.start_date).getTime();
  const end = new Date(proposal.end_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / DAY_MS);
}

/** High-signal proposals safe to materialize without per-card review. */
export function proposalReadyForAutoCreate(
  proposal: Pick<LifeArcProposalDraft, 'confidence' | 'start_date' | 'end_date' | 'evidence'>,
): boolean {
  if (proposal.confidence < AUTO_CREATE_MIN_CONFIDENCE) return false;
  if (proposal.evidence.length < AUTO_CREATE_MIN_EVIDENCE) return false;
  const spanDays = proposalSpanDays(proposal);
  if (spanDays < 2) return false;
  if (spanDays < AUTO_CREATE_MIN_SPAN_DAYS && proposal.evidence.length < AUTO_CREATE_STRONG_EVIDENCE) {
    return false;
  }
  return true;
}

function overlapsExistingArc(
  proposal: Pick<LifeArcProposalDraft, 'track' | 'start_date' | 'end_date'>,
  existing: LifeArc[],
): boolean {
  const start = new Date(proposal.start_date).getTime();
  const end = new Date(proposal.end_date).getTime();
  return existing.some((arc) => {
    if (arc.track !== proposal.track || arc.arc_type === 'occasion') return false;
    if (!arc.start_date) return false;
    const arcStart = new Date(arc.start_date).getTime();
    const arcEnd = new Date(arc.end_date ?? arc.start_date).getTime();
    return start <= arcEnd && arcStart <= end;
  });
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

  async build(
    userId: string,
    persist: boolean,
    opts: { autoCreateReady?: boolean } = {},
  ): Promise<{
    audit: LifeArcProposalAudit;
    proposals: LifeArcProposal[] | LifeArcProposalDraft[];
    autoCreated?: LifeArc[];
  }> {
    const { audit, drafts } = await this.audit(userId);
    if (!persist || drafts.length === 0) return { audit, proposals: drafts };

    const prior = await this.list(userId);
    const reviewable = drafts.filter((draft) => !prior.some((row) => proposalMatchesPriorDecision(draft, row)));
    const rows = reviewable.map((draft) => ({ ...draft, user_id: userId, status: 'pending' }));
    if (rows.length === 0) {
      const pending = await this.list(userId, 'pending');
      const autoCreated = opts.autoCreateReady ? (await this.createReadyArcs(userId)).created : undefined;
      return { audit: { ...audit, proposedArcs: 0 }, proposals: pending, autoCreated };
    }
    const { error } = await supabaseAdmin
      .from('life_arc_proposals')
      .upsert(rows, { onConflict: 'user_id,fingerprint', ignoreDuplicates: true });
    if (error) throw error;

    const autoCreated = opts.autoCreateReady ? (await this.createReadyArcs(userId)).created : undefined;
    return {
      audit: { ...audit, proposedArcs: reviewable.length },
      proposals: await this.list(userId, 'pending'),
      autoCreated,
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

  async createReadyArcs(userId: string): Promise<{ created: LifeArc[]; skipped: number }> {
    const pending = await this.list(userId, 'pending');
    const existing = await arcService.listForUser(userId);
    const created: LifeArc[] = [];
    let skipped = 0;

    for (const proposal of pending) {
      if (!proposalReadyForAutoCreate(proposal) || overlapsExistingArc(proposal, existing)) {
        skipped += 1;
        continue;
      }
      try {
        const result = await this.createArc(userId, proposal.id);
        created.push(result.arc);
        existing.push(result.arc);
      } catch (err) {
        logger.warn({ err, userId, proposalId: proposal.id }, 'lifeArcProposal auto-create skipped');
        skipped += 1;
      }
    }

    return { created, skipped };
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
    await arcService.update(userId, target.id, buildMergeUpdatePatch(target, proposal));
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
