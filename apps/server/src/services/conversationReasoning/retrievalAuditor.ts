/**
 * Retrieval Auditor — per-item justification pass over working memory,
 * after responseScope's domain-level gate (applyScopePlanToAssembly) and
 * before the assembly is flattened into prompt prose. Reuses the existing
 * evidence-contract scorer (responseScope/evidenceContract.ts), which
 * previously only ever ran against the legacy ChatSource[] array, against
 * WorkingMemoryAssembly items instead — no new scoring heuristic.
 *
 * Known trade-off: run without closedScopeRosterNames (that roster load
 * happens later in ragBuilderService.ts, after this insertion point).
 * WMA already does its own entity-anchoring, so the practical risk is
 * low — watch closed-scope eval scenarios if precision regresses.
 */

import { buildEvidenceContract, scoreEvidence } from '../responseScope/evidenceContract';
import type { ResponseScopePlan } from '../responseScope/responseScopeTypes';
import type { WorkingMemoryAssembly, WorkingMemoryItem } from '../chat/workingMemoryAssembler';

/**
 * WMA items are already pre-filtered once by their own budget/score gate,
 * so the audit floor is looser than evidenceContract's own
 * DEFAULT_MIN_EVIDENCE_SCORE (20) — this only removes items that clearly
 * fail to justify themselves (hard-reject reasons, or near-zero scores).
 */
export const AUDIT_MIN_SCORE = 10;

const SECTION_KEYS = [
  'episodes',
  'events',
  'projects',
  'goals',
  'skills',
  'communities',
  'relationships',
  'preferences',
  'timeline',
] as const;

export type AuditedItem = {
  id: string;
  kept: boolean;
  reason: string;
  score: number;
};

export function auditWorkingMemoryAssembly(
  assembly: WorkingMemoryAssembly,
  message: string,
  scopePlan: ResponseScopePlan,
): { assembly: WorkingMemoryAssembly; audited: AuditedItem[]; discarded: number } {
  // Audits and the debug inspector see everything, mirroring scopeWorkingMemory's own rule.
  if (scopePlan.responseMode === 'audit' || scopePlan.responseMode === 'debug_inspector') {
    return { assembly, audited: [], discarded: 0 };
  }

  const contract = buildEvidenceContract(message, scopePlan);
  const rejected = [...assembly.rejected];
  const audited: AuditedItem[] = [];
  let discarded = 0;

  const keep = (item: WorkingMemoryItem): boolean => {
    const { score, reasons } = scoreEvidence(
      {
        type: item.type,
        title: item.title,
        snippet: item.content,
        date: item.date ?? undefined,
        relevanceReasons: item.reasons,
      },
      contract,
    );
    const passes = score >= AUDIT_MIN_SCORE;
    audited.push({ id: item.id, kept: passes, reason: reasons[0] ?? 'unscored', score });
    if (!passes) {
      rejected.push({ ...item, rejectedReason: `retrieval_audit:${reasons[0] ?? 'below_floor'}` });
      discarded += 1;
      return false;
    }
    return true;
  };

  const next: WorkingMemoryAssembly = { ...assembly, rejected };
  for (const key of SECTION_KEYS) {
    next[key] = assembly[key].filter(keep);
  }
  next.budget = {
    ...assembly.budget,
    selected: assembly.budget.selected - discarded,
    rejected: assembly.budget.rejected + discarded,
  };
  return { assembly: next, audited, discarded };
}
