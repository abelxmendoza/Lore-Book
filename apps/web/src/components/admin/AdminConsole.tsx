import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/supabase';
import { fetchJson } from '../../lib/api';
import { AdminSidebar, type AdminSection } from './AdminSidebar';
import { AdminCard } from './AdminCard';
import { AdminTable } from './AdminTable';
import { AdminHeader } from './AdminHeader';
import { FinanceDashboard } from './FinanceDashboard';
import { LogsViewer } from './LogsViewer';
import { EngineHealthDashboard } from './EngineHealthDashboard';
import { canAccessAdmin } from '../../middleware/roleGuard';
import { Users, FileText, Zap, Database, AlertTriangle } from 'lucide-react';

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


interface AIEvent {
  timestamp: string;
  type: string;
  tokens: number;
  userId: string;
}

export const AdminConsole = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [aiEvents, setAiEvents] = useState<AIEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is admin
  const isAdmin = canAccessAdmin(user || null);

  useEffect(() => {
    // In development mode, allow access for testing
    // In production, redirect if not admin
    const apiEnv = import.meta.env.VITE_API_ENV || import.meta.env.MODE || 'dev';
    if (!isAdmin && apiEnv !== 'dev' && apiEnv !== 'development') {
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

      // Fetch metrics
      const metricsData = await fetchJson<AdminMetrics>('/api/admin/metrics');
      setMetrics(metricsData);

      // Fetch users
      const usersData = await fetchJson<{ users: User[] }>('/api/admin/users');
      setUsers(usersData.users);

      // Fetch AI events
      const eventsData = await fetchJson<{ events: AIEvent[] }>('/api/admin/ai-events');
      setAiEvents(eventsData.events);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data');
      console.error('Admin data load error:', err);
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

  if (!isAdmin) {
    return null;
  }

  const getSectionTitle = () => {
    switch (activeSection) {
      case 'dashboard': return 'Dashboard';
      case 'users': return 'User Management';
      case 'logs': return 'System Logs';
      case 'ai-events': return 'AI Generation Events';
      case 'engine-health': return 'Engine Health';
      case 'tools': return 'Admin Tools';
      case 'feature-flags': return 'Feature Flags';
      case 'finance': return 'Finance Dashboard';
      default: return 'Admin Console';
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <AdminSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <main className="flex-1 p-6 text-white">
        <AdminHeader 
          title={getSectionTitle()}
          subtitle={activeSection === 'dashboard' ? 'System overview and metrics' : activeSection === 'finance' ? 'Revenue, subscriptions, and payment analytics' : undefined}
          badge={activeSection === 'finance' ? 'PROD' : undefined}
        />
        
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/50 p-4 text-red-200 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        )}

        {loading && activeSection === 'dashboard' ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-white/60">Loading admin data...</div>
          </div>
        ) : (
          <>
            {activeSection === 'dashboard' && metrics && (
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
                    icon={Users}
                    trend={{ value: 12, isPositive: true }}
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
                    description="System errors in the last 24 hours"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-lg border border-border/60 bg-black/40 p-4">
                    <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleAction('reindex')}
                        className="w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm hover:bg-primary/20 transition"
                      >
                        Reindex Embeddings
                      </button>
                      <button
                        onClick={() => handleAction('flush-cache')}
                        className="w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm hover:bg-primary/20 transition"
                      >
                        Flush Cache
                      </button>
                      <button
                        onClick={() => handleAction('rebuild-clusters')}
                        className="w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm hover:bg-primary/20 transition"
                      >
                        Rebuild Clusters
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'users' && (
              <div className="rounded-lg border border-border/60 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Users</h2>
                <AdminTable
                  columns={['id', 'email', 'createdAt', 'memoryCount', 'role']}
                  data={users}
                />
              </div>
            )}

            {activeSection === 'logs' && (
              <LogsViewer />
            )}

            {activeSection === 'ai-events' && (
              <div className="rounded-lg border border-border/60 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">AI Events</h2>
                <AdminTable
                  columns={['timestamp', 'type', 'tokens', 'userId']}
                  data={aiEvents}
                />
              </div>
            )}

            {activeSection === 'engine-health' && (
              <EngineHealthDashboard />
            )}

            {activeSection === 'tools' && (
              <div className="rounded-lg border border-border/60 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Admin Tools</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2">System Actions</h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleAction('reindex')}
                        className="w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm hover:bg-primary/20 transition"
                      >
                        Reindex Embeddings
                      </button>
                      <button
                        onClick={() => handleAction('flush-cache')}
                        className="w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm hover:bg-primary/20 transition"
                      >
                        Flush Cache
                      </button>
                      <button
                        onClick={() => handleAction('rebuild-clusters')}
                        className="w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm hover:bg-primary/20 transition"
                      >
                        Rebuild Clusters
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'feature-flags' && (
              <div className="rounded-lg border border-border/60 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Feature Flags</h2>
                <p className="text-white/60">Feature flag management coming soon...</p>
              </div>
            )}

            {activeSection === 'finance' && (
              <FinanceDashboard />
            )}
          </>
        )}
      </main>
    </div>
  );
};
