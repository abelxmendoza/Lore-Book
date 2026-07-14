/**
 * Response overflow guard — the last check before a pre-composed block is
 * returned as a chat answer. Detects warehouse-dump shapes (diagnostic
 * sections, entity floods, oversized context) and prunes to the sections
 * that can actually answer the question.
 */

import type { ResponseScopePlan } from './responseScopeTypes';

const DIAGNOSTIC_SECTION_RE =
  /^\s*\*\*(structured memory layers?|memory layers?|character memory|timeline memory|coverage|retrieval|provenance)\*\*/i;
const DIAGNOSTIC_LINE_RE =
  /(provenance_edges|pipeline_runs|source_message_ids|mention_count|✓|✗|layer:|retrievable)/i;

export const MAX_CHAT_ENTITIES = 15;
export const MAX_CHAT_CONTEXT_TOKENS = 2000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function countListedEntities(text: string): number {
  // Bullets and comma-separated proper-name runs are how dumps enumerate.
  const bullets = (text.match(/^\s*[•\-*]\s+/gm) ?? []).length;
  const nameRuns = (text.match(/\b[A-ZÁÉÍÓÚÑ][\w'’-]+(?:,\s*[A-ZÁÉÍÓÚÑ][\w'’-]+){4,}/g) ?? []).length * 5;
  return Math.max(bullets, nameRuns);
}

export type OverflowVerdict = {
  ok: boolean;
  violations: string[];
};

export function detectOverflow(content: string): OverflowVerdict {
  const violations: string[] = [];
  const lines = content.split('\n');

  if (lines.some((l) => DIAGNOSTIC_SECTION_RE.test(l))) violations.push('diagnostic_sections');
  const diagnosticLines = lines.filter((l) => DIAGNOSTIC_LINE_RE.test(l)).length;
  if (diagnosticLines >= 3) violations.push('diagnostic_tables');
  if (countListedEntities(content) > MAX_CHAT_ENTITIES) violations.push('entity_flood');
  if (estimateTokens(content) > MAX_CHAT_CONTEXT_TOKENS) violations.push('oversized_context');

  return { ok: violations.length === 0, violations };
}

/**
 * Prune a markdown block down to chat-safe content: drop diagnostic
 * sections entirely, keep sections that mention the question's entities,
 * and cap total size.
 */
export function pruneToAnswer(content: string, plan: ResponseScopePlan): string {
  const sections = content.split(/\n(?=\*\*[^*]+\*\*)/);
  const wanted = plan.primaryEntities.map((e) => e.name.toLowerCase());

  const kept: string[] = [];
  for (const section of sections) {
    const header = section.split('\n', 1)[0] ?? '';
    if (DIAGNOSTIC_SECTION_RE.test(header)) continue;
    if (section.split('\n').filter((l) => DIAGNOSTIC_LINE_RE.test(l)).length >= 3) continue;
    if (wanted.length > 0) {
      const lower = section.toLowerCase();
      const mentionsEntity = wanted.some((w) => lower.includes(w));
      // Keep entity-relevant sections plus short lead-in prose.
      if (!mentionsEntity && kept.length > 0) continue;
    }
    kept.push(section.trimEnd());
    if (estimateTokens(kept.join('\n\n')) > MAX_CHAT_CONTEXT_TOKENS) {
      kept.pop();
      break;
    }
  }

  const pruned = kept.join('\n\n').trim();
  return pruned || content.split('\n').slice(0, 8).join('\n');
}

/** Convenience wrapper: pass content through untouched or pruned. */
export function enforceChatScope(content: string, plan: ResponseScopePlan): {
  content: string;
  violations: string[];
} {
  if (plan.responseMode === 'audit' || plan.responseMode === 'debug_inspector') {
    return { content, violations: [] };
  }
  const verdict = detectOverflow(content);
  if (verdict.ok) return { content, violations: [] };
  return { content: pruneToAnswer(content, plan), violations: verdict.violations };
}
