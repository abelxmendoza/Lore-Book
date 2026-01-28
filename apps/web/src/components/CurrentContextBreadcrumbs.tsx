/**
 * Minimal breadcrumbs derived from current context.
 * Shows "Threads / Name" or "Era" / "Saga" etc. when user is in a thread or timeline node.
 * Does not expose "context" as a user concept.
 */

import { useState, useEffect } from 'react';
import { useCurrentContext } from '../contexts/CurrentContextContext';
import { fetchJson } from '../lib/api';

export function CurrentContextBreadcrumbs() {
  const { currentContext } = useCurrentContext();
  const [threadName, setThreadName] = useState<string | null>(null);

  useEffect(() => {
    if (currentContext.kind !== 'thread' || !currentContext.threadId) {
      setThreadName(null);
      return;
    }
    let cancelled = false;
    fetchJson<{ name: string }>(`/api/threads/${currentContext.threadId}`)
      .then((t) => {
        if (!cancelled && t?.name) setThreadName(t.name);
      })
      .catch(() => setThreadName(null));
    return () => { cancelled = true; };
  }, [currentContext.kind, currentContext.threadId]);

  if (currentContext.kind === 'none') return null;
  if (currentContext.kind === 'thread' && currentContext.threadId) {
    const name = threadName ?? currentContext.threadId.slice(0, 8);
    return (
      <span className="text-[10px] sm:text-xs text-white/50 truncate max-w-[140px] sm:max-w-[200px]" title={threadName ?? undefined}>
        Threads / {name}
      </span>
    );
  }
  if (currentContext.kind === 'timeline' && currentContext.timelineLayer) {
    const layerLabel = currentContext.timelineLayer.charAt(0).toUpperCase() + currentContext.timelineLayer.slice(1);
    return (
      <span className="text-[10px] sm:text-xs text-white/50 truncate max-w-[140px] sm:max-w-[200px]">
        {layerLabel}
      </span>
    );
  }
  return null;
}
