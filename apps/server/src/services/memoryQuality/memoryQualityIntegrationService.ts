/**
 * Durable Memory Quality stage — not fire-and-forget.
 * Writes autobiographical_meaning_artifacts (authority) + optional metadata projection.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  extractAutobiographicalMeaning,
  meaningToEventMetadata,
  type AutobiographicalMeaning,
} from './autobiographicalMeaningExtractor';
import { extractRelationshipDimensions } from './relationshipDimensions';
import { extractProgression } from './progressionDetector';
import { extractPreferenceLifecycle } from './preferenceStability';
import { computeClaimConfidence } from './confidenceModel';
import { upsertMeaningArtifact } from './meaningArtifactStore';
import {
  MEMORY_QUALITY_EXTRACTOR_VERSION,
  type EpistemicType,
  type MeaningType,
} from './meaningArtifactIdentity';

export type MemoryQualityStageStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'RETRYABLE_FAILED'
  | 'PERMANENT_FAILED';

export type MemoryQualityPayload = {
  meaning: AutobiographicalMeaning;
  relationships: ReturnType<typeof extractRelationshipDimensions>;
  progressions: ReturnType<typeof extractProgression>;
  preferenceLifecycle: ReturnType<typeof extractPreferenceLifecycle>;
  extractorVersion: string;
  extractedAt: string;
};

export type MemoryQualityRunResult = {
  status: MemoryQualityStageStatus;
  artifactIds: string[];
  created: number;
  reused: number;
  payload: MemoryQualityPayload | null;
  error?: string;
};

const MIN_CONFIDENCE = 0.55;
const MAX_ARTIFACTS_PER_MESSAGE = 12;

export function extractMemoryQualityBundle(text: string): MemoryQualityPayload {
  const meaning = extractAutobiographicalMeaning(text);
  const firstPerson = /\bI\b/.test(text);
  for (const n of meaning.nodes) {
    n.confidence = computeClaimConfidence({
      base: n.confidence,
      evidenceCount: 1,
      firstPerson,
    }).confidence;
  }
  return {
    meaning,
    relationships: extractRelationshipDimensions(text),
    progressions: extractProgression(text),
    preferenceLifecycle: extractPreferenceLifecycle(text),
    extractorVersion: MEMORY_QUALITY_EXTRACTOR_VERSION,
    extractedAt: new Date().toISOString(),
  };
}

function mapNodeKind(kind: string): MeaningType | null {
  switch (kind) {
    case 'lesson':
      return 'lesson';
    case 'behavior_change':
      return 'behavior_change';
    case 'identity_growth':
      return 'identity_growth';
    case 'intent':
      return 'intent';
    case 'outcome':
      return 'outcome';
    case 'future_continuity':
      return 'future_implication';
    case 'emotion':
      return 'emotion';
    case 'motivation':
      return 'motivation';
    case 'past_event':
    case 'current_event':
      return null; // structural anchors only; links carry continuity
    default:
      return null;
  }
}

/**
 * Durable Memory Quality processing for a single message.
 * Idempotent via source_fingerprint unique index.
 */
export async function runMemoryQualityForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  opts?: { sourceEventId?: string | null; jobId?: string },
): Promise<MemoryQualityRunResult> {
  if (!text.trim() || text.trim().length < 8) {
    return { status: 'SKIPPED', artifactIds: [], created: 0, reused: 0, payload: null };
  }

  try {
    const bundle = extractMemoryQualityBundle(text);
    const hasSignal =
      bundle.meaning.nodes.length > 0 ||
      bundle.relationships.length > 0 ||
      bundle.progressions.length > 0 ||
      bundle.preferenceLifecycle.length > 0;

    if (!hasSignal) {
      await projectMetadata(userId, sourceMessageId, bundle, []);
      return { status: 'SKIPPED', artifactIds: [], created: 0, reused: 0, payload: bundle };
    }

    // Resolve best event for attachment
    let sourceEventId = opts?.sourceEventId ?? null;
    if (!sourceEventId) {
      const { data: ev } = await supabaseAdmin
        .from('resolved_events')
        .select('id')
        .eq('user_id', userId)
        .eq('source_message_id', sourceMessageId)
        .limit(1)
        .maybeSingle();
      sourceEventId = ev?.id ?? null;
      if (!sourceEventId) {
        const { data: recent } = await supabaseAdmin
          .from('resolved_events')
          .select('id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        sourceEventId = recent?.id ?? null;
      }
    }

    const artifactIds: string[] = [];
    let created = 0;
    let reused = 0;
    let writes = 0;

    // Consolidate: prefer distinct meaning types; skip near-duplicate labels
    const seenValues = new Set<string>();

    const tryUpsert = async (
      meaningType: MeaningType,
      displayLabel: string,
      confidence: number,
      evidence: string,
      epistemic: EpistemicType,
      extra?: { linkedFromType?: string; linkedFromValue?: string; linkedToType?: string; linkedToValue?: string },
    ) => {
      if (writes >= MAX_ARTIFACTS_PER_MESSAGE) return;
      if (confidence < MIN_CONFIDENCE) return;
      const key = `${meaningType}|${displayLabel.toLowerCase().slice(0, 80)}`;
      if (seenValues.has(key)) return;
      // Near-duplicate consolidation across types (learned X / practice X)
      const norm = displayLabel.toLowerCase().replace(/^practice:\s*/, '').slice(0, 40);
      for (const s of seenValues) {
        if (s.includes(norm) || norm.includes(s.split('|')[1]?.slice(0, 40) ?? '___')) {
          if (meaningType !== 'lesson' && s.startsWith('lesson|')) return;
        }
      }
      seenValues.add(key);
      const res = await upsertMeaningArtifact({
        userId,
        sourceMessageId,
        sourceEventId,
        meaningType,
        displayLabel,
        confidence,
        evidenceQuotes: [evidence],
        epistemicType: epistemic,
        ...extra,
        metadata: { jobId: opts?.jobId },
        extractorVersion: MEMORY_QUALITY_EXTRACTOR_VERSION,
      });
      if (res) {
        artifactIds.push(res.id);
        if (res.isNew) created++;
        else reused++;
        writes++;
      }
    };

    for (const n of bundle.meaning.nodes) {
      const mt = mapNodeKind(n.kind);
      if (!mt) continue;
      await tryUpsert(
        mt,
        n.label,
        n.confidence,
        n.evidence,
        n.epistemicType ?? 'deterministic_inference',
      );
    }

    // Continuity edges as first-class causal/continuity links
    for (const e of bundle.meaning.edges) {
      const from = bundle.meaning.nodes[e.fromIndex];
      const to = bundle.meaning.nodes[e.toIndex];
      if (!from || !to) continue;
      await tryUpsert(
        e.kind === 'taught' || e.kind === 'informed' ? 'continuity_link' : 'causal_link',
        `${from.label} → ${to.label}`,
        e.confidence,
        e.evidence,
        'deterministic_inference',
        {
          linkedFromType: from.kind,
          linkedFromValue: from.label,
          linkedToType: to.kind,
          linkedToValue: to.label,
        },
      );
    }

    for (const r of bundle.relationships) {
      await tryUpsert(
        'relationship_dimension',
        `${r.personHint}:${r.dimension}`,
        r.confidence,
        r.evidence,
        'direct_statement',
      );
    }

    for (const p of bundle.progressions) {
      await tryUpsert(
        'progression',
        `${p.kind}:${p.label}`,
        p.confidence,
        p.evidence,
        'deterministic_inference',
      );
    }

    for (const p of bundle.preferenceLifecycle) {
      await tryUpsert(
        'preference_lifecycle',
        `${p.lifecycleKind}:${p.subject}`,
        p.confidence,
        p.evidence,
        p.lifecycleKind === 'identity' || p.lifecycleKind === 'goal'
          ? 'direct_statement'
          : 'deterministic_inference',
      );
    }

    // Compatibility projection (cache only — not authority)
    await projectMetadata(userId, sourceMessageId, bundle, artifactIds);

    // Stamp event meaning metadata projection
    const eventMeta = meaningToEventMetadata(bundle.meaning);
    if (eventMeta && sourceEventId) {
      const { data: ev } = await supabaseAdmin
        .from('resolved_events')
        .select('metadata')
        .eq('id', sourceEventId)
        .eq('user_id', userId)
        .maybeSingle();
      const em = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<
        string,
        unknown
      >;
      await supabaseAdmin
        .from('resolved_events')
        .update({
          metadata: {
            ...em,
            autobiographical_meaning: eventMeta,
            meaning_artifact_ids: artifactIds,
          },
        })
        .eq('id', sourceEventId)
        .eq('user_id', userId);
    }

    logger.debug(
      {
        userId,
        sourceMessageId,
        created,
        reused,
        artifacts: artifactIds.length,
      },
      'Memory quality durable stage completed',
    );

    return {
      status: 'COMPLETED',
      artifactIds,
      created,
      reused,
      payload: bundle,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, userId, sourceMessageId }, 'Memory quality durable stage failed');
    const retryable = /timeout|connection|temporar|429|5\d\d/i.test(msg);
    return {
      status: retryable ? 'RETRYABLE_FAILED' : 'PERMANENT_FAILED',
      artifactIds: [],
      created: 0,
      reused: 0,
      payload: null,
      error: msg.slice(0, 500),
    };
  }
}

async function projectMetadata(
  userId: string,
  sourceMessageId: string,
  bundle: MemoryQualityPayload,
  artifactIds: string[],
): Promise<void> {
  try {
    const { data: row } = await supabaseAdmin
      .from('chat_messages')
      .select('metadata')
      .eq('id', sourceMessageId)
      .eq('user_id', userId)
      .maybeSingle();
    const meta = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
      string,
      unknown
    >;
    await supabaseAdmin
      .from('chat_messages')
      .update({
        metadata: {
          ...meta,
          memory_quality: {
            // Projection / cache — authority is autobiographical_meaning_artifacts
            authority: 'autobiographical_meaning_artifacts',
            artifactIds,
            meaning: {
              chains: bundle.meaning.chains,
              lessons: bundle.meaning.lessons,
              intents: bundle.meaning.intents,
              outcomes: bundle.meaning.outcomes,
              emotions: bundle.meaning.emotions,
              nodes: bundle.meaning.nodes,
              edges: bundle.meaning.edges,
              evidenceCount: bundle.meaning.evidenceCount,
              overallConfidence: bundle.meaning.overallConfidence,
            },
            relationships: bundle.relationships,
            progressions: bundle.progressions,
            preferenceLifecycle: bundle.preferenceLifecycle,
            extractorVersion: bundle.extractorVersion,
            extractedAt: bundle.extractedAt,
          },
        },
      })
      .eq('id', sourceMessageId)
      .eq('user_id', userId);
  } catch (err) {
    logger.debug({ err, sourceMessageId }, 'memory_quality metadata projection failed');
  }
}
