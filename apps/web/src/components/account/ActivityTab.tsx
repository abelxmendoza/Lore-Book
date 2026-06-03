import { useEffect, useState } from 'react';
import {
  Activity, LogIn, LogOut, Key, User, Download, Shield,
  Monitor, Smartphone, Tablet, RefreshCw, MapPin, Clock,
} from 'lucide-react';
import { Button } from '../ui/button';
import type { ActivityLog } from '../../api/user';

interface ActivityTabProps {
  logs: ActivityLog[];
  loading: boolean;
  user: { created_at?: string } | null;
  onRefresh: () => Promise<void>;
  onLogEvent: (action: string) => Promise<void>;
}

function getActionIcon(action: string) {
  const a = action.toLowerCase();
  if (a.includes('login') || a.includes('sign in')) return LogIn;
  if (a.includes('logout') || a.includes('sign out')) return LogOut;
  if (a.includes('password')) return Key;
  if (a.includes('profile')) return User;
  if (a.includes('export') || a.includes('download')) return Download;
  if (a.includes('privacy') || a.includes('security') || a.includes('2fa')) return Shield;
  return Activity;
}

function getActionColor(action: string) {
  const a = action.toLowerCase();
  if (a.includes('login') || a.includes('sign in')) return 'from-green-500/20 to-emerald-500/20 text-green-400';
  if (a.includes('logout') || a.includes('sign out')) return 'from-orange-500/20 to-amber-500/20 text-orange-400';
  if (a.includes('password')) return 'from-red-500/20 to-rose-500/20 text-red-400';
  if (a.includes('profile')) return 'from-blue-500/20 to-cyan-500/20 text-blue-400';
  if (a.includes('export') || a.includes('download')) return 'from-purple-500/20 to-violet-500/20 text-purple-400';
  if (a.includes('privacy') || a.includes('security')) return 'from-yellow-500/20 to-amber-500/20 text-yellow-400';
  return 'from-purple-500/20 to-pink-500/20 text-primary';
}

function parseDevice(userAgent?: string) {
  if (!userAgent || userAgent === 'Unknown') return { label: 'Unknown device', Icon: Monitor };
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('android') && ua.includes('mobile')) {
    return { label: 'Mobile', Icon: Smartphone };
  }
  if (ua.includes('ipad') || ua.includes('tablet')) {
    return { label: 'Tablet', Icon: Tablet };
  }
  const browser =
    ua.includes('chrome') ? 'Chrome' :
    ua.includes('firefox') ? 'Firefox' :
    ua.includes('safari') ? 'Safari' :
    ua.includes('edge') ? 'Edge' : 'Browser';
  const os =
    ua.includes('mac') ? 'macOS' :
    ua.includes('windows') ? 'Windows' :
    ua.includes('linux') ? 'Linux' :
    ua.includes('iphone') ? 'iOS' :
    ua.includes('android') ? 'Android' : '';
  return { label: os ? `${browser} on ${os}` : browser, Icon: Monitor };
}

function formatTimeAgo(ts: string) {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${weeks}w ago`;
}

function formatFullDate(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function ActivityTab({ logs, loading, user, onRefresh, onLogEvent }: ActivityTabProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoggedVisit, setHasLoggedVisit] = useState(false);

  // Log a "session active" event once per mount so there's always at least one entry
  useEffect(() => {
    if (!hasLoggedVisit && !loading) {
      setHasLoggedVisit(true);
      onLogEvent('Account viewed').catch(() => {});
    }
  }, [loading, hasLoggedVisit, onLogEvent]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Account Activity</h2>
          <p className="text-white/60">Login history and key account events</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition disabled:opacity-30"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Current session card */}
      {user && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/8 p-4 flex items-center gap-4">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Current session</p>
            <p className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
              <Monitor className="h-3 w-3" />
              {parseDevice(navigator.userAgent).label}
              {user.created_at && (
                <>
                  <span className="mx-1 text-white/20">·</span>
                  <Clock className="h-3 w-3" />
                  Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </>
              )}
            </p>
          </div>
          <span className="text-xs text-green-400 font-medium shrink-0">Active now</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Activity className="h-5 w-5 animate-pulse text-primary mr-3" />
          <span className="text-white/60 text-sm">Loading activity…</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-white/8 bg-white/2">
          <Activity className="h-10 w-10 mx-auto mb-3 text-white/15" />
          <p className="text-white/50 text-sm">No activity recorded yet.</p>
          <p className="text-white/30 text-xs mt-1">Events will appear here after your next login.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log, i) => {
            const Icon = getActionIcon(log.action);
            const color = getActionColor(log.action);
            const { label: deviceLabel, Icon: DeviceIcon } = parseDevice(log.device || log.location);
            const isLatest = i === 0;

            return (
              <div
                key={log.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  isLatest
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border/40 bg-white/3 hover:bg-white/5'
                }`}
              >
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium text-sm">{log.action}</p>
                    {isLatest && (
                      <span className="text-xs text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20">
                        Latest
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-white/40">
                      <DeviceIcon className="h-3 w-3" />
                      {deviceLabel}
                    </span>
                    {log.location && log.location !== 'Unknown' && log.location !== deviceLabel && (
                      <span className="flex items-center gap-1 text-xs text-white/40">
                        <MapPin className="h-3 w-3" />
                        {log.location}
                      </span>
                    )}
                    {log.ip_address && (
                      <span className="text-xs text-white/25 font-mono">{log.ip_address}</span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm text-white/70 font-medium">{formatTimeAgo(log.timestamp)}</p>
                  <p className="text-xs text-white/30 mt-0.5">{formatFullDate(log.timestamp)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trigger manual events for testing */}
      {logs.length > 0 && (
        <p className="text-xs text-white/25 text-center">
          Showing {logs.length} event{logs.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
