/**
 * Narrative Moments — durable smallest memories.
 * Conversation → Moments → Scenes → Canonical Events.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { SentenceKind } from './sentenceClassifier';

export type NarrativeMomentRow = {
  id: string;
  user_id: string;
  occurred_at: string | null;
  recorded_at: string;
  sentence_kind: SentenceKind;
  summary: string;
  participants: string[];
  location: string | null;
  emotions: string[];
  evidence_unit_ids: string[];
  thread_id: string | null;
  source_message_id: string | null;
  significance_score: number;
  promoted_event_id: string | null;
  previous_moment_id?: string | null;
  next_moment_id?: string | null;
  scene_id?: string | null;
  caused_by_moment_id?: string | null;
  leads_to_moment_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UpsertMomentInput = {
  userId: string;
  summary: string;
  sentenceKind?: SentenceKind;
  occurredAt?: string | null;
  participants?: string[];
  location?: string | null;
  emotions?: string[];
  evidenceUnitIds?: string[];
  threadId?: string | null;
  sourceMessageId?: string | null;
  significanceScore?: number;
  metadata?: Record<string, unknown>;
};

function fingerprint(summary: string, occurredAt?: string | null): string {
  const day = occurredAt?.slice(0, 10) ?? 'undated';
  return `${day}:${summary.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120)}`;
}

export class NarrativeMomentService {
  /**
   * Insert or refresh a moment. Dedupes by user + fingerprint in metadata.
   */
  async upsertMoment(input: UpsertMomentInput): Promise<NarrativeMomentRow | null> {
    const summary = input.summary.replace(/\s+/g, ' ').trim();
    if (!summary) return null;

    const fp = fingerprint(summary, input.occurredAt);
    const evidenceUnitIds = Array.from(new Set(input.evidenceUnitIds ?? [])).filter(Boolean);

    try {
      const { data: existing } = await supabaseAdmin
        .from('narrative_moments')
        .select('*')
        .eq('user_id', input.userId)
        .eq('metadata->>fingerprint', fp)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const mergedEvidence = Array.from(
          new Set([...(existing.evidence_unit_ids ?? []), ...evidenceUnitIds]),
        );
        const { data: updated, error } = await supabaseAdmin
          .from('narrative_moments')
          .update({
            summary,
            significance_score: Math.max(
              existing.significance_score ?? 0,
              input.significanceScore ?? 0,
            ),
            evidence_unit_ids: mergedEvidence,
            participants: input.participants?.length
              ? input.participants
              : existing.participants,
            location: input.location ?? existing.location,
            emotions: input.emotions?.length ? input.emotions : existing.emotions,
            thread_id: input.threadId ?? existing.thread_id,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(typeof existing.metadata === 'object' && existing.metadata
                ? existing.metadata
                : {}),
              ...(input.metadata ?? {}),
              fingerprint: fp,
            },
          })
          .eq('id', existing.id)
          .eq('user_id', input.userId)
          .select('*')
          .single();

        if (error) {
          logger.warn({ error, userId: input.userId }, 'narrative_moments update failed');
          return existing as NarrativeMomentRow;
        }
        return updated as NarrativeMomentRow;
      }

      const { data, error } = await supabaseAdmin
        .from('narrative_moments')
        .insert({
          user_id: input.userId,
          occurred_at: input.occurredAt ?? null,
          sentence_kind: input.sentenceKind ?? 'EVENT',
          summary,
          participants: input.participants ?? [],
          location: input.location ?? null,
          emotions: input.emotions ?? [],
          evidence_unit_ids: evidenceUnitIds,
          thread_id: input.threadId ?? null,
          source_message_id: input.sourceMessageId ?? null,
          significance_score: input.significanceScore ?? 0,
          metadata: {
            ...(input.metadata ?? {}),
            fingerprint: fp,
          },
        })
        .select('*')
        .single();

      if (error) {
        // Table may not exist yet in some local envs — don't break chat.
        logger.warn({ error, userId: input.userId }, 'narrative_moments insert failed');
        return null;
      }
      return data as NarrativeMomentRow;
    } catch (error) {
      logger.warn({ error, userId: input.userId }, 'narrative_moments upsert error');
      return null;
    }
  }

  async markPromoted(userId: string, momentIds: string[], eventId: string): Promise<void> {
    if (!momentIds.length || !eventId) return;
    const { error } = await supabaseAdmin
      .from('narrative_moments')
      .update({
        promoted_event_id: eventId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .in('id', momentIds);

    if (error) {
      logger.warn({ error, userId, eventId }, 'narrative_moments markPromoted failed');
    }
  }
}

export const narrativeMomentService = new NarrativeMomentService();
