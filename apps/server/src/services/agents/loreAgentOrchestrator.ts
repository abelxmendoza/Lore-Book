/**
 * LORE AGENT ORCHESTRATOR
 *
 * Runs the System Cognition / Agent Layer AFTER the loreInterpretationPipeline
 * has produced its result. Agents inspect that result, emit observations, and
 * propose actions. Proposed actions are logged to the lore_agent_* audit tables;
 * important changes are routed to existing confirmation systems (Memory Review
 * Queue, Entity Authority, Correction Authority) — never written directly here.
 *
 * Invariants:
 *   - Best-effort: any failure is caught and logged, never thrown to the caller.
 *   - Read-only with respect to core memory: agents use tools, not the DB.
 *   - Gated by config.enableLoreAgents at the call site.
 */

import { randomUUID } from 'node:crypto';

import { config } from '../../config';
import { logger } from '../../logger';
import type { LoreInterpretationResult } from '../pipeline/loreInterpretationPipeline';
import { loreAgentTools } from './loreAgentTools';
import { loreAgentRunService } from './loreAgentRunService';
import { routeAgentResults } from './loreAgentProposalRouter';
import { memoryAgent } from './agents/memoryAgent';
import { identityAgent } from './agents/identityAgent';
import { contradictionAgent } from './agents/contradictionAgent';
import { narrativeAgent } from './agents/narrativeAgent';
import { systemAgent } from './agents/systemAgent';
import type {
  LoreAgent,
  LoreAgentInput,
  LoreAgentResult,
  LoreAgentModeDecision,
} from './loreAgentTypes';

/** Registry of agents to run, in order. SystemAgent runs last so it can explain. */
const AGENTS: LoreAgent[] = [memoryAgent, identityAgent, contradictionAgent, narrativeAgent, systemAgent];

export interface RunLoreAgentsParams {
  userId: string;
  threadId?: string;
  messageId: string;
  userMessage: string;
  pipelineResult: LoreInterpretationResult;
  modeDecision?: LoreAgentModeDecision;
}

export interface RunLoreAgentsOutput {
  runId: string;
  results: LoreAgentResult[];
}

export async function runLoreAgents(params: RunLoreAgentsParams): Promise<RunLoreAgentsOutput> {
  const runId = randomUUID();
  const results: LoreAgentResult[] = [];

  const baseInput: Omit<LoreAgentInput, 'tools'> = {
    userId: params.userId,
    threadId: params.threadId,
    messageId: params.messageId,
    userMessage: params.userMessage,
    pipelineResult: params.pipelineResult,
    modeDecision: params.modeDecision,
    runId,
  };

  for (const agent of AGENTS) {
    try {
      if (!agent.shouldRun(baseInput)) {
        logger.debug({ agent: agent.name, runId }, 'LoreAgentOrchestrator: agent skipped');
        continue;
      }

      const result = await agent.run({ ...baseInput, tools: loreAgentTools });
      results.push(result);

      await loreAgentRunService.persistResult({
        userId: params.userId,
        threadId: params.threadId,
        messageId: params.messageId,
        result,
      });
    } catch (err) {
      logger.warn({ err, agent: agent.name, runId }, 'LoreAgentOrchestrator: agent failed (non-fatal)');
    }
  }

  const proposedCount = results.reduce((n, r) => n + r.proposedActions.length, 0);

  if (config.enableLoreAgents && proposedCount > 0) {
    try {
      await routeAgentResults({
        userId: params.userId,
        messageId: params.messageId,
        runId,
        results,
      });
    } catch (err) {
      logger.warn({ err, runId }, 'LoreAgentOrchestrator: proposal routing failed (non-fatal)');
    }
  }

  logger.info(
    {
      runId,
      messageId: params.messageId,
      agents: results.map((r) => r.agentName),
      proposedActions: proposedCount,
    },
    'LoreAgentOrchestrator: completed'
  );

  return { runId, results };
}
