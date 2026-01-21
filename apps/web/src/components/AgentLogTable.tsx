import { Filter } from 'lucide-react';
import { useMemo, useState } from 'react';

export type AgentLog = {
  id?: number;
  agent_name: string;
  status: string;
  output: Record<string, unknown>;
  created_at?: string;
};

export const AgentLogTable = ({ logs }: { logs: AgentLog[] }) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
        const matchesAgent = agentFilter === 'all' || log.agent_name === agentFilter;
        return matchesStatus && matchesAgent;
      }),
    [logs, statusFilter, agentFilter]
  );

  const uniqueAgents = Array.from(new Set(logs.map((log) => log.agent_name)));

  return (
    <div className="rounded-lg sm:rounded-2xl border border-purple-800/40 bg-black/60 p-3 sm:p-4 shadow-lg shadow-purple-900/30">
      <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-white/70">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
          <Filter className="h-4 w-4 text-primary" />
          Log Filters
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-white/60">
          <label className="flex items-center gap-2">
            Status
            <select
              className="rounded-lg border border-purple-800/50 bg-black/80 px-2 py-1.5 sm:py-1 text-white min-h-[44px] sm:min-h-0"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All</option>
              <option value="ok">OK</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Agent
            <select
              className="rounded-lg border border-purple-800/50 bg-black/80 px-2 py-1.5 sm:py-1 text-white min-h-[44px] sm:min-h-0"
              value={agentFilter}
              onChange={(event) => setAgentFilter(event.target.value)}
            >
              <option value="all">All</option>
              {uniqueAgents.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-lg sm:rounded-xl border border-purple-800/20 bg-purple-950/20">
        <table className="w-full text-left text-xs text-white/80 min-w-[600px]">
          <thead className="bg-purple-900/40 uppercase tracking-[0.2em] text-[10px] text-white/60">
            <tr>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Agent</th>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Status</th>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap hidden sm:table-cell">Created</th>
              <th className="px-2 sm:px-3 py-2 whitespace-nowrap">Output</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={`${log.agent_name}-${log.created_at ?? Math.random()}`} className="border-t border-purple-800/30">
                <td className="px-2 sm:px-3 py-2 font-semibold text-white">{log.agent_name}</td>
                <td className="px-2 sm:px-3 py-2 text-primary">{log.status}</td>
                <td className="px-2 sm:px-3 py-2 text-white/60 hidden sm:table-cell">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                </td>
                <td className="px-2 sm:px-3 py-2 text-white/70">
                  <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-all text-[10px] sm:text-xs">
                    {JSON.stringify(log.output, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-white/50">
                  No logs captured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
