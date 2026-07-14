/**
 * Scope gate for the working-memory assembly: retrieval stays broad, but
 * items from domains the question blocked (family evidence in a work answer,
 * romance in a family answer, diagnostics anywhere) never reach the LLM.
 */

import type { WorkingMemoryAssembly, WorkingMemoryItem } from '../chat/workingMemoryAssembler';
import { classifyItemDomain } from './responseEvidenceFilter';
import type { ResponseScopePlan } from './responseScopeTypes';

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

export function applyScopePlanToAssembly(
  assembly: WorkingMemoryAssembly,
  plan: ResponseScopePlan,
): WorkingMemoryAssembly {
  // Audits and the debug inspector see everything — they just never render in chat.
  if (plan.responseMode === 'audit' || plan.responseMode === 'debug_inspector') return assembly;

  const rejected = [...assembly.rejected];
  let removed = 0;

  const keep = (item: WorkingMemoryItem): boolean => {
    const domain = classifyItemDomain(item);
    if (domain === 'diagnostics' || plan.blockedDomains.includes(domain)) {
      rejected.push({ ...item, rejectedReason: `scope_gate:${plan.intent}:${domain}` });
      removed += 1;
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
    selected: assembly.budget.selected - removed,
    rejected: assembly.budget.rejected + removed,
  };
  return next;
}
