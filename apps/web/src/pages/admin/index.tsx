import { useState, useEffect } from 'react';
import { Users, FileText, Sparkles, Zap, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../lib/supabase';
import { fetchJson } from '../../lib/api';
import { AdminSidebar } from '../../components/admin/AdminSidebar';
import { AdminCard } from '../../components/admin/AdminCard';
import { AdminTable } from '../../components/admin/AdminTable';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { FinanceDashboard } from '../../components/admin/FinanceDashboard';
import { canAccessAdmin } from '../../middleware/roleGuard';
import { config } from '../../config/env';
import NotFound from '../../routes/NotFound';

type AdminView = 'dashboard' | 'users' | 'logs' | 'ai-events' | 'tools' | 'feature-flags' | 'finance';

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

  // Check if user is admin
  const isAdmin = canAccessAdmin(user || null);

  useEffect(() => {
    // In production, strictly require admin access
    if (config.env.isProduction && !isAdmin) {
      window.location.href = '/';
      return;
    }

    // In development, allow access for testing but still check
    if (!isAdmin) {
      window.location.href = '/';
      return;
    }

    // Load initial data
    loadDashboardData();
  }, [isAdmin]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Generate mock data for development
      const mockMetrics: AdminMetrics = {
        totalUsers: 42,
        totalMemories: 1250,
        newUsersLast7Days: 8,
        aiGenerationsToday: 156,
        errorLogsLast24h: 3,
      };

      const mockUsers: User[] = [
        { id: '1', email: 'abelxmendoza@gmail.com', createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), memoryCount: 450, role: 'admin' },
        { id: '2', email: 'user1@example.com', createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), memoryCount: 120 },
        { id: '3', email: 'user2@example.com', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), memoryCount: 45 },
        { id: '4', email: 'user3@example.com', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), memoryCount: 12 },
      ];

      const mockLogs: Log[] = [
        { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), level: 'error', message: 'Database connection timeout' },
        { timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), level: 'warn', message: 'Rate limit approaching for user_id: abc123' },
        { timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), level: 'info', message: 'New user registered: user4@example.com' },
      ];

      const mockAiEvents: AIEvent[] = [
        { timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), type: 'chat', tokens: 1250, userId: '1' },
        { timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(), type: 'summary', tokens: 850, userId: '2' },
        { timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(), type: 'chat', tokens: 2100, userId: '1' },
      ];

      // Try to fetch real data, fallback to mock data if toggle is enabled
      const useMock = shouldUseMockData();
      try {
        const metricsData = await fetchJson<AdminMetrics>('/api/admin/metrics', undefined, {
          useMockData: useMock,
          mockData: mockMetrics,
        });
        setMetrics(metricsData);
      } catch {
        if (useMock) {
          setMetrics(mockMetrics);
        }
      }

      try {
        const usersData = await fetchJson<{ users: User[] }>('/api/admin/users', undefined, {
          useMockData: useMock,
          mockData: { users: mockUsers },
        });
        setUsers(usersData.users);
      } catch {
        if (useMock) {
          setUsers(mockUsers);
        }
      }

      try {
        const logsData = await fetchJson<{ logs: Log[] }>('/api/admin/logs', undefined, {
          useMockData: useMock,
          mockData: { logs: mockLogs },
        });
        setLogs(logsData.logs);
      } catch {
        if (useMock) {
          setLogs(mockLogs);
        }
      }

      try {
        const eventsData = await fetchJson<{ events: AIEvent[] }>('/api/admin/ai-events', undefined, {
          useMockData: useMock,
          mockData: { events: mockAiEvents },
        });
        setAiEvents(eventsData.events);
      } catch {
        if (useMock) {
          setAiEvents(mockAiEvents);
        }
      }
    } catch (err: any) {
      // If all requests fail, use mock data
      console.warn('Using mock admin data:', err.message);
      setMetrics({
        totalUsers: 42,
        totalMemories: 1250,
        newUsersLast7Days: 8,
        aiGenerationsToday: 156,
        errorLogsLast24h: 3,
      });
      setUsers([
        { id: '1', email: 'abelxmendoza@gmail.com', createdAt: new Date().toISOString(), memoryCount: 450, role: 'admin' },
        { id: '2', email: 'user1@example.com', createdAt: new Date().toISOString(), memoryCount: 120 },
      ]);
      setLogs([]);
      setAiEvents([]);
      setError(null); // Don't show error if using mock data
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string) => {
    try {
      setError(null);
      await fetchJson(`/api/admin/${action}`, { method: 'POST' });
      // Reload data after action
      await loadDashboardData();
    } catch (err: any) {
      setError(err.message || `Failed to execute ${action}`);
    }
  };

  // In production, show 404 instead of null to prevent route discovery
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
        <AdminHeader />
        
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/50 p-4 text-red-200">
            {error}
          </div>
        )}

        {loading && currentView === 'dashboard' ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-white/60">Loading admin data...</div>
          </div>
        ) : (
          <>
            {currentView === 'dashboard' && metrics && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <AdminCard
                    title="Total Users"
                    value={metrics.totalUsers}
                    icon={Users}
                  />
                  <AdminCard
                    title="Total Memories"
                    value={metrics.totalMemories}
                    icon={FileText}
                  />
                  <AdminCard
                    title="New Users (7d)"
                    value={metrics.newUsersLast7Days}
                    icon={Sparkles}
                  />
                  <AdminCard
                    title="AI Generations (Today)"
                    value={metrics.aiGenerationsToday}
                    icon={Zap}
                  />
                  <AdminCard
                    title="Error Logs (24h)"
                    value={metrics.errorLogsLast24h}
                    icon={AlertTriangle}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                    <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleAction('reindex')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Reindex Embeddings
                      </button>
                      <button
                        onClick={() => handleAction('flush-cache')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Flush Cache
                      </button>
                      <button
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
                <h2 className="text-xl font-semibold mb-4">Users</h2>
                <AdminTable
                  columns={['id', 'email', 'createdAt', 'memoryCount', 'role']}
                  data={users}
                />
              </div>
            )}

            {currentView === 'logs' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Logs</h2>
                <AdminTable
                  columns={['timestamp', 'level', 'message']}
                  data={logs}
                />
              </div>
            )}

            {currentView === 'ai-events' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">AI Events</h2>
                <AdminTable
                  columns={['timestamp', 'type', 'tokens', 'userId']}
                  data={aiEvents}
                />
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
                        onClick={() => handleAction('reindex')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Reindex Embeddings
                      </button>
                      <button
                        onClick={() => handleAction('flush-cache')}
                        className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition"
                      >
                        Flush Cache
                      </button>
                      <button
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

            {currentView === 'finance' && (
              <FinanceDashboard />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPage;

