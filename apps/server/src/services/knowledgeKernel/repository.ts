import { logger } from '../../logger';
import { writeAssertionEvidence } from '../cognition/assertionEvidenceRepository';
import { supabaseAdmin } from '../supabaseClient';

import { validateKnowledgeAssertion } from './policy';
import type {
  AssertionEvidenceLinkInput,
  KnowledgeAssertionInput,
  KnowledgeAssertionRow,
  RevisionRelation,
} from './types';

function toRow(userId: string, input: KnowledgeAssertionInput): Record<string, unknown> {
  return {
    user_id: userId,
    subject_kind: input.subject.kind,
    subject_id: input.subject.id ?? null,
    subject_label: input.subject.label,
    predicate: input.predicate,
    object_value: input.objectValue,
    assertion_class: input.assertionClass,
    domain: input.domain,
    epistemic_stance: input.epistemicStance,
    asserted_by_kind: input.assertedBy.kind,
    asserted_by_id: input.assertedBy.id ?? null,
    asserted_by_label: input.assertedBy.label ?? null,
    derivation_method: input.derivationMethod,
    polarity: input.polarity ?? 'affirmed',
    certainty: input.certainty ?? null,
    status: input.status ?? 'proposed',
    sensitivity: input.sensitivity ?? 'standard',
    valid_from: input.validFrom ?? null,
    valid_to: input.validTo ?? null,
    occurred_at: input.occurredAt ?? null,
    recorded_at: input.recordedAt ?? new Date().toISOString(),
    extraction_method: input.extractionMethod ?? null,
    source_table: input.sourceTable ?? null,
    source_id: input.sourceId ?? null,
    metadata: input.metadata ?? {},
  };
}

export async function createKnowledgeAssertion(
  userId: string,
  input: KnowledgeAssertionInput,
): Promise<KnowledgeAssertionRow | null> {
  const validation = validateKnowledgeAssertion(input);
  if (!validation.valid) {
    logger.warn({ errors: validation.errors }, 'knowledgeKernel: invalid assertion rejected');
    return null;
  }

  const row = toRow(userId, {
    ...input,
    status: validation.requiresHumanReview ? 'proposed' : input.status,
  });

  const { data, error } = await supabaseAdmin
    .from('knowledge_assertions')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    logger.warn({ error }, 'knowledgeKernel: assertion write failed');
    return null;
  }
  return data as KnowledgeAssertionRow;
}

export async function linkAssertionEvidence(
  userId: string,
  links: AssertionEvidenceLinkInput[],
): Promise<number> {
  return writeAssertionEvidence(
    userId,
    links.map((link) => ({
      targetKind: 'knowledge_assertion',
      targetId: link.assertionId,
      evidenceKind: link.evidenceKind,
      evidenceId: link.evidenceId,
      relation: link.relation,
      weight: link.weight,
      excerpt: link.excerpt,
      locator: link.locator,
      linkedBy: link.linkedBy,
      rationale: link.rationale,
      extractionConfidence: link.extractionConfidence,
    })),
  );
}

export async function linkAssertionRevision(
  userId: string,
  fromAssertionId: string,
  toAssertionId: string,
  relation: RevisionRelation,
  rationale?: string | null,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('assertion_revision_links')
    .insert({
      user_id: userId,
      from_assertion_id: fromAssertionId,
      to_assertion_id: toAssertionId,
      relation,
      rationale: rationale ?? null,
    });

  if (error) {
    logger.warn({ error, fromAssertionId, toAssertionId }, 'knowledgeKernel: revision link failed');
    return false;
  }
  return true;
}

export async function listAssertionsForSubject(
  userId: string,
  subjectKind: string,
  subjectId: string,
): Promise<KnowledgeAssertionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('knowledge_assertions')
    .select('*')
    .eq('user_id', userId)
    .eq('subject_kind', subjectKind)
    .eq('subject_id', subjectId)
    .order('recorded_at', { ascending: false });

  if (error) {
    logger.warn({ error, subjectKind, subjectId }, 'knowledgeKernel: subject query failed');
    return [];
  }
  return (data as KnowledgeAssertionRow[]) ?? [];
}

/** Most-recent-first assertions derived from a given legacy source row (dual-write lookup). */
export async function listAssertionsForSource(
  userId: string,
  sourceTable: string,
  sourceId: string,
): Promise<KnowledgeAssertionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('knowledge_assertions')
    .select('*')
    .eq('user_id', userId)
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .order('recorded_at', { ascending: false });

  if (error) {
    logger.warn({ error, sourceTable, sourceId }, 'knowledgeKernel: source query failed');
    return [];
  }
  return (data as KnowledgeAssertionRow[]) ?? [];
}
