/**
 * Logs Viewer Component
 * Professional log viewer with stream feed style, filtering, and expandable details
 */

import { useState, useEffect, useRef } from 'react';
import { fetchJson } from '../../lib/api';
import { RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { generateMockLogs, type Log } from '../../lib/mockData';

export const LogsViewer = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [isMockData, setIsMockData] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadLogs();

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadLogs();
      }, 5000); // Refresh every 5 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, levelFilter, sourceFilter, timeRange]);

  const loadLogs = async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (levelFilter !== 'all') {
        params.append('level', levelFilter);
      }
      if (sourceFilter !== 'all') {
        params.append('source', sourceFilter);
      }
      params.append('timeRange', timeRange);
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      params.append('limit', '100');

      const response = await fetchJson<{ logs: Log[] }>(
        `/api/admin/logs?${params.toString()}`
      );
      
      if (response.logs && response.logs.length > 0) {
        setLogs(response.logs);
        setIsMockData(false);
      } else {
        // Use mock data if API returns empty
        const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : timeRange === '30d' ? 720 : 24;
        const mockData = generateMockLogs(50, {
          level: levelFilter !== 'all' ? levelFilter as any : undefined,
          source: sourceFilter !== 'all' ? sourceFilter as any : undefined,
          timeRange: hours,
        });
        setLogs(mockData);
        setIsMockData(true);
      }
    } catch (err: any) {
      // Use mock data on error
      const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : timeRange === '30d' ? 720 : 24;
      const mockData = generateMockLogs(50, {
        level: levelFilter !== 'all' ? levelFilter as any : undefined,
        source: sourceFilter !== 'all' ? sourceFilter as any : undefined,
        timeRange: hours,
      });
      setLogs(mockData);
      setIsMockData(true);
      console.error('Logs load error, using mock data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const getLevelColor = (level: string) => {
    const l = level.toLowerCase();
    if (l === 'error') return 'bg-red-500/20 border-red-500/50 text-red-400';
    if (l === 'warn') return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400';
    if (l === 'info') return 'bg-blue-500/20 border-blue-500/50 text-blue-400';
    if (l === 'debug') return 'bg-purple-500/20 border-purple-500/50 text-purple-400';
    return 'bg-white/5 border-white/10 text-white/60';
  };

  const getSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      api: 'bg-cyan-500/20 text-cyan-400',
      database: 'bg-orange-500/20 text-orange-400',
      auth: 'bg-pink-500/20 text-pink-400',
      system: 'bg-cyan-500/20 text-cyan-400',
      stripe: 'bg-indigo-500/20 text-indigo-400',
      webhook: 'bg-green-500/20 text-green-400',
      job: 'bg-violet-500/20 text-violet-400',
    };
    return colors[source] || 'bg-white/5 text-white/60';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimestampAbsolute = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const filteredLogs = logs.filter(log => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(query) ||
        log.source.toLowerCase().includes(query) ||
        (log.userId && log.userId.toLowerCase().includes(query)) ||
        (log.requestId && log.requestId.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const levels = ['all', 'error', 'warn', 'info', 'debug'];
  const sources = ['all', 'api', 'database', 'auth', 'system', 'stripe', 'webhook', 'job'];
  const timeRanges = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24h' },
    { value: '7d', label: 'Last 7d' },
    { value: '30d', label: 'Last 30d' },
    { value: 'all', label: 'All Time' },
  ];

  if (loading && logs.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-black/40 p-6">
        <div className="text-white/60">Loading logs...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-black/40 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">System Logs</h3>
          {isMockData && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
              Demo Data
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Time Range */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-1.5 bg-black/40 border border-border/60 rounded-lg text-white text-sm focus:outline-none focus:border-primary/50"
          >
            {timeRanges.map((tr) => (
              <option key={tr.value} value={tr.value}>
                {tr.label}
              </option>
            ))}
          </select>
          
          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-1.5 bg-black/40 border border-border/60 rounded-lg text-white text-sm focus:outline-none focus:border-primary/50"
          >
            {sources.map((source) => (
              <option key={source} value={source}>
                {source === 'all' ? 'All Sources' : source.charAt(0).toUpperCase() + source.slice(1)}
              </option>
            ))}
          </select>
          
          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-1.5 bg-black/40 border border-border/60 rounded-lg text-white text-sm focus:outline-none focus:border-primary/50"
          >
            {levels.map((level) => (
              <option key={level} value={level}>
                {level === 'all' ? 'All Levels' : level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
          
          {/* Auto-refresh */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
              autoRefresh
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </button>
          
          {/* Manual Refresh */}
          <button
            onClick={loadLogs}
            className="px-3 py-1.5 rounded-lg text-sm bg-white/5 text-white/60 hover:bg-white/10 border border-transparent transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search logs by message, source, user ID, or request ID..."
          className="w-full pl-10 pr-10 py-2 bg-black/40 border border-border/60 rounded-lg text-white text-sm focus:outline-none focus:border-primary/50 placeholder-white/40"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && !isMockData && (
        <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/50 p-3 text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Logs Feed */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            No logs found matching your filters
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogs.has(log.id);
            const hasDetails = log.stackTrace || log.metadata || log.userId || log.requestId;
            
            return (
              <div
                key={log.id}
                className={`rounded-lg border p-3 ${getLevelColor(log.level)}`}
              >
                <div className="flex items-start gap-3">
                  {/* Level Badge */}
                  <span className="px-2 py-0.5 text-xs font-semibold rounded border border-current/30">
                    {log.level.toUpperCase()}
                  </span>
                  
                  {/* Source Tag */}
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${getSourceColor(log.source)}`}>
                    {log.source}
                  </span>
                  
                  {/* Timestamp */}
                  <span 
                    className="text-xs opacity-75 cursor-help" 
                    title={formatTimestampAbsolute(log.timestamp)}
                  >
                    {formatTimestamp(log.timestamp)}
                  </span>
                  
                  {/* Message */}
                  <div className="flex-1 font-mono text-sm">
                    {log.message}
                  </div>
                  
                  {/* Expand Button */}
                  {hasDetails && (
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="text-white/40 hover:text-white/60 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
                
                {/* Expanded Details */}
                {isExpanded && hasDetails && (
                  <div className="mt-3 pt-3 border-t border-current/20 space-y-2">
                    {log.userId && (
                      <div className="text-xs">
                        <span className="opacity-60">User ID:</span>{' '}
                        <span className="font-mono">{log.userId}</span>
                      </div>
                    )}
                    {log.requestId && (
                      <div className="text-xs">
                        <span className="opacity-60">Request ID:</span>{' '}
                        <span className="font-mono">{log.requestId}</span>
                      </div>
                    )}
                    {log.stackTrace && (
                      <div className="text-xs">
                        <div className="opacity-60 mb-1">Stack Trace:</div>
                        <pre className="font-mono text-xs bg-black/40 p-2 rounded border border-current/10 overflow-x-auto">
                          {log.stackTrace}
                        </pre>
                      </div>
                    )}
                    {log.metadata && (
                      <div className="text-xs">
                        <div className="opacity-60 mb-1">Metadata:</div>
                        <pre className="font-mono text-xs bg-black/40 p-2 rounded border border-current/10 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {/* Footer Stats */}
      <div className="mt-4 pt-4 border-t border-border/20 text-xs text-white/50">
        Showing {filteredLogs.length} of {logs.length} logs
        {searchQuery && ` (filtered by "${searchQuery}")`}
      </div>
    </div>
  );
};

