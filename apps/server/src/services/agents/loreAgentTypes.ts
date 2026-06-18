/**
 * LoreBook System Cognition / Agent Layer — core types.
 *
 * Agents are passive observers of the loreInterpretationPipeline result.
 * They PROPOSE actions; they never mutate core memory tables directly.
 * Anything that would change durable state carries `requiresConfirmation`
 * and a `routeTo` target so it can be handed to an existing confirmation
 * system (Memory Review Queue, Entity Authority, Correction Authority).
 *
 * Keep this file dependency-light: it must be importable by agents, tools,
 * the orchestrator, routes, and tests without pulling in the database.
 */

import type { LoreInterpretationResult } from '../pipeline/loreInterpretationPipeline';

// ─── Evidence & provenance ────────────────────────────────────────────────────

export type LoreAgentEvidenceKind =
  | 'entity'
  | 'memory'
  | 'message'
  | 'pipeline_stage'
  | 'relationship'
  | 'system_knowledge';

export interface LoreAgentEvidence {
  kind: LoreAgentEvidenceKind;
  /** Identifier or pointer (entity id, message id, service/source-file, etc.) */
  ref: string;
  detail: string;
  /** Optional path to the source file that grounds this evidence. */
  sourceFile?: string;
}

// ─── Observations ─────────────────────────────────────────────────────────────

export interface LoreAgentObservation {
  /** e.g. 'memory_candidate' | 'identity_collision' | 'contradiction' */
  kind: string;
  summary: string;
  confidence: number;
  evidence: LoreAgentEvidence[];
}

// ─── Proposed actions ─────────────────────────────────────────────────────────

export type LoreAgentProposedActionType =
  | 'propose_memory_mutation'
  | 'propose_entity_merge'
  | 'propose_alias'
  /** Sensitive identity question (e.g. self vs relationship collision) — review, never auto-merge. */
  | 'propose_identity_review'
  | 'propose_correction'
  | 'propose_narrative_update';

/**
 * Where a proposed action should be routed for human/system confirmation.
 * 'none' means "informational only — nothing to confirm".
 */
export type LoreAgentRouteTarget =
  | 'memory_review_queue'
  | 'entity_authority'
  | 'correction_authority'
  | 'none';

export interface LoreAgentProposedAction {
  type: LoreAgentProposedActionType;
  label: string;
  payload: Record<string, unknown>;
  confidence: number;
  /** True for anything that would change durable state. */
  requiresConfirmation: boolean;
  routeTo: LoreAgentRouteTarget;
}

// ─── Warnings ─────────────────────────────────────────────────────────────────

export interface LoreAgentWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

// ─── Agent IO ─────────────────────────────────────────────────────────────────

export interface LoreAgentModeDecision {
  mode: string;
  confidence: number;
  reasoning: string;
}

export interface LoreAgentInput {
  userId: string;
  threadId?: string;
  messageId: string;
  userMessage: string;
  /** Output of runLoreInterpretationPipeline — { lexical, meaning }. */
  pipelineResult: LoreInterpretationResult;
  modeDecision?: LoreAgentModeDecision;
  /** Correlation id shared by all agents in one orchestration pass. */
  runId: string;
  /** Read-only tools. Agents must use these instead of touching the DB. */
  tools: LoreAgentTools;
}

export interface LoreAgentResult {
  agentName: string;
  runId: string;
  observations: LoreAgentObservation[];
  proposedActions: LoreAgentProposedAction[];
  confidence: number;
  evidence: LoreAgentEvidence[];
  warnings: LoreAgentWarning[];
  startedAt: string;
  completedAt: string;
}

/** Read model for the dev trace panel and persona evidence injection. */
export interface LoreAgentTrace {
  runs: Array<Record<string, unknown>>;
  observations: Array<{
    agent_name: string;
    kind: string;
    summary: string;
    confidence?: number | null;
    evidence?: Array<Record<string, unknown>>;
  }>;
  proposedActions: Array<{
    agent_name: string;
    action_type: string;
    payload?: Record<string, unknown>;
    routed_to?: string | null;
  }>;
}

export interface LoreAgent {
  readonly name: string;
  /**
   * Cheap, synchronous gate so the orchestrator can skip agents that have
   * nothing to do (e.g. NarrativeAgent on a trivial message). Pure: no IO.
   */
  shouldRun(input: Omit<LoreAgentInput, 'tools'>): boolean;
  run(input: LoreAgentInput): Promise<LoreAgentResult>;
}

// ─── Tool interfaces ──────────────────────────────────────────────────────────
//
// Tools are the ONLY way agents interact with the wider system. None of the
// tools available to v1 agents can mutate core memory: proposeMemoryMutation
// records a proposal for later confirmation, it does not write memory.

export interface MemorySearchHit {
  id: string;
  text: string;
  score: number;
  source: string;
}

export interface EntityGraphNode {
  id: string;
  name: string;
  kind: string;
}

export interface PipelineTrace {
  messageId: string;
  phases: string[];
  lexicalConfidence?: number;
  meaningConfidence?: number;
  factuality?: string;
  raw?: Record<string, unknown>;
}

export interface ProposeMemoryMutationArgs {
  userId: string;
  runId: string;
  agentName: string;
  claim: string;
  category: string;
  confidence: number;
  provenance: LoreAgentEvidence[];
  routeTo: LoreAgentRouteTarget;
}

/**
 * Read-mostly tool surface handed to every agent.
 *
 * Write-shaped methods (proposeMemoryMutation, logAgentRun) only ever
 * write to the lore_agent_* audit tables — never to memory/entity/identity
 * tables. This is enforced by tests in noDirectMutation.test.ts.
 */
export interface LoreAgentTools {
  searchMemories(userId: string, query: string): Promise<MemorySearchHit[]>;
  getEntityGraph(userId: string): Promise<EntityGraphNode[]>;
  getRecentThreadContext(threadId: string): Promise<Array<{ role: string; content: string }>>;
  getPipelineTrace(userId: string, messageId: string): Promise<PipelineTrace | null>;
  getSystemKnowledge(concept?: string): Promise<Array<Record<string, unknown>>>;
  /** Records a proposal in lore_agent_proposed_actions. Does NOT write memory. */
  proposeMemoryMutation(args: ProposeMemoryMutationArgs): Promise<void>;
}
