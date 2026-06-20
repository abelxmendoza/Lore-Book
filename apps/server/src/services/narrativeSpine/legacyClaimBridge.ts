import type { EntryIR, KnowledgeType } from '../compiler/types';
import { epistemicStateFromConfidence } from '../cognition/epistemicState';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  findClaimBySource,
  getClaimById,
  upsertClaimBySource,
  upsertEdge,
} from './narrativeClaimRepository';
import type {
  LegacyArtifactSnippet,
  NarrativeClaimKind,
  NarrativeClaimRow,
  NarrativeSourceTable,
  SourceRef,
  UpsertNarrativeClaimInput,
} from './types';

const MEANING_KNOWLEDGE_TYPES = new Set([
  'behavioral_pattern',
  'lesson',
  'identity',
  'value',
  'belief',
  'preference',
]);

export function mapEntryIrKind(knowledgeType: KnowledgeType): NarrativeClaimKind {
  if (knowledgeType === 'FACT') return 'fact';
  if (knowledgeType === 'DECISION') return 'decision';
  return 'interpretation';
}

export function mapCrystallizedKind(knowledgeType: string): NarrativeClaimKind {
  if (MEANING_KNOWLEDGE_TYPES.has(knowledgeType)) return 'meaning';
  if (knowledgeType === 'career' || knowledgeType === 'skill' || knowledgeType === 'relationship') {
    return 'fact';
  }
  return 'meaning';
}

export function rowToView(row: NarrativeClaimRow, legacy?: LegacyArtifactSnippet | null) {
  return {
    id: row.id,
    kind: row.claim_kind,
    statement: row.statement,
    summary: row.summary,
    confidence: row.confidence,
    status: row.status,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    occurredAt: row.occurred_at,
    occurredEnd: row.occurred_end,
    significance: row.significance,
    createdAt: row.created_at,
    legacy: legacy ?? null,
  };
}

async function loadLegacySnippet(
  userId: string,
  sourceTable: string,
  sourceId: string,
): Promise<LegacyArtifactSnippet | null> {
  switch (sourceTable as NarrativeSourceTable) {
    case 'entry_ir': {
      const { data } = await supabaseAdmin
        .from('entry_ir')
        .select('id, content, knowledge_type, timestamp, confidence')
        .eq('user_id', userId)
        .eq('id', sourceId)
        .maybeSingle();
      if (!data) return null;
      return {
        table: sourceTable,
        id: sourceId,
        title: `Entry IR (${data.knowledge_type})`,
        excerpt: data.content,
        occurredAt: data.timestamp,
        extra: { knowledgeType: data.knowledge_type, confidence: data.confidence },
      };
    }
    case 'resolved_events': {
      const { data } = await supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, start_time, end_time, confidence, type')
        .eq('user_id', userId)
        .eq('id', sourceId)
        .maybeSingle();
      if (!data) return null;
      return {
        table: sourceTable,
        id: sourceId,
        title: data.title,
        excerpt: data.summary,
        occurredAt: data.start_time,
        extra: { endTime: data.end_time, eventType: data.type, confidence: data.confidence },
      };
    }
    case 'crystallized_knowledge': {
      const { data } = await supabaseAdmin
        .from('crystallized_knowledge')
        .select('id, human_readable_claim, machine_claim, knowledge_type, confidence, status')
        .eq('user_id', userId)
        .eq('id', sourceId)
        .maybeSingle();
      if (!data) return null;
      return {
        table: sourceTable,
        id: sourceId,
        title: data.knowledge_type,
        excerpt: data.human_readable_claim,
        occurredAt: null,
        extra: { machineClaim: data.machine_claim, status: data.status, confidence: data.confidence },
      };
    }
    case 'event_interpretations': {
      const { data } = await supabaseAdmin
        .from('event_interpretations')
        .select('id, interpretation, source, created_at, confidence')
        .eq('user_id', userId)
        .eq('id', sourceId)
        .maybeSingle();
      if (!data) return null;
      return {
        table: sourceTable,
        id: sourceId,
        title: 'Event interpretation',
        excerpt: data.interpretation,
        occurredAt: data.created_at,
        extra: { source: data.source, confidence: data.confidence },
      };
    }
    case 'utterances': {
      const { data } = await supabaseAdmin
        .from('utterances')
        .select('id, text, created_at')
        .eq('user_id', userId)
        .eq('id', sourceId)
        .maybeSingle();
      if (!data) return null;
      return {
        table: sourceTable,
        id: sourceId,
        title: 'User statement',
        excerpt: data.text,
        occurredAt: data.created_at,
      };
    }
    case 'journal_entries': {
      const { data } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, created_at')
        .eq('user_id', userId)
        .eq('id', sourceId)
        .maybeSingle();
      if (!data) return null;
      return {
        table: sourceTable,
        id: sourceId,
        title: 'Journal memory',
        excerpt: data.content,
        occurredAt: data.created_at,
      };
    }
    default:
      return null;
  }
}

export async function bridgeEntryIr(userId: string, entryIrId: string): Promise<NarrativeClaimRow | null> {
  const { data, error } = await supabaseAdmin
    .from('entry_ir')
    .select('*')
    .eq('user_id', userId)
    .eq('id', entryIrId)
    .maybeSingle();

  if (error || !data) return null;

  const claimKind = mapEntryIrKind(data.knowledge_type as KnowledgeType);
  const input: UpsertNarrativeClaimInput = {
    claimKind,
    statement: data.content,
    summary: `${data.knowledge_type} from conversation`,
    confidence: data.confidence,
    epistemicState: epistemicStateFromConfidence(data.confidence),
    sourceTable: 'entry_ir',
    sourceId: data.id,
    occurredAt: data.timestamp,
    validFrom: data.timestamp,
    extractionMethod: 'entry_ir',
    meta: {
      knowledgeType: data.knowledge_type,
      certaintySource: data.certainty_source,
      sourceUtteranceId: data.source_utterance_id,
    },
  };

  const claim = await upsertClaimBySource(userId, input);
  if (!claim) return null;

  if (data.source_utterance_id) {
    const evidence = await upsertClaimBySource(userId, {
      claimKind: 'evidence',
      statement: data.content,
      summary: 'Source utterance',
      confidence: data.confidence,
      sourceTable: 'utterances',
      sourceId: data.source_utterance_id,
      occurredAt: data.timestamp,
    });
    if (evidence) {
      await upsertEdge(userId, evidence.id, claim.id, 'evidences', data.confidence);
    }
  }

  return claim;
}

export async function bridgeResolvedEvent(userId: string, eventId: string): Promise<NarrativeClaimRow | null> {
  const { data } = await supabaseAdmin
    .from('resolved_events')
    .select('*')
    .eq('user_id', userId)
    .eq('id', eventId)
    .maybeSingle();

  if (!data) return null;

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;

  const claim = await upsertClaimBySource(userId, {
    claimKind: 'event',
    statement: data.title,
    summary: data.summary,
    confidence: data.confidence ?? 0.7,
    epistemicState: epistemicStateFromConfidence(data.confidence ?? 0.7),
    sourceTable: 'resolved_events',
    sourceId: data.id,
    occurredAt: data.start_time,
    occurredEnd: data.end_time,
    validFrom: data.start_time,
    validTo: data.end_time,
    extractionMethod: 'resolved_events',
    significance: typeof metadata.significance === 'number' ? metadata.significance : null,
    meta: {
      eventType: data.type,
      lifeEventCategory: metadata.life_event_category,
      relationshipSubtype: metadata.relationship_subtype,
    },
  });

  if (!claim) return null;

  const { data: mentions } = await supabaseAdmin
    .from('event_mentions')
    .select('memory_id')
    .eq('event_id', eventId);

  for (const mention of mentions ?? []) {
    const evidence = await upsertClaimBySource(userId, {
      claimKind: 'evidence',
      statement: `Memory contributed to event: ${data.title}`,
      sourceTable: 'journal_entries',
      sourceId: mention.memory_id,
      confidence: 0.8,
    });
    if (evidence) {
      await upsertEdge(userId, evidence.id, claim.id, 'evidences', 0.8);
    }
  }

  return claim;
}

export async function bridgeCrystallizedKnowledge(
  userId: string,
  knowledgeId: string,
): Promise<NarrativeClaimRow | null> {
  const { data } = await supabaseAdmin
    .from('crystallized_knowledge')
    .select('*')
    .eq('user_id', userId)
    .eq('id', knowledgeId)
    .maybeSingle();

  if (!data) return null;

  const claimKind = mapCrystallizedKind(data.knowledge_type);
  const claim = await upsertClaimBySource(userId, {
    claimKind,
    statement: data.human_readable_claim,
    summary: data.machine_claim,
    machineKey: data.machine_claim,
    confidence: data.confidence,
    sourceTable: 'crystallized_knowledge',
    sourceId: data.id,
    meta: { knowledgeType: data.knowledge_type, status: data.status },
  });

  if (!claim) return null;

  const { data: links } = await supabaseAdmin
    .from('knowledge_evidence_links')
    .select('*')
    .eq('user_id', userId)
    .eq('knowledge_id', knowledgeId);

  for (const link of links ?? []) {
    let evidenceClaim = await findClaimBySource(userId, link.evidence_type, link.evidence_id);
    if (!evidenceClaim) {
      evidenceClaim = await bridgeLegacyEvidence(userId, link.evidence_type, link.evidence_id, link.evidence_summary);
    }
    if (evidenceClaim) {
      await upsertEdge(userId, evidenceClaim.id, claim.id, 'evidences', Math.max(0.1, link.evidence_weight + 0.5));
    }
  }

  return claim;
}

async function bridgeLegacyEvidence(
  userId: string,
  evidenceType: string,
  evidenceId: string,
  summary: string | null,
): Promise<NarrativeClaimRow | null> {
  if (evidenceType === 'resolved_event') {
    return bridgeResolvedEvent(userId, evidenceId);
  }
  if (evidenceType === 'event_candidate') {
    return upsertClaimBySource(userId, {
      claimKind: 'evidence',
      statement: summary ?? 'Event candidate evidence',
      summary: evidenceType,
      confidence: 0.6,
      sourceTable: 'resolved_events',
      sourceId: evidenceId,
    });
  }
  if (evidenceType === 'event_interpretation') {
    return bridgeEventInterpretation(userId, evidenceId);
  }

  const sourceTable = evidenceType as NarrativeSourceTable;
  if (sourceTable === 'entry_ir') return bridgeEntryIr(userId, evidenceId);

  return upsertClaimBySource(userId, {
    claimKind: 'evidence',
    statement: summary ?? `Evidence (${evidenceType})`,
    summary: evidenceType,
    confidence: 0.6,
    sourceTable,
    sourceId: evidenceId,
  });
}

export async function bridgeEventInterpretation(
  userId: string,
  interpretationId: string,
): Promise<NarrativeClaimRow | null> {
  const { data } = await supabaseAdmin
    .from('event_interpretations')
    .select('*')
    .eq('user_id', userId)
    .eq('id', interpretationId)
    .maybeSingle();

  if (!data) return null;

  const claim = await upsertClaimBySource(userId, {
    claimKind: 'interpretation',
    statement: data.interpretation,
    confidence: data.confidence ?? 0.65,
    sourceTable: 'event_interpretations',
    sourceId: data.id,
    occurredAt: data.created_at,
    meta: { source: data.source, eventId: data.event_id },
  });

  if (claim && data.event_id) {
    const eventClaim = await bridgeResolvedEvent(userId, data.event_id);
    if (eventClaim) {
      await upsertEdge(userId, eventClaim.id, claim.id, 'interpreted_as', claim.confidence);
    }
  }

  return claim;
}

export async function bridgeJournalEntry(
  userId: string,
  journalEntryId: string,
): Promise<NarrativeClaimRow | null> {
  const { data } = await supabaseAdmin
    .from('journal_entries')
    .select('id, content, created_at')
    .eq('user_id', userId)
    .eq('id', journalEntryId)
    .maybeSingle();

  if (!data) return null;

  return upsertClaimBySource(userId, {
    claimKind: 'evidence',
    statement: data.content?.slice(0, 500) ?? 'Journal memory',
    summary: 'Journal entry',
    confidence: 0.85,
    sourceTable: 'journal_entries',
    sourceId: data.id,
    occurredAt: data.created_at,
  });
}

export async function bridgeFromSource(userId: string, ref: SourceRef): Promise<NarrativeClaimRow | null> {
  const existing = await findClaimBySource(userId, ref.sourceTable, ref.sourceId);
  if (existing) return existing;

  switch (ref.sourceTable) {
    case 'entry_ir':
      return bridgeEntryIr(userId, ref.sourceId);
    case 'resolved_events':
      return bridgeResolvedEvent(userId, ref.sourceId);
    case 'crystallized_knowledge':
      return bridgeCrystallizedKnowledge(userId, ref.sourceId);
    case 'event_interpretations':
      return bridgeEventInterpretation(userId, ref.sourceId);
    case 'journal_entries':
      return bridgeJournalEntry(userId, ref.sourceId);
    default:
      logger.warn({ ref }, 'legacyClaimBridge: unsupported source table');
      return null;
  }
}

export async function enrichClaimWithLegacy(
  userId: string,
  row: NarrativeClaimRow,
): Promise<ReturnType<typeof rowToView>> {
  const legacy =
    row.source_table && row.source_id
      ? await loadLegacySnippet(userId, row.source_table, row.source_id)
      : null;
  return rowToView(row, legacy);
}

export async function resolveClaim(
  userId: string,
  claimId: string,
): Promise<NarrativeClaimRow | null> {
  const direct = await getClaimById(userId, claimId);
  if (direct) return direct;

  const tables: NarrativeSourceTable[] = [
    'crystallized_knowledge',
    'resolved_events',
    'entry_ir',
    'event_interpretations',
  ];

  for (const sourceTable of tables) {
    const bridged = await bridgeFromSource(userId, { sourceTable, sourceId: claimId });
    if (bridged) return bridged;
  }

  return null;
}

export async function recordFromEntryIr(userId: string, ir: EntryIR): Promise<void> {
  await bridgeEntryIr(userId, ir.id);
}
