import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type OrchestratorDelta = {
  type: string;
  timestamp?: string;
  userId?: string;
  payload: Record<string, any>;
};

export type OrchestratorSnapshot = {
  summary: any;
  timeline: any;
  identity: any;
  continuity: any;
  saga: any;
  fabric?: any;
  tasks?: any;
};

const appendEvent = (timeline: any, event?: unknown) => {
  if (!event) return timeline;
  const events = Array.isArray(timeline?.events) ? timeline.events : [];
  return {
    ...(timeline ?? {}),
    events: [...events, event]
  };
};

export const useOrchestratorStream = () => {
  const [deltas, setDeltas] = useState<OrchestratorDelta[]>([]);
  const [lastDelta, setLastDelta] = useState<OrchestratorDelta | null>(null);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const lastDeltaRef = useRef<OrchestratorDelta | null>(null);

  const shouldAccept = useCallback((type: string) => {
    const filters = subscriptionsRef.current;
    return filters.size === 0 || filters.has(type);
  }, []);

  const applyDeltaToState = useCallback(
    (state: OrchestratorSnapshot, deltaOverride?: OrchestratorDelta): OrchestratorSnapshot => {
      const delta = deltaOverride ?? lastDeltaRef.current;
      if (!delta) return state;

      const { type, payload } = delta;
      const base = state ?? ({} as OrchestratorSnapshot);

      switch (type) {
        case 'timeline.add': {
          const event = payload.event ?? payload.entry ?? payload;
          return { ...base, timeline: appendEvent(base.timeline, event) };
        }
        case 'task.create':
        case 'task.complete': {
          const task = payload.task ?? payload;
          const event = payload.event ?? payload.timelineEvent;
          const updatedTimeline = appendEvent(base.timeline, event ?? task?.timelineEvent);

          const existingTasks = Array.isArray(base.summary?.tasks) ? base.summary?.tasks : null;
          const updatedTasks = existingTasks
            ? existingTasks.some((t: any) => t.id === task?.id)
              ? existingTasks.map((t: any) => (t.id === task.id ? { ...t, ...task } : t))
              : [...existingTasks, task]
            : task
              ? [task]
              : existingTasks;

          return {
            ...base,
            summary: base.summary ? { ...base.summary, ...(updatedTasks ? { tasks: updatedTasks } : {}), lastTask: task } : base.summary,
            timeline: updatedTimeline
          };
        }
        case 'identity.update': {
          return { ...base, identity: payload.snapshot ?? payload.identity ?? payload };
        }
        case 'continuity.recompute': {
          return { ...base, continuity: payload.state ?? payload.report ?? payload };
        }
        case 'fabric.link_add': {
          const edge = payload.edge ?? payload;
          const edges = Array.isArray(base.fabric?.edges) ? base.fabric.edges : [];
          return { ...base, fabric: { ...(base.fabric ?? {}), edges: [...edges, edge], lastLink: edge } };
        }
        case 'saga.update': {
          return { ...base, saga: payload.saga ?? payload };
        }
        default:
          return base;
      }
    },
    []
  );

  useEffect(() => {
    lastDeltaRef.current = lastDelta;
  }, [lastDelta]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;

    const channel = supabase.channel('orchestrator:deltas', { config: { broadcast: { self: true } } });
    channel
      .on('broadcast', { event: 'delta' }, ({ payload }) => {
        const delta = payload as OrchestratorDelta;
        if (!delta?.type || !shouldAccept(delta.type)) return;
        setDeltas((prev) => [...prev, delta]);
        setLastDelta(delta);
      })
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [shouldAccept]);

  const subscribeTo = useCallback((type: string) => {
    subscriptionsRef.current.add(type);
    return () => subscriptionsRef.current.delete(type);
  }, []);

  return useMemo(
    () => ({
      deltas,
      lastDelta,
      applyDeltaToState,
      subscribeTo
    }),
    [applyDeltaToState, deltas, lastDelta, subscribeTo]
  );
};
