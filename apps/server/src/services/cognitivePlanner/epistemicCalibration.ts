/**
 * Epistemic Calibration — what level of claim does this answer's evidence
 * actually justify?
 *
 * The Cognitive Planner decides how to think; this decides how strongly to
 * speak. Every answer gets an epistemic tier computed from the evidence that
 * retrieval actually assembled — not from vibes:
 *
 *   observed    directly supported (crystallized knowledge or rich evidence)
 *   inferred    derived from several independent pieces, none conclusive
 *   hypothesis  plausible, thin support — offer tentatively
 *   unknown     insufficient evidence — say so, never speculate
 *   contested   support genuinely conflicts — present both sides + trend
 *
 * Trust is built by what the system refuses to overstate. Pure functions;
 * runs after the evidence contract, before prompt assembly.
 */

import type { CognitiveStrategy } from './cognitivePlanner';

export type EpistemicTier = 'observed' | 'inferred' | 'hypothesis' | 'unknown' | 'contested';

export type EpistemicEvidenceInput = {
  strategy: CognitiveStrategy;
  /** Contract-accepted sources with their relevance scores. */
  sources: Array<{ type?: string; relevanceScore?: number }>;
  /** Crystallized claims available for this answer (confidence 0–1). */
  claims: Array<{ confidence: number }>;
  /** Whether structured thread state is available (inspect strategies). */
  threadsAvailable: boolean;
  /** Known contradicting evidence count, when the caller has it. */
  contradictionCount?: number;
};

export type EpistemicAssessment = {
  tier: EpistemicTier;
  /** 0–100 calibrated confidence in answering at this tier. */
  confidence: number;
  support: {
    knowledgeSources: number;
    strongSources: number;
    totalSources: number;
    maxClaimConfidence: number;
  };
  directive: string;
};

const STRONG_SOURCE_SCORE = 60;
const RELEVANT_KNOWLEDGE_SCORE = 50;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function assessEpistemicState(input: EpistemicEvidenceInput): EpistemicAssessment {
  const knowledgeSources = input.sources.filter(
    (s) => s.type === 'knowledge' && (s.relevanceScore ?? 0) >= RELEVANT_KNOWLEDGE_SCORE,
  ).length;
  const strongSources = input.sources.filter(
    (s) => (s.relevanceScore ?? 0) >= STRONG_SOURCE_SCORE,
  ).length;
  const totalSources = input.sources.length;
  const maxClaimConfidence = input.claims.reduce((m, c) => Math.max(m, c.confidence), 0);

  const support = { knowledgeSources, strongSources, totalSources, maxClaimConfidence };

  // Structured state counts as direct support for inspect-style strategies:
  // active threads ARE the answer to "what am I focused on".
  const structuredAnswer =
    input.threadsAvailable &&
    (input.strategy === 'current_focus' || input.strategy === 'planning');

  if ((input.contradictionCount ?? 0) > 0) {
    return {
      tier: 'contested',
      confidence: clamp(35 + strongSources * 5, 20, 60),
      support,
      directive:
        'The evidence on this genuinely conflicts. Do NOT average it into a mushy middle: present both sides with their support, and name the trend over time if one exists ("earlier … while more recently …").',
    };
  }

  if (knowledgeSources > 0 || structuredAnswer || strongSources >= 3) {
    const confidence = clamp(
      70 + knowledgeSources * 8 + Math.min(15, strongSources * 4) + (structuredAnswer ? 10 : 0),
      70,
      98,
    );
    return {
      tier: 'observed',
      confidence,
      support,
      directive:
        'The record directly supports this answer. State it plainly and cite the specifics — no hedging language.',
    };
  }

  if (strongSources >= 1 || totalSources >= 2) {
    return {
      tier: 'inferred',
      confidence: clamp(45 + strongSources * 8 + totalSources * 3, 45, 68),
      support,
      directive:
        'This answer is derived, not directly stated. Use derivation language — "the evidence suggests", "several conversations point to" — and ground each claim in what supports it.',
    };
  }

  if (totalSources === 1) {
    return {
      tier: 'hypothesis',
      confidence: clamp(25 + (input.sources[0]?.relevanceScore ?? 0) / 5, 25, 44),
      support,
      directive:
        'Support here is thin. Offer this tentatively — "it may be that…" — make clear it is one possible reading, and invite the user to confirm or correct it.',
    };
  }

  return {
    tier: 'unknown',
    confidence: clamp(5 + maxClaimConfidence * 20, 0, 20),
    support,
    directive:
      'The record cannot answer this. Say so directly — "I don\'t have enough to answer that yet" — and do NOT speculate or invent. If useful, name what kind of sharing would fill the gap. (Check the current conversation first per the response hierarchy — this applies only to stored memory.)',
  };
}

/** Render calibration for the system prompt. */
export function formatEpistemicBlock(a: EpistemicAssessment): string {
  const lines = [
    `Tier: ${a.tier.toUpperCase()} | confidence: ${a.confidence} | support: ${a.support.knowledgeSources} knowledge, ${a.support.strongSources} strong, ${a.support.totalSources} total sources`,
    a.directive,
  ];
  if (a.tier === 'observed' || a.tier === 'inferred') {
    lines.push(
      'For pattern/reflection answers: lead with high-confidence conclusions, then clearly-labeled hypotheses; never present a hypothesis as established.',
    );
  }
  return lines.join('\n');
}
