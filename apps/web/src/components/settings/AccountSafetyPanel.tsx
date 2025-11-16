import { useEffect, useState } from 'react';
import { ShieldCheck, MonitorSmartphone, Clock3, LogOut } from 'lucide-react';

import { fetchJson } from '../../lib/api';
import { Button } from '../ui/button';

interface SessionSummary {
  lastLogin?: string | null;
  sessions: { device: string; lastActive: string }[];
  audit?: { path: string; status: number; timestamp: string }[];
}

export const AccountSafetyPanel = () => {
  const [sessionInfo, setSessionInfo] = useState<SessionSummary>({ sessions: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const audit = await fetchJson<{ audit?: SessionSummary }>(`/api/account/export?summary=true`);
        const devices = navigator.userAgent;
        const now = new Date().toISOString();
        setSessionInfo({
          lastLogin: audit?.audit?.lastLogin ?? null,
          sessions: audit?.audit?.sessions ?? [{ device: devices, lastActive: now }],
          audit: audit?.audit?.audit ?? []
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load account safety data');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const logoutOthers = async () => {
    try {
      await fetchJson('/api/account/delete', { method: 'POST', body: JSON.stringify({ scope: 'sessions' }) });
      setSessionInfo((prev) => ({ ...prev, sessions: prev.sessions.slice(0, 1) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke other sessions');
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-black/50 p-4 shadow-panel">
      <div className="mb-3 flex items-center gap-2 text-white">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Account Safety</h3>
          <p className="text-sm text-white/60">Monitor sessions and recent access without extra friction.</p>
        </div>
      </div>
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      <div className="space-y-3 text-sm text-white/70">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          <div>
            <p className="font-medium">Last login</p>
            <p className="text-white/60">{sessionInfo.lastLogin || 'No recent login recorded'}</p>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-primary" />
            <p className="font-medium">Active sessions</p>
          </div>
          <ul className="space-y-2">
            {sessionInfo.sessions.map((session, index) => (
              <li key={`${session.device}-${index}`} className="rounded-lg bg-white/5 p-2 text-white/70">
                <div className="font-semibold">{session.device}</div>
                <div className="text-xs text-white/50">Last active: {session.lastActive}</div>
              </li>
            ))}
          </ul>
        </div>
        {sessionInfo.audit && sessionInfo.audit.length > 0 && (
          <div>
            <p className="mb-2 font-medium">Recent access</p>
            <ul className="space-y-1 text-xs text-white/60">
              {sessionInfo.audit.map((entry, index) => (
                <li key={`${entry.path}-${index}`}>
                  {entry.timestamp} · {entry.path} ({entry.status})
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => void logoutOthers()}>
            <LogOut className="mr-2 h-4 w-4" /> Logout other devices
          </Button>
        </div>
      </div>
    </div>
  );
};
