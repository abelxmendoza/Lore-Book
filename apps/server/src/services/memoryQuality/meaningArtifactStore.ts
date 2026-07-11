/**
 * Durable store for autobiographical meaning artifacts.
 * Upsert by source_fingerprint; supersession for corrections.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  buildMeaningFingerprint,
  MEMORY_QUALITY_EXTRACTOR_VERSION,
  normalizeMeaningValue,
  type EpistemicType,
  type MeaningType,
} from './meaningArtifactIdentity';

export type MeaningArtifactRow = {
  id: string;
  user_id: string;
  source_message_id: string | null;
  source_event_id: string | null;
  meaning_type: string;
  normalized_value: string;
  display_label: string;
  confidence: number;
  evidence_quotes: string[];
  extractor_version: string;
  source_fingerprint: string;
  epistemic_type: string;
  status: string;
  supersedes_id: string | null;
  metadata: Record<string, unknown>;
};

export type UpsertMeaningInput = {
  userId: string;
  sourceMessageId: string;
  sourceEventId?: string | null;
  meaningType: MeaningType;
  displayLabel: string;
  confidence: number;
  evidenceQuotes: string[];
  epistemicType: EpistemicType;
  linkedFromType?: string;
  linkedFromValue?: string;
  linkedToType?: string;
  linkedToValue?: string;
  metadata?: Record<string, unknown>;
  extractorVersion?: string;
};

export async function upsertMeaningArtifact(
  input: UpsertMeaningInput,
): Promise<{ id: string; isNew: boolean } | null> {
  const extractorVersion = input.extractorVersion ?? MEMORY_QUALITY_EXTRACTOR_VERSION;
  const normalizedValue = normalizeMeaningValue(input.displayLabel);
  if (!normalizedValue) return null;

  const fingerprint = buildMeaningFingerprint({
    userId: input.userId,
    sourceMessageId: input.sourceMessageId,
    sourceEventId: input.sourceEventId,
    meaningType: input.meaningType,
    normalizedValue,
    extractorVersion,
  });

  const row = {
    user_id: input.userId,
    source_message_id: input.sourceMessageId,
    source_event_id: input.sourceEventId ?? null,
    meaning_type: input.meaningType,
    normalized_value: normalizedValue,
    display_label: input.displayLabel.slice(0, 300),
    confidence: Math.max(0, Math.min(0.95, input.confidence)),
    evidence_ids: input.sourceMessageId ? [input.sourceMessageId] : [],
    evidence_quotes: input.evidenceQuotes.map((q) => q.slice(0, 300)).slice(0, 5),
    extractor_version: extractorVersion,
    source_fingerprint: fingerprint,
    epistemic_type: input.epistemicType,
    status: 'ACTIVE',
    linked_from_type: input.linkedFromType ?? null,
    linked_from_value: input.linkedFromValue ?? null,
    linked_to_type: input.linkedToType ?? null,
    linked_to_value: input.linkedToValue ?? null,
    metadata: input.metadata ?? {},
    updated_at: new Date().toISOString(),
  };

  try {
    // Prefer upsert on unique (user_id, source_fingerprint) for ACTIVE rows.
    // Supabase unique is partial — use select-then-insert race-safe pattern.
    const { data: existing } = await supabaseAdmin
      .from('autobiographical_meaning_artifacts')
      .select('id, status')
      .eq('user_id', input.userId)
      .eq('source_fingerprint', fingerprint)
      .in('status', ['ACTIVE', 'USER_CORRECTED'])
      .maybeSingle();

    if (existing?.id) {
      if (existing.status === 'USER_CORRECTED') {
        // Do not overwrite user corrections on replay
        return { id: existing.id, isNew: false };
      }
      await supabaseAdmin
        .from('autobiographical_meaning_artifacts')
        .update({
          confidence: row.confidence,
          evidence_quotes: row.evidence_quotes,
          display_label: row.display_label,
          metadata: row.metadata,
          source_event_id: row.source_event_id,
          updated_at: row.updated_at,
        })
        .eq('id', existing.id)
        .eq('user_id', input.userId);
      return { id: existing.id, isNew: false };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('autobiographical_meaning_artifacts')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      if (/duplicate|unique/i.test(error.message ?? '')) {
        const { data: raced } = await supabaseAdmin
          .from('autobiographical_meaning_artifacts')
          .select('id')
          .eq('user_id', input.userId)
          .eq('source_fingerprint', fingerprint)
          .maybeSingle();
        if (raced?.id) return { id: raced.id, isNew: false };
      }
      logger.warn({ err: error, fingerprint }, 'meaningArtifactStore.upsert insert failed');
      return null;
    }
    return inserted?.id ? { id: inserted.id, isNew: true } : null;
  } catch (err) {
    logger.warn({ err, fingerprint }, 'meaningArtifactStore.upsert threw');
    return null;
  }
}

export async function listMeaningForMessage(
  userId: string,
  sourceMessageId: string,
): Promise<MeaningArtifactRow[]> {
  const { data, error } = await supabaseAdmin
    .from('autobiographical_meaning_artifacts')
    .select('*')
    .eq('user_id', userId)
    .eq('source_message_id', sourceMessageId)
    .in('status', ['ACTIVE', 'USER_CORRECTED'])
    .order('created_at', { ascending: true });
  if (error) {
    logger.debug({ err: error }, 'listMeaningForMessage failed');
    return [];
  }
  return (data ?? []) as MeaningArtifactRow[];
}

export async function listActiveMeaningForUser(
  userId: string,
  opts?: { limit?: number; meaningTypes?: string[] },
): Promise<MeaningArtifactRow[]> {
  let q = supabaseAdmin
    .from('autobiographical_meaning_artifacts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('confidence', { ascending: false })
    .limit(opts?.limit ?? 20);
  if (opts?.meaningTypes?.length) {
    q = q.in('meaning_type', opts.meaningTypes);
  }
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as MeaningArtifactRow[];
}

export type CorrectionAction =
  | 'accurate'
  | 'partially_accurate'
  | 'not_what_i_meant'
  | 'wrong_event'
  | 'wrong_person'
  | 'not_a_lasting_lesson'
  | 'temporary_behavior_only'
  | 'remove_inference';

/**
 * User correction: supersede artifact; preserve evidence via cognition_mutations + status.
 */
export async function correctMeaningArtifact(params: {
  userId: string;
  artifactId: string;
  action: CorrectionAction;
  rationale?: string;
}): Promise<{ ok: boolean; artifactId: string }> {
  const { data: art, error } = await supabaseAdmin
    .from('autobiographical_meaning_artifacts')
    .select('*')
    .eq('id', params.artifactId)
    .eq('user_id', params.userId)
    .maybeSingle();

  if (error || !art) {
    return { ok: false, artifactId: params.artifactId };
  }

  const remove =
    params.action === 'remove_inference' ||
    params.action === 'not_what_i_meant' ||
    params.action === 'wrong_event' ||
    params.action === 'wrong_person';

  const temporaryOnly = params.action === 'temporary_behavior_only' || params.action === 'not_a_lasting_lesson';

  const afterState = {
    ...art,
    status: remove ? 'REMOVED' : 'USER_CORRECTED',
    epistemic_type: 'user_corrected',
    confidence: remove ? 0 : Math.min(0.5, Number(art.confidence) * 0.5),
    metadata: {
      ...(typeof art.metadata === 'object' && art.metadata ? art.metadata : {}),
      correction_action: params.action,
      temporary_only: temporaryOnly,
      corrected_at: new Date().toISOString(),
    },
  };

  await supabaseAdmin
    .from('autobiographical_meaning_artifacts')
    .update({
      status: afterState.status,
      epistemic_type: 'user_corrected',
      confidence: afterState.confidence,
      metadata: afterState.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.artifactId)
    .eq('user_id', params.userId);

  // Append-only audit (best-effort)
  try {
    await supabaseAdmin.from('cognition_mutations').insert({
      user_id: params.userId,
      actor_id: params.userId,
      artifact_type: 'autobiographical_meaning',
      artifact_id: params.artifactId,
      mutation_type: 'CORRECTION',
      before_state: {
        status: art.status,
        confidence: art.confidence,
        epistemic_type: art.epistemic_type,
      },
      after_state: {
        status: afterState.status,
        confidence: afterState.confidence,
        action: params.action,
      },
      rationale: params.rationale ?? params.action,
    });
  } catch (err) {
    logger.debug({ err }, 'cognition_mutations write for meaning correction failed');
  }

  return { ok: true, artifactId: params.artifactId };
}
