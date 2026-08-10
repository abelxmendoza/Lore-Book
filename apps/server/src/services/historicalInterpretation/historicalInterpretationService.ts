import { createHash } from 'node:crypto';

import { logger } from '../../logger';
import {
  CANONICAL_MUTATION_CONTRACT_VERSION,
  canonicalMutationLayer,
  type AtomicCanonicalMutationAdapter,
  type CanonicalMutationApplyResult,
  type CanonicalMutationDecision,
} from '../canonicalMutation';
import { supabaseAdmin } from '../supabaseClient';

import { detectHistoricalInterpretationCandidate, projectHistoricalInterpretationTimeline } from './historicalInterpretationCompiler';
import {
  HISTORICAL_INTERPRETATION_VERSION,
  type HistoricalInterpretationRecord,
  type HistoricalInterpretationTimeline,
  type InterpretationCandidate,
} from './historicalInterpretationTypes';

function fingerprint(eventRecordId: string, interpretation: string): string {
  return createHash('sha256').update(`${eventRecordId}:${interpretation.toLowerCase()}`).digest('hex');
}

function fromRow(row: Record<string, any>): HistoricalInterpretationRecord {
  const metadata = (row.metadata ?? {}) as Record<string, any>;
  const historical = (metadata.historical_interpretation ?? {}) as Record<string, any>;
  return {
    id: String(row.id), userId: String(row.user_id), eventRecordId: String(row.event_record_id),
    resolvedEventId: historical.resolved_event_id ? String(historical.resolved_event_id) : null,
    interpretation: String(row.narrative_text ?? ''), kind: historical.kind ?? 'MEANING',
    author: historical.author ?? 'LOREBOOK', status: historical.status ?? 'PROPOSED',
    confidence: Number(historical.confidence ?? 0.6), createdAt: String(row.recorded_at ?? row.created_at),
    replacesId: historical.replaces_id ? String(historical.replaces_id) : null,
    whyChanged: historical.why_changed ? String(historical.why_changed) : null,
    supportingEvidence: Array.isArray(historical.supporting_evidence) ? historical.supporting_evidence : [],
    contradictingEvidence: Array.isArray(historical.contradicting_evidence) ? historical.contradicting_evidence : [],
    sourceConversationMessageId: historical.source_conversation_message_id ? String(historical.source_conversation_message_id) : null,
  };
}

export function buildInterpretationConfirmationDecision(input: {
  userId: string;
  interpretation: HistoricalInterpretationRecord;
}): CanonicalMutationDecision {
  const record = input.interpretation;
  return canonicalMutationLayer.evaluate({
    version: CANONICAL_MUTATION_CONTRACT_VERSION,
    userId: input.userId,
    actorId: input.userId,
    requestorProjection: 'narrative_projection',
    target: {
      artifactType: 'narrative_account', artifactId: record.id,
      field: 'metadata.historical_interpretation.status', ownerProjection: 'narrative_projection',
    },
    intent: 'CONFIRM', category: 'NARRATIVE', previousValue: record.status, proposedValue: 'CANONICAL',
    authority: 'USER_CONFIRMED',
    evidence: record.supportingEvidence.map((evidence) => ({ ...evidence, relation: 'SUPPORTS' as const })),
    risk: 'MEDIUM', reason: 'REVIEW_APPROVAL',
    affectedProjections: ['narrative_projection', 'identity_snapshot', 'context_plan_cache', 'publishing_projection'],
    rationale: 'The user confirmed this as their current interpretation of the historical event.',
  });
}

class HistoricalInterpretationService {
  async proposeUserInterpretation(input: {
    userId: string;
    eventRecordId: string;
    resolvedEventId?: string | null;
    text: string;
    sourceConversationMessageId?: string | null;
    threadId?: string | null;
    recordedAt?: string;
    candidate?: InterpretationCandidate;
  }): Promise<HistoricalInterpretationRecord | null> {
    const candidate = input.candidate ?? detectHistoricalInterpretationCandidate(input.text);
    if (!candidate) return null;
    const sourceFingerprint = fingerprint(input.eventRecordId, candidate.interpretation);
    const { data: existing } = await supabaseAdmin
      .from('narrative_accounts')
      .select('*')
      .eq('user_id', input.userId)
      .eq('event_record_id', input.eventRecordId)
      .eq('account_type', 'later_interpretation')
      .eq('metadata->historical_interpretation->>fingerprint', sourceFingerprint)
      .maybeSingle();
    if (existing) return fromRow(existing as Record<string, any>);

    const recordedAt = input.recordedAt ?? new Date().toISOString();
    const metadata = {
      source: 'event_chat',
      event_id: input.resolvedEventId ?? null,
      thread_id: input.threadId ?? null,
      historical_fact_immutable: true,
      historical_interpretation: {
        version: HISTORICAL_INTERPRETATION_VERSION,
        fingerprint: sourceFingerprint,
        resolved_event_id: input.resolvedEventId ?? null,
        author: 'USER', status: 'PROPOSED', kind: candidate.kind,
        confidence: candidate.confidence, replaces_id: null,
        why_changed: candidate.whyChanged,
        supporting_evidence: input.sourceConversationMessageId
          ? [{ sourceType: 'conversation_message', sourceId: input.sourceConversationMessageId }]
          : [{ sourceType: 'manual', sourceId: input.eventRecordId }],
        contradicting_evidence: [],
        source_conversation_message_id: input.sourceConversationMessageId ?? null,
      },
    };
    const { data, error } = await supabaseAdmin.from('narrative_accounts').insert({
      user_id: input.userId,
      event_record_id: input.eventRecordId,
      account_type: 'later_interpretation',
      narrative_text: candidate.interpretation,
      recorded_at: recordedAt,
      metadata,
    }).select('*').single();
    if (error || !data) {
      logger.warn({ error, userId: input.userId, eventRecordId: input.eventRecordId }, 'Historical interpretation proposal write failed');
      return null;
    }
    return fromRow(data as Record<string, any>);
  }

  async getTimeline(userId: string, eventRecordId: string): Promise<HistoricalInterpretationTimeline> {
    const { data, error } = await supabaseAdmin.from('narrative_accounts')
      .select('*').eq('user_id', userId).eq('event_record_id', eventRecordId)
      .eq('account_type', 'later_interpretation').order('recorded_at', { ascending: true });
    if (error) {
      logger.warn({ error, userId, eventRecordId }, 'Historical interpretation timeline read failed');
      return projectHistoricalInterpretationTimeline(eventRecordId, []);
    }
    return projectHistoricalInterpretationTimeline(eventRecordId, (data ?? []).map((row) => fromRow(row as Record<string, any>)));
  }

  async confirmWithAtomicAdapter(input: {
    userId: string;
    interpretation: HistoricalInterpretationRecord;
    adapter: AtomicCanonicalMutationAdapter;
  }): Promise<CanonicalMutationApplyResult> {
    const decision = buildInterpretationConfirmationDecision(input);
    return canonicalMutationLayer.apply(decision.envelope, input.adapter);
  }
}

export const historicalInterpretationService = new HistoricalInterpretationService();
