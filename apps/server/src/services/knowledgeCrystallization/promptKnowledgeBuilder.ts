// ============================================================================
// Prompt Knowledge Builder
//
// Produces the WHAT LOREBOOK KNOWS block for injection into the system prompt.
//
// Constraints (from blueprint Phase 7):
//   - Token budget: hard cap of 300 tokens (~240 words) for the full block
//   - Only ACTIVE claims with confidence >= 0.70 are eligible
//   - Maximum 6 claims per prompt
//   - Selection ranked by: confidence × recency_factor
//   - Max 2 claims of same knowledge_type to prevent over-representation
//   - Returns null when no qualifying claims exist — caller skips injection
// ============================================================================

import { supabaseAdmin } from '../supabaseClient';
import type { PromptReadyClaim, KnowledgeType } from './types';

const MIN_CONFIDENCE_FOR_PROMPT = 0.70;
const MAX_CLAIMS_IN_PROMPT      = 6;
const MAX_PER_TYPE              = 2;
const MAX_CLAIM_CHARS           = 120; // ~30 tokens per claim line

// ─── recency_factor (duplicated from confidenceEngine for self-containedness) ─

function recencyFactor(lastReinforcedAt: string | null): number {
  if (!lastReinforcedAt) return 0.60;
  const daysSince = (Date.now() - new Date(lastReinforcedAt).getTime()) / 86400000;
  if (daysSince < 30)  return 1.00;
  if (daysSince < 90)  return 0.95;
  if (daysSince < 180) return 0.85;
  if (daysSince < 365) return 0.70;
  if (daysSince < 730) return 0.50;
  return 0.35;
}

// ─── Load prompt-ready claims from DB ────────────────────────────────────────

export async function loadPromptClaims(userId: string): Promise<PromptReadyClaim[]> {
  const { data, error } = await supabaseAdmin
    .from('crystallized_knowledge')
    .select('knowledge_type, human_readable_claim, confidence, last_reinforced_at')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .gte('confidence', MIN_CONFIDENCE_FOR_PROMPT)
    .order('confidence', { ascending: false })
    .limit(20); // Over-fetch, then rank and cap in memory

  if (error || !data) return [];

  // Rank by confidence × recency_factor
  const ranked = data
    .map(row => ({
      knowledge_type:       row.knowledge_type as KnowledgeType,
      human_readable_claim: row.human_readable_claim,
      confidence:           row.confidence,
      score:                row.confidence * recencyFactor(row.last_reinforced_at),
    }))
    .sort((a, b) => b.score - a.score);

  // Apply per-type cap and overall cap
  const selected: PromptReadyClaim[] = [];
  const typeCounts: Partial<Record<KnowledgeType, number>> = {};

  for (const claim of ranked) {
    if (selected.length >= MAX_CLAIMS_IN_PROMPT) break;
    const typeCount = typeCounts[claim.knowledge_type] ?? 0;
    if (typeCount >= MAX_PER_TYPE) continue;
    typeCounts[claim.knowledge_type] = typeCount + 1;
    selected.push({
      knowledge_type:       claim.knowledge_type,
      human_readable_claim: claim.human_readable_claim,
      confidence:           claim.confidence,
    });
  }

  return selected;
}

// ─── Format the prompt block ──────────────────────────────────────────────────
//
// Returns null when no claims qualify — caller skips injection entirely.
// The knowledge_type prefix is included so the LLM can distinguish epistemic
// weight: a 'belief' can be wrong; a 'behavioral_pattern' was directly observed.

export function formatPromptBlock(claims: PromptReadyClaim[]): string | null {
  if (claims.length === 0) return null;

  const lines = claims.map(c => {
    const text = c.human_readable_claim.length > MAX_CLAIM_CHARS
      ? c.human_readable_claim.substring(0, MAX_CLAIM_CHARS - 1) + '…'
      : c.human_readable_claim;
    return `• [${c.knowledge_type}] ${text}`;
  });

  return [
    'WHAT LOREBOOK KNOWS (verified by behavioral evidence):',
    ...lines,
  ].join('\n');
}

// ─── Combined helper for systemPromptBuilder ─────────────────────────────────

export async function buildKnowledgePromptBlock(userId: string): Promise<string | null> {
  const claims = await loadPromptClaims(userId);
  return formatPromptBlock(claims);
}
