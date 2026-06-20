import { useCallback, useEffect, useState } from 'react';
import {
  stitchedTimelineApi,
  type StitchedTimelineItem,
  type StitchedTimelineResult,
} from '../api/stitchedTimeline';
import { useAuth } from '../lib/supabase';
import { useMockData } from '../contexts/MockDataContext';
import { buildMockStitchedTimeline } from '../mocks/stitchedTimelineMock';

type UseStitchedTimelineOptions = {
  life_arc_id?: string;
  scope_type?: 'global' | 'life_arc';
  scope_label?: string | null;
  enabled?: boolean;
};

export function useStitchedTimeline(opts: UseStitchedTimelineOptions = {}) {
  const { user } = useAuth();
  const { useMockData: mockEnabled } = useMockData();
  const isDemoMode = !user && mockEnabled;

  const [data, setData] = useState<StitchedTimelineResult | null>(null);
  const [items, setItems] = useState<StitchedTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (opts.enabled === false) return;
    setLoading(true);
    setError(null);
    try {
      if (isDemoMode) {
        const mock = buildMockStitchedTimeline({
          scopeLabel: opts.scope_label ?? (opts.life_arc_id ? 'Life arc timeline' : 'Your full timeline'),
          lifeArcId: opts.life_arc_id,
        });
        setData(mock);
        setItems(mock.items);
        return;
      }

      const result = await stitchedTimelineApi.get({
        life_arc_id: opts.life_arc_id,
        scope_type: opts.scope_type ?? (opts.life_arc_id ? 'life_arc' : 'global'),
      });
      setData(result);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [opts.enabled, opts.life_arc_id, opts.scope_type, opts.scope_label, isDemoMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const reorderItems = useCallback((next: StitchedTimelineItem[]) => {
    setItems(next);
  }, []);

  const persistOrder = useCallback(async (nextItems: StitchedTimelineItem[]) => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      await stitchedTimelineApi.saveOrder({
        scope_type: data.scope_type,
        scope_id: data.scope_type === 'life_arc' ? data.scope_id : undefined,
        items: nextItems.map((item, sort_index) => ({
          kind: item.kind,
          id: item.sourceId,
          sort_index,
        })),
      });
      setItems(nextItems.map((item, i) => ({ ...item, userSortIndex: i })));
      setData((prev) => (prev ? { ...prev, has_user_order: true, items: nextItems } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save order');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [data]);

  return {
    data,
    items,
    loading,
    saving,
    error,
    reload: load,
    reorderItems,
    persistOrder,
  };
}
