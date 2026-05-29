import { useState, useEffect } from 'react';
import { Users, FileText, Sparkles, Zap, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../lib/supabase';
import { fetchJson } from '../../lib/api';
import { AdminSidebar, type AdminSection } from '../../components/admin/AdminSidebar';
import { AdminCard } from '../../components/admin/AdminCard';
import { AdminTable } from '../../components/admin/AdminTable';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { FinanceDashboard } from '../../components/admin/FinanceDashboard';
import { canAccessAdmin } from '../../middleware/roleGuard';
import { config } from '../../config/env';
import NotFound from '../../routes/NotFound';

type AdminView = AdminSection;

interface AdminMetrics {
  totalUsers: number;
  totalMemories: number;
  newUsersLast7Days: number;
  aiGenerationsToday: number;
  errorLogsLast24h: number;
}

interface User {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt?: string;
  memoryCount: number;
  role?: string;
}

interface Log {
  timestamp: string;
  level: string;
  message: string;
}

interface AIEvent {
  timestamp: string;
  type: string;
  tokens: number;
  userId: string;
}

export const AdminPage = () => {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [aiEvents, setAiEvents] = useState<AIEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = canAccessAdmin(user || null);

  useEffect(() => {
    if (!isAdmin) {
      window.location.href = '/';
      return;
    }
    loadDashboardData();
  }, [isAdmin]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [metricsResult, usersResult, logsResult, eventsResult] = await Promise.allSettled([
        fetchJson<AdminMetrics>('/api/admin/metrics'),
        fetchJson<{ users: User[]; total: number }>('/api/admin/users'),
        fetchJson<{ logs: Log[] }>('/api/admin/logs'),
        fetchJson<{ events: AIEvent[] }>('/api/admin/ai-events'),
      ]);

      if (metricsResult.status === 'fulfilled') {
        setMetrics(metricsResult.value);
      } else {
        console.error('Failed to load metrics:', metricsResult.reason);
      }

      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value.users);
      } else {
        console.error('Failed to load users:', usersResult.reason);
      }

      if (logsResult.status === 'fulfilled') {
        setLogs(logsResult.value.logs);
      } else {
        console.error('Failed to load logs:', logsResult.reason);
      }

      if (eventsResult.status === 'fulfilled') {
        setAiEvents(eventsResult.value.events);
      } else {
        console.error('Failed to load AI events:', eventsResult.reason);
      }

      // Surface error only if all critical fetches failed
      if (metricsResult.status === 'rejected' && usersResult.status === 'rejected') {
        setError('Failed to load admin data. Check server connectivity.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string) => {
    try {
      setError(null);
      await fetchJson(`/api/admin/${action}`, { method: 'POST' });
      await loadDashboardData();
    } catch (err: any) {
      setError(err.message || `Failed to execute ${action}`);
    }
  };

  if (!isAdmin) {
    if (config.env.isProduction) {
      return <NotFound />;
    }
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900">
      <AdminSidebar activeSection={currentView} onSectionChange={setCurrentView} />
      <main className="flex-1 p-6 text-white">
        <AdminHeader title="Admin Console" subtitle="Production Administration" badge="ADMIN" />

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/50 p-4 text-red-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && currentView === 'dashboard' ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-white/60">Loading admin data...</div>
          </div>
        ) : (
          <>
            {currentView === 'dashboard' && (
              <div className="space-y-6">
                {metrics ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminCard title="Total Users" value={metrics.totalUsers} icon={Users} />
                    <AdminCard title="Total Memories" value={metrics.totalMemories} icon={FileText} />
                    <AdminCard title="New Users (7d)" value={metrics.newUsersLast7Days} icon={Sparkles} />
                    <AdminCard title="AI Generations (Today)" value={metrics.aiGenerationsToday} icon={Zap} />
                    <AdminCard title="Error Logs (24h)" value={metrics.errorLogsLast24h} icon={AlertTriangle} />
                  </div>
                ) : (
                  <div className="rounded-lg border border-red-500/30 bg-black/40 p-4 text-red-300 text-sm">
                    Metrics unavailable — server may be offline.
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                    <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => handleAction('reindex')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Reindex Embeddings
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction('flush-cache')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Flush Cache
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction('rebuild-clusters')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Rebuild Clusters
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentView === 'users' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Users</h2>
                  <span className="text-sm text-white/50">{users.length} total</span>
                </div>
                {users.length === 0 ? (
                  <p className="text-white/40 text-sm">No users found — server may be offline.</p>
                ) : (
                  <AdminTable
                    columns={['email', 'role', 'memoryCount', 'lastSignInAt', 'createdAt']}
                    data={users}
                  />
                )}
              </div>
            )}

            {currentView === 'logs' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">System Logs</h2>
                {logs.length === 0 ? (
                  <p className="text-white/40 text-sm">No logs available — logging service not yet connected.</p>
                ) : (
                  <AdminTable columns={['timestamp', 'level', 'message']} data={logs} />
                )}
              </div>
            )}

            {currentView === 'ai-events' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">AI Events</h2>
                {aiEvents.length === 0 ? (
                  <p className="text-white/40 text-sm">No AI events recorded — AI event tracking not yet connected.</p>
                ) : (
                  <AdminTable columns={['timestamp', 'type', 'tokens', 'userId']} data={aiEvents} />
                )}
              </div>
            )}

            {currentView === 'engine-health' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Engine Health</h2>
                <p className="text-white/40 text-sm">Engine health monitoring coming soon...</p>
              </div>
            )}

            {currentView === 'tools' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Admin Tools</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2">System Actions</h3>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => handleAction('reindex')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Reindex Embeddings
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction('flush-cache')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Flush Cache
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction('rebuild-clusters')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Rebuild Clusters
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentView === 'feature-flags' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Feature Flags</h2>
                <p className="text-white/60">Feature flag management coming soon...</p>
              </div>
            )}

            {currentView === 'finance' && <FinanceDashboard />}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
