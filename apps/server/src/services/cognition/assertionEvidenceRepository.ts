import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type AssertionEvidenceInput = {
  targetKind: 'node' | 'edge' | 'narrative_claim';
  targetId: string;
  evidenceKind: string;
  evidenceId: string;
  weight?: number;
  excerpt?: string | null;
};

export async function writeAssertionEvidence(
  userId: string,
  items: AssertionEvidenceInput[],
): Promise<number> {
  if (items.length === 0) return 0;

  const rows = items.map((item) => ({
    user_id: userId,
    target_kind: item.targetKind,
    target_id: item.targetId,
    evidence_kind: item.evidenceKind,
    evidence_id: item.evidenceId,
    weight: item.weight ?? 0.7,
    excerpt: item.excerpt ?? null,
  }));

  const { error } = await supabaseAdmin
    .from('assertion_evidence')
    .upsert(rows, {
      onConflict: 'user_id,target_kind,target_id,evidence_kind,evidence_id',
      ignoreDuplicates: false,
    });

  if (error) {
    logger.warn({ error, userId, count: items.length }, 'assertionEvidence: write failed');
    return 0;
  }
  return items.length;
}

export async function getEvidenceForTarget(
  userId: string,
  targetKind: AssertionEvidenceInput['targetKind'],
  targetId: string,
) {
  const { data, error } = await supabaseAdmin
    .from('assertion_evidence')
    .select('*')
    .eq('user_id', userId)
    .eq('target_kind', targetKind)
    .eq('target_id', targetId)
    .order('weight', { ascending: false });

  if (error) return [];
  return data ?? [];
}
