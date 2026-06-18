/**
 * Builds a compact evidence block for persona system prompts from pipeline
 * output and (optionally) persisted agent trace data.
 *
 * Grounds chat personas in what LoreBook actually detected — without waiting
 * for LLM calls or requiring agents to have finished persisting.
 */

import type { LoreInterpretationResult } from '../pipeline/loreInterpretationPipeline';
import {
  getPersonaDefinition,
  type PersonaEvidencePolicy,
  type PersonaId,
} from '../personas/personaRegistry';
import type { LoreAgentTrace } from './loreAgentTypes';

export interface PersonaEvidenceInput {
  personaId: string;
  pipelineResult?: LoreInterpretationResult;
  agentTrace?: LoreAgentTrace | null;
}

function policyRequiresBlock(policy: PersonaEvidencePolicy): boolean {
  return policy === 'must_cite' || policy === 'should_cite';
}

/** Map agent names to observation kinds they own. */
const AGENT_OBSERVATION_PREFIX: Record<string, string[]> = {
  MemoryAgent: ['durable_memory_candidate', 'context_memory_candidate'],
  IdentityAgent: ['identity_collision', 'reference_resolved', 'identity_suggestion'],
  ContradictionAgent: ['contradiction'],
  NarrativeAgent: ['narrative_signal'],
  SystemAgent: ['system_explanation'],
};

export function buildPersonaEvidenceBlock(input: PersonaEvidenceInput): string | null {
  const def = getPersonaDefinition(input.personaId as PersonaId);
  if (!def || !policyRequiresBlock(def.evidencePolicy)) return null;

  const lines: string[] = [];
  const meaning = input.pipelineResult?.meaning;

  if (meaning) {
    if (def.preferredAgentEvidence.includes('MemoryAgent')) {
      for (const c of (meaning.memoryReviewCandidates ?? []).slice(0, 5)) {
        lines.push(`- Memory candidate (${c.category}, ${Math.round(c.confidence * 100)}%): "${c.claim}"`);
      }
    }
    if (def.preferredAgentEvidence.includes('IdentityAgent')) {
      for (const c of (meaning.identityCollisions ?? []).slice(0, 3)) {
        lines.push(`- Identity collision on "${c.name}" (${c.claims.join(' vs ')}) — needs review, never auto-merge`);
      }
      for (const r of (meaning.references ?? []).slice(0, 3)) {
        lines.push(`- Reference resolved: "${r.reference}" → ${r.antecedent}`);
      }
    }
    if (def.preferredAgentEvidence.includes('ContradictionAgent')) {
      for (const c of (meaning.contradictions ?? []).slice(0, 3)) {
        lines.push(`- Contradiction on ${c.field}: existing "${c.existingFact}" vs new "${c.newClaim}" (${c.severity})`);
      }
    }
    if (def.preferredAgentEvidence.includes('NarrativeAgent')) {
      for (const e of (meaning.resolvedEvents ?? []).slice(0, 3)) {
        lines.push(`- Event signal: ${e.kind} — "${e.cue}"`);
      }
    }
  }

  if (input.agentTrace) {
    for (const agentName of def.preferredAgentEvidence) {
      const kinds = AGENT_OBSERVATION_PREFIX[agentName] ?? [];
      const obs = input.agentTrace.observations.filter(
        (o) => o.agent_name === agentName && kinds.some((k) => o.kind.startsWith(k) || o.kind === k)
      );
      for (const o of obs.slice(0, 3)) {
        lines.push(`- [${agentName}] ${o.summary}`);
      }
    }
    for (const action of input.agentTrace.proposedActions.slice(0, 5)) {
      if (!def.preferredAgentEvidence.includes(action.agent_name as typeof def.preferredAgentEvidence[number])) continue;
      lines.push(`- Proposed (${action.action_type}, pending confirmation): ${JSON.stringify(action.payload ?? {}).slice(0, 120)}`);
    }
  }

  if (lines.length === 0) return null;

  const citeRule =
    def.evidencePolicy === 'must_cite'
      ? 'You MUST cite this evidence when making factual or relational claims. Do not invent details beyond what is listed.'
      : 'Prefer citing this evidence when making factual or relational claims.';

  return `**LOREBOOK EVIDENCE (from this message — cite when relevant):**\n${lines.join('\n')}\n${citeRule}`;
}
