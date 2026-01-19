import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

type AgentDefinition = {
  name: string;
  description: string;
};

type AgentLog = {
  id?: number;
  agent_name: string;
  status: string;
  output: Record<string, unknown>;
  created_at?: string;
};

const agentCatalog: AgentDefinition[] = [
  { name: 'drift_repair', description: 'Fixes timeline drift, contradictions, duplicates, and incoherent arcs.' },
  { name: 'metadata_enrichment', description: 'Adds tags, sentiment, locations, characters, themes.' },
  { name: 'narrative_completion', description: 'Regenerates missing arcs, stitches story gaps, smooths transitions.' },
  { name: 'embedding_refresh', description: 'Refreshes decayed embeddings, updates pgvector, re-indexes search.' },
  { name: 'character_graph', description: 'Fixes character duplicates, alias collisions, relationship inconsistencies.' },
  { name: 'timeline_integrity', description: 'Ensures correct timestamps, shard alignment, unique hashes.' },
  { name: 'task_hygiene', description: 'Auto-categorizes tasks, detects stale tasks, reprioritizes.' },
  { name: 'identity_evolution', description: 'Runs identity shift detection, updates identity versions, finds motifs.' },
  { name: 'summary_agent', description: 'Nightly summaries, weekly arcs, monthly reports.' }
];

class AgentService {
  private memoryLogs: AgentLog[] = [];

  async listAgents() {
    const summaries = await Promise.all(agentCatalog.map(async (agent) => ({ ...agent, ...(await this.getLastRun(agent.name)) })));
    const logs = await this.listLogs();
    return { agents: summaries, logs };
  }

  async runAgent(agentName: string) {
    const agent = agentCatalog.find((item) => item.name === agentName);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    const output = this.buildMockOutput(agentName);
    const log = await this.recordLog({ agent_name: agentName, status: output.status ?? 'ok', output });

    return { result: output, log };
  }

  async runAllAgents() {
    const entries = await Promise.all(agentCatalog.map((agent) => this.runAgent(agent.name)));
    return {
      results: Object.fromEntries(agentCatalog.map((agent, index) => [agent.name, entries[index].result])),
      logs: entries.map((entry) => entry.log)
    };
  }

  private async recordLog(log: AgentLog): Promise<AgentLog> {
    const { data, error } = await supabaseAdmin
      .from('agent_logs')
      .insert({ agent_name: log.agent_name, status: log.status, output: log.output })
      .select('*')
      .single();

    if (error) {
      logger.warn({ error }, 'Falling back to in-memory agent logs');
      const fallback = { ...log, created_at: new Date().toISOString(), id: this.memoryLogs.length + 1 };
      this.memoryLogs.unshift(fallback);
      return fallback;
    }

    return data as AgentLog;
  }

  private async listLogs(limit = 50): Promise<AgentLog[]> {
    const { data, error } = await supabaseAdmin
      .from('agent_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      if (error) {
        logger.warn({ error }, 'Unable to load agent logs from database; using memory logs');
      }
      return this.memoryLogs.slice(0, limit);
    }

    return data as AgentLog[];
  }

  private async getLastRun(agentName: string) {
    const { data, error } = await supabaseAdmin
      .from('agent_logs')
      .select('*')
      .eq('agent_name', agentName)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      if (error) {
        logger.debug({ error }, 'No persisted log for agent; checking memory logs');
      }
      const memoryLog = this.memoryLogs.find((log) => log.agent_name === agentName);
      return {
        last_run: memoryLog?.created_at ?? null,
        last_status: memoryLog?.status ?? null,
        last_output: memoryLog?.output ?? null
      };
    }

    return {
      last_run: data.created_at,
      last_status: data.status,
      last_output: data.output
    };
  }

  private buildMockOutput(agentName: string): Record<string, any> {
    switch (agentName) {
      case 'drift_repair':
        return { status: 'ok', fixed_issues: [], actions: ['audited timelines', 'reconciled duplicates'] };
      case 'metadata_enrichment':
        return { status: 'ok', tags_added: 4, sentiment: 'balanced' };
      case 'narrative_completion':
        return { status: 'ok', completed_segments: 2, notes: 'Filled missing chapter transitions' };
      case 'embedding_refresh':
        return { status: 'ok', vector_count: 128, refreshed: true };
      case 'character_graph':
        return { status: 'ok', merged_characters: ['alias_merge'], relationship_updates: 1 };
      case 'timeline_integrity':
        return { status: 'ok', validated: true, alignment: 'stable' };
      case 'task_hygiene':
        return { status: 'ok', reprioritized: 3, stale_tasks: ['archive reports'] };
      case 'identity_evolution':
        return { status: 'ok', shifts: ['mentor_arc'], motifs: ['resilience'] };
      case 'summary_agent':
      default:
        return { status: 'ok', summaries_generated: 1 };
    }
  }
}

export const agentService = new AgentService();
