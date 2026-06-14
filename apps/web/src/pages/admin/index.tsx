import { useState, useEffect, useMemo } from 'react';
import {
  Users, FileText, Sparkles, Zap, AlertTriangle, Search,
  RefreshCw, Crown, Clock, Gift, LogIn, Filter, Terminal,
} from 'lucide-react';
import { useAuth } from '../../lib/supabase';
import { fetchJson } from '../../lib/api';
import { AdminSidebar, AdminMenuButton, type AdminSection } from '../../components/admin/AdminSidebar';
import { AdminCard } from '../../components/admin/AdminCard';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { FinanceDashboard } from '../../components/admin/FinanceDashboard';
import { UserProviderBadge } from '../../components/admin/UserProviderBadge';
import { SubscriptionStatusBadge } from '../../components/admin/SubscriptionStatusBadge';
import { canAccessAdmin } from '../../middleware/roleGuard';
import { config } from '../../config/env';
import { getUserFriendlyMessage } from '../../lib/errorHandler';
import NotFound from '../../routes/NotFound';

type AdminView = AdminSection;

interface AdminMetrics {
  totalUsers: number;
  totalMemories: number;
  newUsersLast7Days: number;
  aiGenerationsToday: number;
  errorLogsLast24h: number;
}

interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt?: string;
  memoryCount: number;
  role?: string;
  providers: string[];
  hasLinkedAccounts: boolean;
  subscriptionStatus: string;
  subscriptionTier: string;
  aiRequestsThisMonth: number;
  entriesThisMonth: number;
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

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso?: string | null) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type AdminLoadIssue =
  | 'network'
  | 'auth'
  | 'forbidden'
  | 'timeout'
  | 'routing'
  | 'unknown';

function rejectionMessage(result: PromiseRejectedResult): string {
  return getUserFriendlyMessage(result.reason);
}

function classifyAdminFailure(messages: string[]): AdminLoadIssue {
  const text = messages.join(' ').toLowerCase();
  if (text.includes('sign in') || text.includes('authentication') || text.includes('401')) return 'auth';
  if (text.includes('forbidden') || text.includes('permission') || text.includes('403')) return 'forbidden';
  if (text.includes('timed out') || text.includes('timeout') || text.includes('abort')) return 'timeout';
  if (text.includes('html') || text.includes('routing error') || text.includes('vite_api_url')) return 'routing';
  if (
    text.includes('connect') ||
    text.includes('network') ||
    text.includes('failed to fetch') ||
    text.includes('unavailable')
  ) {
    return 'network';
  }
  return 'unknown';
}

const ADMIN_FETCH_OPTS = { timeoutMs: config.api.adminTimeout } as const;

function getSectionTitle(view: AdminView): string {
  switch (view) {
    case 'dashboard': return 'Dashboard';
    case 'users': return 'All Users';
    case 'subscribers': return 'Subscribers';
    case 'login-activity': return 'Login Activity';
    case 'logs': return 'System Logs';
    case 'ai-events': return 'AI Events';
    case 'engine-health': return 'Engine Health';
    case 'tools': return 'Admin Tools';
    case 'feature-flags': return 'Feature Flags';
    case 'finance': return 'Finance';
    default: return 'Admin Console';
  }
}

export const AdminPage = () => {
  const { user, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [aiEvents, setAiEvents] = useState<AIEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [subFilter, setSubFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loadIssue, setLoadIssue] = useState<AdminLoadIssue | null>(null);

  const isAdmin = canAccessAdmin(user || null);

  useEffect(() => {
    // Wait for auth to finish resolving before deciding to redirect
    if (authLoading) return;
    if (!isAdmin) {
      window.location.href = '/';
      return;
    }
    loadDashboardData();
  }, [authLoading, isAdmin]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadIssue(null);

      // Load critical endpoints first (sequential) — mobile networks struggle with
      // four heavy parallel cross-origin requests timing out together.
      const metricsResult = await Promise.resolve(
        fetchJson<AdminMetrics>('/api/admin/metrics', undefined, ADMIN_FETCH_OPTS)
      ).then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason })
      );

      const usersResult = await Promise.resolve(
        fetchJson<{ users: AdminUser[]; total: number }>('/api/admin/users', undefined, ADMIN_FETCH_OPTS)
      ).then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason })
      );

      const [logsResult, eventsResult] = await Promise.allSettled([
        fetchJson<{ logs: Log[] }>('/api/admin/logs', undefined, ADMIN_FETCH_OPTS),
        fetchJson<{ events: AIEvent[] }>('/api/admin/ai-events', undefined, ADMIN_FETCH_OPTS),
      ]);

      if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value);
      if (usersResult.status === 'fulfilled') setUsers(usersResult.value.users);
      if (logsResult.status === 'fulfilled') setLogs(logsResult.value.logs);
      if (eventsResult.status === 'fulfilled') setAiEvents(eventsResult.value.events);

      const criticalFailures: string[] = [];
      if (metricsResult.status === 'rejected') criticalFailures.push(rejectionMessage(metricsResult));
      if (usersResult.status === 'rejected') criticalFailures.push(rejectionMessage(usersResult));

      if (criticalFailures.length > 0) {
        const issue = classifyAdminFailure(criticalFailures);
        setLoadIssue(issue);
        setError(criticalFailures[0] || 'Failed to load admin data.');
      }
    } catch (err: any) {
      const message = getUserFriendlyMessage(err);
      setLoadIssue(classifyAdminFailure([message]));
      setError(message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleAction = async (action: string) => {
    try {
      setError(null);
      await fetchJson(`/api/admin/${action}`, { method: 'POST' }, ADMIN_FETCH_OPTS);
      await loadDashboardData();
    } catch (err: any) {
      setError(getUserFriendlyMessage(err) || `Failed to execute ${action}`);
    }
  };

  // Derived stats from real user data
  const userStats = useMemo(() => {
    const free = users.filter(u => !u.subscriptionStatus || u.subscriptionStatus === 'free').length;
    const trial = users.filter(u => u.subscriptionStatus === 'trial').length;
    const paid = users.filter(u => u.subscriptionStatus === 'active').length;
    const googleUsers = users.filter(u => u.providers.includes('google')).length;
    const emailUsers = users.filter(u => u.providers.includes('email')).length;
    const linkedUsers = users.filter(u => u.hasLinkedAccounts).length;
    const totalAiThisMonth = users.reduce((sum, u) => sum + (u.aiRequestsThisMonth || 0), 0);
    const totalEntriesThisMonth = users.reduce((sum, u) => sum + (u.entriesThisMonth || 0), 0);
    const activeThisMonth = users.filter(u => u.aiRequestsThisMonth > 0 || u.entriesThisMonth > 0).length;
    return { free, trial, paid, googleUsers, emailUsers, linkedUsers, totalAiThisMonth, totalEntriesThisMonth, activeThisMonth };
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = !userSearch || u.email?.toLowerCase().includes(userSearch.toLowerCase());
      const matchSub = subFilter === 'all' || u.subscriptionStatus === subFilter;
      const matchProvider = providerFilter === 'all' || u.providers.includes(providerFilter);
      return matchSearch && matchSub && matchProvider;
    });
  }, [users, userSearch, subFilter, providerFilter]);

  // Recent logins = users sorted by last sign-in, non-null
  const recentLogins = useMemo(() => {
    return [...users]
      .filter(u => u.lastSignInAt)
      .sort((a, b) => new Date(b.lastSignInAt!).getTime() - new Date(a.lastSignInAt!).getTime())
      .slice(0, 50);
  }, [users]);

  // Still waiting for Supabase session — show spinner, don't flash redirect
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080510]">
        <div className="text-center">
          <div className="mx-auto w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
          <p className="text-white/40 text-sm">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    if (config.env.isProduction) return <NotFound />;
    return null;
  }

  const isBackendDown =
    loadIssue === 'network' ||
    loadIssue === 'routing' ||
    loadIssue === 'timeout' ||
    (!loadIssue && (error?.includes('connectivity') || error?.includes('unavailable')));

  const backendDownTitle = config.env.isProduction
    ? 'Unable to reach the API server'
    : 'Backend server is not running';

  const backendDownBody = (() => {
    if (loadIssue === 'timeout') {
      return 'The admin API took too long to respond. This can happen on slow mobile connections — tap Refresh to retry.';
    }
    if (loadIssue === 'routing') {
      return 'API requests are hitting the frontend instead of the backend. Redeploy after verifying Vercel rewrites proxy /api/* to Railway.';
    }
    if (config.env.isProduction) {
      return 'The admin console could not load data from the production API. Check your connection and tap Refresh.';
    }
    return 'The admin console requires the LoreBook server to be running locally.';
  })();

  return (
    <div className="flex min-h-screen bg-[#080510]">
      <AdminSidebar
        activeSection={currentView}
        onSectionChange={(section) => {
          setCurrentView(section);
          setMobileSidebarOpen(false);
        }}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <main className="flex-1 p-4 sm:p-6 text-white overflow-auto min-w-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-6">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <AdminMenuButton onClick={() => setMobileSidebarOpen(true)} />
            <AdminHeader
              title={getSectionTitle(currentView)}
              subtitle={currentView === 'dashboard' ? 'Production Administration' : 'Admin Console'}
              badge="ADMIN"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto shrink-0">
            {/* Back to app — prominent, always visible */}
            <button
              type="button"
              onClick={() => window.location.href = '/'}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-white/20 bg-white/[0.07] hover:bg-white/12 text-white/70 hover:text-white text-sm transition"
            >
              ← App
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Backend offline banner */}
        {isBackendDown && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300 mb-1">{backendDownTitle}</p>
                <p className="text-xs text-white/50 mb-3">{backendDownBody}</p>
                {!config.env.isProduction && (
                  <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2 border border-white/10 font-mono text-xs text-emerald-300">
                    <Terminal className="h-3.5 w-3.5 text-white/30 shrink-0" />
                    cd apps/server &amp;&amp; npm run dev
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Permission / auth errors */}
        {loadIssue === 'forbidden' && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
            <p className="font-semibold mb-1">Admin access denied on the API</p>
            <p className="text-xs text-red-200/80">
              Your account can open this page but the server rejected admin requests. Set{' '}
              <code className="text-red-100">ADMIN_EMAIL</code> on Railway or add{' '}
              <code className="text-red-100">app_metadata.role = admin</code> in Supabase.
            </p>
          </div>
        )}

        {loadIssue === 'auth' && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
            <p className="font-semibold mb-1">Session expired</p>
            <p className="text-xs text-red-200/80">Sign in again, then return to the admin console.</p>
          </div>
        )}

        {/* Generic error (non-connectivity) */}
        {error && !isBackendDown && loadIssue !== 'forbidden' && loadIssue !== 'auth' && (
          <div className="mb-4 rounded-xl bg-red-500/15 border border-red-500/40 p-4 text-red-300 flex items-center gap-2 text-sm">
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
            {/* ── DASHBOARD ── */}
            {currentView === 'dashboard' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <AdminCard title="Total Users"      value={metrics?.totalUsers      ?? '—'} icon={Users} />
                  <AdminCard title="Total Memories"   value={metrics?.totalMemories   ?? '—'} icon={FileText} />
                  <AdminCard title="New Users (7d)"   value={metrics?.newUsersLast7Days ?? '—'} icon={Sparkles} />
                  <AdminCard title="AI (Today)"       value={metrics?.aiGenerationsToday ?? '—'} icon={Zap} />
                </div>

                {/* User breakdown from live data */}
                {users.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                      <p className="text-xs text-white/50 uppercase tracking-wide mb-1">Subscription Breakdown</p>
                      <div className="space-y-2 mt-3">
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2 text-white/70"><Gift className="h-4 w-4" /> Free tier</span>
                          <span className="font-semibold">{userStats.free}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2 text-yellow-300"><Clock className="h-4 w-4" /> Trial</span>
                          <span className="font-semibold">{userStats.trial}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2 text-green-300"><Crown className="h-4 w-4" /> Paid</span>
                          <span className="font-semibold">{userStats.paid}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                      <p className="text-xs text-white/50 uppercase tracking-wide mb-1">Auth Method</p>
                      <div className="space-y-2 mt-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/70">Email / Magic Link</span>
                          <span className="font-semibold">{userStats.emailUsers}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/70">Google OAuth</span>
                          <span className="font-semibold">{userStats.googleUsers}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/70">Linked (both)</span>
                          <span className="font-semibold">{userStats.linkedUsers}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                      <p className="text-xs text-white/50 uppercase tracking-wide mb-1">Usage This Month</p>
                      <div className="space-y-2 mt-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/70">AI requests</span>
                          <span className="font-semibold tabular-nums">{userStats.totalAiThisMonth.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/70">Entries created</span>
                          <span className="font-semibold tabular-nums">{userStats.totalEntriesThisMonth.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/70">Active users</span>
                          <span className="font-semibold tabular-nums">{userStats.activeThisMonth}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                      <p className="text-xs text-white/50 uppercase tracking-wide mb-1">Quick Actions</p>
                      <div className="space-y-2 mt-3">
                        <button type="button" onClick={() => handleAction('reindex')}
                          className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition">
                          Reindex Embeddings
                        </button>
                        <button type="button" onClick={() => handleAction('flush-cache')}
                          className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition">
                          Flush Cache
                        </button>
                        <button type="button" onClick={() => handleAction('rebuild-clusters')}
                          className="w-full rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm hover:bg-purple-500/20 transition">
                          Rebuild Clusters
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent logins preview */}
                {recentLogins.length > 0 && (
                  <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                        <LogIn className="h-4 w-4" /> Recent Logins
                      </h3>
                      <button type="button" onClick={() => setCurrentView('login-activity')}
                        className="text-xs text-purple-400 hover:text-purple-300 transition">
                        View all →
                      </button>
                    </div>
                    <div className="space-y-2">
                      {recentLogins.slice(0, 5).map(u => (
                        <div key={u.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserProviderBadge providers={u.providers} />
                            <span className="text-white/70 truncate">{u.email}</span>
                          </div>
                          <span className="text-white/40 text-xs shrink-0 ml-4">{timeAgo(u.lastSignInAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── USERS ── */}
            {currentView === 'users' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <h2 className="text-xl font-semibold flex-1">Users</h2>
                    <span className="text-sm text-white/50">{filteredUsers.length} / {users.length}</span>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    <div className="relative flex-1 min-w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                      <input
                        type="text"
                        placeholder="Search by email…"
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-white/40" />
                      <select
                        title="Filter by subscription tier"
                        value={subFilter}
                        onChange={e => setSubFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 text-sm text-white rounded-lg px-3 py-2 focus:outline-none"
                      >
                        <option value="all">All tiers</option>
                        <option value="free">Free</option>
                        <option value="trial">Trial</option>
                        <option value="active">Active (paid)</option>
                        <option value="canceled">Canceled</option>
                        <option value="past_due">Past due</option>
                      </select>
                      <select
                        title="Filter by auth provider"
                        value={providerFilter}
                        onChange={e => setProviderFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 text-sm text-white rounded-lg px-3 py-2 focus:outline-none"
                      >
                        <option value="all">All providers</option>
                        <option value="email">Email</option>
                        <option value="google">Google</option>
                      </select>
                    </div>
                  </div>

                  {filteredUsers.length === 0 ? (
                    <p className="text-white/40 text-sm py-8 text-center">No users match filters.</p>
                  ) : (
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Email</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Auth</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Subscription</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">AI (mo)</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Entries (mo)</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Memories</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Last Login</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map(u => (
                            <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="py-3 px-3 text-white/80 max-w-xs truncate">{u.email || '—'}</td>
                              <td className="py-3 px-3">
                                <UserProviderBadge providers={u.providers} hasLinkedAccounts={u.hasLinkedAccounts} />
                              </td>
                              <td className="py-3 px-3">
                                <SubscriptionStatusBadge status={u.subscriptionStatus} tier={u.subscriptionTier} />
                              </td>
                              <td className="py-3 px-3 text-white/60 tabular-nums">{u.aiRequestsThisMonth}</td>
                              <td className="py-3 px-3 text-white/60 tabular-nums">{u.entriesThisMonth}</td>
                              <td className="py-3 px-3 text-white/60 tabular-nums">{u.memoryCount}</td>
                              <td className="py-3 px-3 text-white/50 text-xs">{timeAgo(u.lastSignInAt)}</td>
                              <td className="py-3 px-3 text-white/50 text-xs">{formatDate(u.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SUBSCRIBERS ── */}
            {currentView === 'subscribers' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <AdminCard title="Free Tier" value={userStats.free} icon={Gift} description="Users on free plan" />
                  <AdminCard title="Trial" value={userStats.trial} icon={Clock} description="Active trial users" />
                  <AdminCard title="Paid" value={userStats.paid} icon={Crown} description="Active paid subscribers" />
                  <AdminCard title="AI Requests (mo)" value={userStats.totalAiThisMonth} icon={Zap} description="Across all users this month" />
                </div>

                {/* Stripe not configured notice */}
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-300 font-semibold text-sm">Stripe payments not yet configured</p>
                    <p className="text-amber-200/70 text-xs mt-1">
                      Subscription billing is not active. All users are currently on the free tier. When Stripe is set up, paid subscriptions will appear here with status tracking.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                  <h2 className="text-xl font-semibold mb-4">All Subscribers</h2>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Email</th>
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Auth Method</th>
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Plan</th>
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-3 px-3 text-white/80 max-w-xs truncate">{u.email || '—'}</td>
                            <td className="py-3 px-3">
                              <UserProviderBadge providers={u.providers} hasLinkedAccounts={u.hasLinkedAccounts} />
                            </td>
                            <td className="py-3 px-3">
                              <SubscriptionStatusBadge status={u.subscriptionStatus} tier={u.subscriptionTier} />
                            </td>
                            <td className="py-3 px-3 text-white/50 text-xs">{formatDate(u.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── LOGIN ACTIVITY ── */}
            {currentView === 'login-activity' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <LogIn className="h-5 w-5" /> Login Activity
                    </h2>
                    <span className="text-sm text-white/50">{recentLogins.length} sessions recorded</span>
                  </div>
                  <p className="text-white/40 text-xs mb-4">
                    Users who have signed in to your app, sorted by most recent. Shows auth method used.
                  </p>
                  {recentLogins.length === 0 ? (
                    <p className="text-white/40 text-sm py-8 text-center">No login activity recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto -mx-4 sm:mx-0">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Email</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Auth Method</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Plan</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">AI (mo)</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Entries (mo)</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Last Login</th>
                            <th className="text-left py-3 px-3 text-white/50 font-medium">Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentLogins.map(u => (
                            <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="py-3 px-3 text-white/80 max-w-xs truncate">{u.email || '—'}</td>
                              <td className="py-3 px-3">
                                <UserProviderBadge providers={u.providers} hasLinkedAccounts={u.hasLinkedAccounts} />
                              </td>
                              <td className="py-3 px-3">
                                <SubscriptionStatusBadge status={u.subscriptionStatus} />
                              </td>
                              <td className="py-3 px-3 text-white/60 tabular-nums">{u.aiRequestsThisMonth}</td>
                              <td className="py-3 px-3 text-white/60 tabular-nums">{u.entriesThisMonth}</td>
                              <td className="py-3 px-3">
                                <span className="text-white/70">{timeAgo(u.lastSignInAt)}</span>
                                <span className="text-white/30 text-xs ml-2">{formatDate(u.lastSignInAt)}</span>
                              </td>
                              <td className="py-3 px-3 text-white/50 text-xs">{formatDate(u.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── LOGS ── */}
            {currentView === 'logs' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">System Logs</h2>
                {logs.length === 0 ? (
                  <p className="text-white/40 text-sm">No logs available — logging service not yet connected.</p>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Timestamp</th>
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Level</th>
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                            <td className="py-2 px-3 text-white/50 text-xs">{formatDate(log.timestamp)}</td>
                            <td className="py-2 px-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                log.level === 'error' ? 'bg-red-500/20 text-red-300' :
                                log.level === 'warn' ? 'bg-yellow-500/20 text-yellow-300' :
                                'bg-white/10 text-white/60'
                              }`}>{log.level}</span>
                            </td>
                            <td className="py-2 px-3 text-white/80">{log.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── AI EVENTS ── */}
            {currentView === 'ai-events' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">AI Events</h2>
                {aiEvents.length === 0 ? (
                  <p className="text-white/40 text-sm">No AI events recorded — AI event tracking not yet connected.</p>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Timestamp</th>
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Type</th>
                          <th className="text-left py-3 px-3 text-white/50 font-medium">Tokens</th>
                          <th className="text-left py-3 px-3 text-white/50 font-medium">User</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiEvents.map((e, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                            <td className="py-2 px-3 text-white/50 text-xs">{formatDate(e.timestamp)}</td>
                            <td className="py-2 px-3 text-white/80">{e.type}</td>
                            <td className="py-2 px-3 text-white/60">{e.tokens?.toLocaleString()}</td>
                            <td className="py-2 px-3 text-white/50 text-xs truncate max-w-xs">{e.userId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── ENGINE HEALTH ── */}
            {currentView === 'engine-health' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Engine Health</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'API Server', status: 'online', detail: 'Responding normally' },
                    { label: 'Supabase DB', status: 'online', detail: 'Connected' },
                    { label: 'OpenAI', status: 'unknown', detail: 'Check API key / billing' },
                    { label: 'Stripe', status: 'pending', detail: 'Not yet configured' },
                  ].map(svc => (
                    <div key={svc.label} className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-black/40">
                      <div>
                        <p className="font-medium text-white">{svc.label}</p>
                        <p className="text-xs text-white/50 mt-1">{svc.detail}</p>
                      </div>
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        svc.status === 'online' ? 'bg-green-400' :
                        svc.status === 'pending' ? 'bg-yellow-400' :
                        'bg-white/30'
                      }`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TOOLS ── */}
            {currentView === 'tools' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-4">Admin Tools</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { action: 'reindex', label: 'Reindex Embeddings', desc: 'Re-process all journal entries for semantic search.' },
                    { action: 'flush-cache', label: 'Flush Cache', desc: 'Clear all in-memory caches. Useful after config changes.' },
                    { action: 'rebuild-clusters', label: 'Rebuild Clusters', desc: 'Rebuild memory clusters for improved retrieval.' },
                  ].map(tool => (
                    <div key={tool.action} className="p-4 rounded-lg border border-white/10 bg-black/40">
                      <h3 className="font-semibold text-white mb-1">{tool.label}</h3>
                      <p className="text-sm text-white/50 mb-3">{tool.desc}</p>
                      <button
                        type="button"
                        onClick={() => handleAction(tool.action)}
                        className="px-4 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-sm hover:bg-purple-500/20 transition"
                      >
                        Run
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── FEATURE FLAGS ── */}
            {currentView === 'feature-flags' && (
              <div className="rounded-lg border border-purple-500/30 bg-black/40 p-4">
                <h2 className="text-xl font-semibold mb-2">Feature Flags</h2>
                <p className="text-white/40 text-sm mb-6">Feature flag management coming soon.</p>
                <div className="space-y-3">
                  {[
                    { key: 'demo_mode', label: 'Demo Mode', desc: 'Enable demo/guest access', enabled: true },
                    { key: 'ai_cognition', label: 'AI Cognition', desc: 'LLM-powered memory extraction', enabled: true },
                    { key: 'stripe_billing', label: 'Stripe Billing', desc: 'Enable paid subscriptions', enabled: false },
                  ].map(flag => (
                    <div key={flag.key} className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-black/30">
                      <div>
                        <p className="font-medium text-white">{flag.label}</p>
                        <p className="text-xs text-white/40">{flag.desc}</p>
                      </div>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                        flag.enabled
                          ? 'bg-green-500/20 text-green-300 border-green-500/30'
                          : 'bg-white/10 text-white/40 border-white/20'
                      }`}>
                        {flag.enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── FINANCE ── */}
            {currentView === 'finance' && <FinanceDashboard />}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
