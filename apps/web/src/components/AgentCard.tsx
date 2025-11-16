import { Activity, AlarmClock, Cpu, Database, Network, Shield, Sparkles, Wand2 } from 'lucide-react';

import { AgentRunButton } from './AgentRunButton';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export type AgentSummary = {
  name: string;
  description: string;
  last_run?: string | null;
  last_status?: string | null;
  last_output?: Record<string, unknown> | null;
};

const iconMap: Record<string, JSX.Element> = {
  drift_repair: <Network className="h-4 w-4 text-primary" />,
  metadata_enrichment: <Sparkles className="h-4 w-4 text-primary" />,
  narrative_completion: <Wand2 className="h-4 w-4 text-primary" />,
  embedding_refresh: <Database className="h-4 w-4 text-primary" />,
  character_graph: <Shield className="h-4 w-4 text-primary" />,
  timeline_integrity: <AlarmClock className="h-4 w-4 text-primary" />,
  task_hygiene: <Activity className="h-4 w-4 text-primary" />,
  identity_evolution: <Cpu className="h-4 w-4 text-primary" />,
  summary_agent: <Sparkles className="h-4 w-4 text-primary" />
};

export const AgentCard = ({ agent, running, onRun }: { agent: AgentSummary; running: boolean; onRun: () => Promise<void> }) => (
  <Card className="border border-purple-800/40 bg-black/50 shadow-lg shadow-purple-900/30">
    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
      <div className="flex items-center gap-2 text-white/80">
        {iconMap[agent.name] ?? <Sparkles className="h-4 w-4 text-primary" />}
        <CardTitle className="text-base capitalize text-white">{agent.name.replace('_', ' ')}</CardTitle>
      </div>
      <AgentRunButton running={running} onRun={onRun} />
    </CardHeader>
    <CardContent className="space-y-3 text-sm text-white/70">
      <p className="leading-relaxed text-white/70">{agent.description}</p>
      <div className="flex flex-wrap gap-4 text-xs text-white/50">
        <div>
          <p className="uppercase tracking-[0.2em] text-white/40">Last Run</p>
          <p className="text-white/80">{agent.last_run ? new Date(agent.last_run).toLocaleString() : 'Never'}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.2em] text-white/40">Status</p>
          <p className="text-white/80">{agent.last_status ?? '—'}</p>
        </div>
      </div>
      {agent.last_output && (
        <div className="rounded-lg border border-purple-800/40 bg-purple-950/30 p-3 text-xs text-white/70">
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-primary/70">Last Output</p>
          <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-all text-white/80">
            {JSON.stringify(agent.last_output, null, 2)}
          </pre>
        </div>
      )}
    </CardContent>
  </Card>
);
