import { useState, useEffect } from 'react';
import { fetchJson } from '../../lib/api';

interface Log {
  timestamp: string;
  level: string;
  message: string;
}

export const LiveLogs = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!autoRefresh) return;

    const loadLogs = async () => {
      try {
        const data = await fetchJson<{ logs: Log[] }>('/api/dev/logs?limit=100');
        setLogs(data.logs || []);
      } catch (err) {
        console.error('Failed to load logs:', err);
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
    const interval = setInterval(loadLogs, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.level.toLowerCase() === filter.toLowerCase());

  const getLevelColor = (level: string) => {
    const l = level.toLowerCase();
    if (l === 'error') return 'text-red-400';
    if (l === 'warn') return 'text-yellow-400';
    if (l === 'info') return 'text-blue-400';
    return 'text-white/70';
  };

  return (
    <div className="rounded-lg border border-orange-500/30 bg-black/40 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Live Logs</h2>
        <div className="flex items-center gap-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-orange-500/30 bg-black/60 px-3 py-1 text-sm text-white"
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
        </div>
      </div>

      <div className="max-h-[600px] overflow-y-auto font-mono text-xs">
        {loading ? (
          <div className="text-white/60">Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-white/60">No logs available</div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div key={idx} className="border-b border-orange-500/10 py-2">
              <div className="flex items-start gap-4">
                <span className="text-white/50">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`font-semibold ${getLevelColor(log.level)}`}>
                  {log.level.toUpperCase()}
                </span>
                <span className="text-white/80 flex-1">{log.message}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

