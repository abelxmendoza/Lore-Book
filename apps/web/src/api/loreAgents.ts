import { fetchJson } from '../lib/api';

export type LoreAgentRun = {
  agent_name: string;
  run_id: string;
  status?: string;
  confidence?: number | null;
  duration_ms?: number | null;
  warnings?: Array<{ code: string; message: string; severity: string }>;
};

export type LoreAgentObservation = {
  agent_name: string;
  kind: string;
  summary: string;
  confidence?: number | null;
  evidence?: Array<{ kind: string; ref: string; detail: string; sourceFile?: string }>;
};

export type LoreAgentProposedAction = {
  agent_name: string;
  action_type: string;
  status?: string;
  confidence?: number | null;
  requires_confirmation?: boolean;
  routed_to?: string | null;
  payload?: Record<string, unknown>;
};

export type LoreAgentPipelineTrace = {
  messageId: string;
  phases: string[];
  lexicalConfidence?: number;
  meaningConfidence?: number;
  factuality?: string;
} | null;

export type LoreAgentTrace = {
  enabled: boolean;
  messageId: string;
  pipeline: LoreAgentPipelineTrace;
  runs: LoreAgentRun[];
  observations: LoreAgentObservation[];
  proposedActions: LoreAgentProposedAction[];
};

/** Fetch the "How LoreBook Understood This" trace for one message. */
export async function getLoreAgentTrace(messageId: string): Promise<LoreAgentTrace> {
  return fetchJson<LoreAgentTrace>(`/api/lore-agents/trace/${messageId}`);
}
