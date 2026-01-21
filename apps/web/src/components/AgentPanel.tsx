import { Bot, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { fetchJson } from '../lib/api';
import { AgentCard, type AgentSummary } from './AgentCard';
import { AgentLogTable, type AgentLog } from './AgentLogTable';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export const AgentPanel = () => {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

  const lastRunMap = useMemo(
    () => Object.fromEntries(agents.map((agent) => [agent.name, agent.last_run ?? null])),
    [agents]
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ agents: AgentSummary[]; logs: AgentLog[] }>('/api/agents/status');
      setAgents(data.agents);
      setLogs(data.logs);
    } catch (error) {
      console.error('Failed to load agent status', error);
    } finally {
      setLoading(false);
    }
  };

  const runAgent = async (name: string) => {
    setRunningAgent(name);
    try {
      const data = await fetchJson<{ result: Record<string, unknown>; log: AgentLog }>(`/api/agents/run/${name}`, {
        method: 'POST'
      });
      setLogs((prev) => [data.log, ...prev]);
      setAgents((prev) =>
        prev.map((agent) =>
          agent.name === name
            ? { ...agent, last_run: data.log.created_at ?? new Date().toISOString(), last_status: data.log.status, last_output: data.log.output }
            : agent
        )
      );
    } catch (error) {
      console.error('Failed to run agent', error);
    } finally {
      setRunningAgent(null);
    }
  };

  const runAll = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ results: Record<string, any>; logs: AgentLog[] }>('/api/agents/run-all', {
        method: 'POST'
      });
      setLogs((prev) => [...data.logs, ...prev]);
      setAgents((prev) =>
        prev.map((agent) => {
          const log = data.logs.find((entry) => entry.agent_name === agent.name);
          if (!log) return agent;
          return { ...agent, last_run: log.created_at ?? new Date().toISOString(), last_status: log.status, last_output: log.output };
        })
      );
      return data.results;
    } catch (error) {
      console.error('Failed to run all agents', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-4">
      <Card className="border border-purple-800/60 bg-gradient-to-br from-purple-950/50 via-black to-purple-950/30 shadow-lg shadow-purple-900/40">
        <CardHeader className="flex items-center justify-between space-y-0 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Omega Agent Network</p>
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <Bot className="h-5 w-5 text-primary" /> Autonomous Maintenance Layer
            </CardTitle>
            <p className="text-sm text-white/60">Self-healing agents guard drift, metadata, timelines, and nightly summaries.</p>
          </div>
          <Button variant="outline" size="sm" disabled={loading} leftIcon={<RotateCw className="h-4 w-4" />} onClick={runAll}>
            {loading ? 'Running cycle...' : 'Run All'}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} running={runningAgent === agent.name} onRun={() => runAgent(agent.name)} />
          ))}
          {!agents.length && (
            <div className="col-span-full text-sm text-white/60">Loading agents...</div>
          )}
        </CardContent>
      </Card>
      <AgentLogTable logs={logs} />
      <p className="text-xs text-white/50">
        {Object.keys(lastRunMap).length} agents registered · Last refresh{' '}
        {loading ? 'syncing...' : new Date().toLocaleTimeString()}
      </p>
    </div>
  );
};
