/**
 * Quiet "pick up where you left off" surface near the chat composer.
 * Hidden when no candidate; never modal; never blocks typing.
 */

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { getApiBaseUrl } from '../../../config/env';
import { useAuth, supabase } from '../../../lib/supabase';

export type ReturnPointPayload = {
  id: string;
  title: string;
  surfaceLine: string;
  state: string;
  continuityMode: string;
  involvedEntities: string[];
  confidence: number;
  recommendedSurface: string;
};

export type ContinueContext = {
  returnPointId: string;
  sourceEvidence: string;
  unresolvedState: string;
  recommendedContinuityMode: string;
  surfaceLine?: string;
  involvedEntities?: string[];
  evidenceIds?: string[];
};

type Props = {
  threadId?: string | null;
  onContinue?: (ctx: ContinueContext, surfaceLine: string) => void;
  className?: string;
};

async function apiFetch(path: string, init?: RequestInit) {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export function ReturnPointBanner({ threadId, onContinue, className }: Props) {
  const { user } = useAuth();
  const [point, setPoint] = useState<ReturnPointPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setPoint(null);
      return;
    }
    try {
      const q = new URLSearchParams({ context: 'chat' });
      if (threadId) q.set('threadId', threadId);
      const res = await apiFetch(`/api/chat/return-point?${q}`);
      if (!res.ok) {
        setPoint(null);
        return;
      }
      const body = await res.json();
      setPoint(body.returnPoint ?? null);
      setHidden(false);
    } catch {
      setPoint(null);
    }
  }, [user, threadId]);

  useEffect(() => {
    let cancelled = false;
    // Async; do not block chat paint
    const t = window.setTimeout(() => {
      if (!cancelled) void load();
    }, 50);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [load]);

  const act = async (action: 'continue' | 'dismiss' | 'resolve' | 'correct') => {
    if (!point || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/chat/return-point/${point.id}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          threadId: threadId ?? undefined,
          context: 'chat',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (action === 'continue' && body.continueContext) {
        onContinue?.(body.continueContext as ContinueContext, point.surfaceLine);
      }
      if (action === 'dismiss' || action === 'resolve' || action === 'correct') {
        setHidden(true);
        setPoint(null);
      } else if (action === 'continue') {
        setHidden(true);
        setPoint(null);
      } else {
        await load();
      }
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  };

  if (hidden || !point || point.recommendedSurface === 'do_not_surface') {
    return null;
  }

  return (
    <div
      className={cn(
        'mb-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground',
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      role="status"
      aria-label="Continue where you left off"
    >
      <div className="min-w-0 flex-1 pr-2">
        <div className="text-xs font-medium text-foreground/80">Continue where you left off</div>
        <div className="truncate text-foreground/90">{point.surfaceLine}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void act('continue')}
          className="rounded-md bg-primary/90 px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary"
        >
          Continue
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act('resolve')}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          Mark resolved
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act('correct')}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          Correct
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="Dismiss"
          onClick={() => void act('dismiss')}
          className="rounded-md p-1 hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
