import type { EntryIR } from '../compiler/types';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { epistemicStateFromConfidence } from './epistemicState';
import { writeAssertionEvidence } from './assertionEvidenceRepository';
import { upsertGraphNodeBySource } from './graphNodeRepository';
import {
  bridgeEntryIr,
} from '../narrativeSpine/legacyClaimBridge';
import {
  findClaimBySource,
  upsertClaimBySource,
  upsertEdge,
} from '../narrativeSpine/narrativeClaimRepository';

function inferDecisionType(content: string): string {
  const lower = content.toLowerCase();
  if (/relationship|break\s?up|dating|marry/.test(lower)) return 'RELATIONSHIP';
  if (/job|career|work|quit|resign|offer/.test(lower)) return 'CAREER';
  if (/health|doctor|therapy/.test(lower)) return 'HEALTH';
  if (/money|financ|invest|debt/.test(lower)) return 'FINANCIAL';
  if (/creative|art|music|write/.test(lower)) return 'CREATIVE';
  if (/friend|social|move|party/.test(lower)) return 'SOCIAL';
  return 'PERSONAL';
}

function titleFromContent(content: string): string {
  const trimmed = content.trim();
  const first = trimmed.split(/[.!?]/)[0]?.trim() ?? trimmed;
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}

export async function bridgeDecisionFromEntryIr(
  userId: string,
  entryIr: EntryIR,
): Promise<string | null> {
  if (entryIr.knowledge_type !== 'DECISION') return null;

  const { data: existing } = await supabaseAdmin
    .from('decisions')
    .select('id')
    .eq('user_id', userId)
    .filter('metadata->>source_entry_ir_id', 'eq', entryIr.id)
    .maybeSingle();

  let decisionId = existing?.id as string | undefined;

  if (!decisionId) {
    const { data: decision, error } = await supabaseAdmin
      .from('decisions')
      .insert({
        user_id: userId,
        title: titleFromContent(entryIr.content),
        description: entryIr.content,
        decision_type: inferDecisionType(entryIr.content),
        confidence: entryIr.confidence,
        metadata: {
          source_entry_ir_id: entryIr.id,
          source_utterance_id: entryIr.source_utterance_id,
          auto_extracted: true,
        },
      })
      .select('id')
      .single();

    if (error || !decision) {
      logger.warn({ error, userId, entryIrId: entryIr.id }, 'decisionBridge: insert failed');
      return null;
    }
    decisionId = decision.id;

    await supabaseAdmin.from('decision_rationales').upsert(
      {
        user_id: userId,
        decision_id: decisionId,
        reasoning: entryIr.content,
        values_considered: entryIr.themes?.map((t) => t.theme) ?? [],
        emotions_present: entryIr.emotions?.map((e) => e.emotion) ?? [],
        constraints: [],
        known_unknowns: null,
      },
      { onConflict: 'decision_id', ignoreDuplicates: true },
    );
  }

  const epistemicState = epistemicStateFromConfidence(entryIr.confidence);

  const claim = await upsertClaimBySource(userId, {
    claimKind: 'decision',
    statement: titleFromContent(entryIr.content),
    summary: entryIr.content,
    confidence: entryIr.confidence,
    epistemicState,
    sourceTable: 'entry_ir',
    sourceId: entryIr.id,
    occurredAt: entryIr.timestamp,
    validFrom: entryIr.timestamp,
    extractionMethod: 'entry_ir',
    meta: {
      decision_id: decisionId,
      knowledge_type: 'DECISION',
      epistemic_state: epistemicState,
    },
  });

  if (claim && entryIr.source_utterance_id) {
    const evidenceClaim = await findClaimBySource(userId, 'utterances', entryIr.source_utterance_id);
    if (evidenceClaim) {
      await upsertEdge(userId, evidenceClaim.id, claim.id, 'evidences', entryIr.confidence);
    } else {
      await bridgeEntryIr(userId, entryIr.id);
    }
  }

  await upsertGraphNodeBySource(userId, {
    nodeKind: 'decision',
    rootType: 'GOAL',
    displayName: titleFromContent(entryIr.content),
    machineKey: `decision:${decisionId}`,
    confidence: entryIr.confidence,
    epistemicState,
    sourceTable: 'entry_ir',
    sourceId: entryIr.id,
    extractionMethod: 'entry_ir',
    meta: { decision_id: decisionId },
  });

  if (claim) {
    await writeAssertionEvidence(userId, [
      {
        targetKind: 'narrative_claim',
        targetId: claim.id,
        evidenceKind: 'entry_ir',
        evidenceId: entryIr.id,
        weight: entryIr.confidence,
        excerpt: entryIr.content.slice(0, 280),
      },
      {
        targetKind: 'narrative_claim',
        targetId: claim.id,
        evidenceKind: 'decisions',
        evidenceId: decisionId,
        weight: 0.85,
      },
    ]);
  }

  return decisionId;
}

export function ingestDecisionFromEntryIr(userId: string, entryIr: EntryIR): void {
  if (entryIr.knowledge_type !== 'DECISION') return;
  void bridgeDecisionFromEntryIr(userId, entryIr).catch((err) => {
    logger.warn({ err, userId, entryIrId: entryIr.id }, 'decisionBridge: ingest failed');
  });
}
