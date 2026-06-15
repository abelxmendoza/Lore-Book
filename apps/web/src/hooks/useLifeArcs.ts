import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import { useMockData } from '../contexts/MockDataContext';
import { useAuth } from '../lib/supabase';
import { useGuest } from '../contexts/GuestContext';
import { generateMockLifeArcs } from '../mocks/timelineMockData';

export type ArcTrack = 'career' | 'relationships' | 'creative' | 'health' | 'inner' | 'mixed' | 'custom';
export type ArcType  = 'life_era' | 'skill' | 'location' | 'work' | 'custom' | 'occasion';

export interface LifeArc {
  id: string;
  title: string;
  arc_type: ArcType;
  track: ArcTrack | null;
  dominant_emotion: string | null;
  emotional_arc: string | null;
  parent_id: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  summary: string | null;
  confidence: number;
  source: 'inferred' | 'user_created';
  tags: string[];
  children?: LifeArc[];
}

// Color per track for use throughout the UI
export const TRACK_COLORS: Record<ArcTrack, { bg: string; border: string; text: string; dotBg: string }> = {
  career:        { bg: 'bg-blue-500/15',    border: 'border-blue-500/40',    text: 'text-blue-300',    dotBg: 'bg-blue-400' },
  relationships: { bg: 'bg-rose-500/15',    border: 'border-rose-500/40',    text: 'text-rose-300',    dotBg: 'bg-rose-400' },
  creative:      { bg: 'bg-violet-500/15',  border: 'border-violet-500/40',  text: 'text-violet-300',  dotBg: 'bg-violet-400' },
  health:        { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-300', dotBg: 'bg-emerald-400' },
  inner:         { bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   text: 'text-amber-300',   dotBg: 'bg-amber-400' },
  mixed:         { bg: 'bg-white/8',        border: 'border-white/20',       text: 'text-white/60',    dotBg: 'bg-gray-400' },
  custom:        { bg: 'bg-white/8',        border: 'border-white/20',       text: 'text-white/60',    dotBg: 'bg-gray-400' },
};

export const TRACK_LABELS: Record<ArcTrack, string> = {
  career: 'Career',
  relationships: 'Relationships',
  creative: 'Creative',
  health: 'Health',
  inner: 'Inner Life',
  mixed: 'Mixed',
  custom: 'Custom',
};

// Lazily-generated mock arcs — generated once and cached for the session
let _mockArcsCache: LifeArc[] | null = null;
function getMockArcs(): LifeArc[] {
  if (!_mockArcsCache) _mockArcsCache = generateMockLifeArcs();
  return _mockArcsCache;
}

interface UseLifeArcsOptions {
  activeOnly?: boolean;
  minConfidence?: number;
  includeChildren?: boolean;
}

interface UseLifeArcsResult {
  arcs: LifeArc[];
  activeArcs: LifeArc[];
  arcsByTrack: Partial<Record<ArcTrack, LifeArc[]>>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLifeArcs(opts: UseLifeArcsOptions = {}): UseLifeArcsResult {
  const { user, loading: authLoading } = useAuth();
  const { isGuest }                = useGuest();
  const { useMockData: mockEnabled } = useMockData();

  // Demo mode: logged-out guest with mock data enabled (Demo Mode button was pressed)
  const isDemoMode = !user && (isGuest ? mockEnabled : mockEnabled);

  const [arcs, setArcs] = useState<LifeArc[]>(() => isDemoMode ? getMockArcs() : []);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading) return;

    // Wait for auth before hitting protected API routes
    if (!user && !isDemoMode) {
      setArcs([]);
      setLoading(false);
      return;
    }

    // Demo / mock mode: return canned data immediately, no API call
    if (isDemoMode) {
      let data = getMockArcs();
      if (opts.activeOnly) data = data.filter(a => a.is_active);
      if (opts.minConfidence !== undefined) data = data.filter(a => a.confidence >= opts.minConfidence!);
      setArcs(data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (opts.activeOnly) params.set('active_only', 'true');
      if (opts.minConfidence !== undefined) params.set('min_confidence', String(opts.minConfidence));
      if (opts.includeChildren) params.set('include_children', 'true');

      const qs = params.toString();
      const res = await fetchJson<{ arcs: LifeArc[] }>(`/api/life-arcs${qs ? `?${qs}` : ''}`);
      setArcs(res.arcs ?? []);
    } catch (err) {
      // If API fails in non-demo mode, surface the error but keep arcs empty
      setError(err instanceof Error ? err.message : 'Failed to load life arcs');
      setArcs([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, isDemoMode, opts.activeOnly, opts.minConfidence, opts.includeChildren]);

  useEffect(() => { void load(); }, [load]);

  const minConf = opts.minConfidence ?? 0;
  const activeArcs = arcs.filter(a => a.is_active && a.confidence >= Math.max(minConf, 0.5));

  // Group by track for parallel-tracks rendering
  const arcsByTrack = arcs.reduce<Partial<Record<ArcTrack, LifeArc[]>>>((acc, arc) => {
    const t = arc.track ?? 'inner';
    if (!acc[t]) acc[t] = [];
    acc[t]!.push(arc);
    return acc;
  }, {});

  return { arcs, activeArcs, arcsByTrack, loading, error, refresh: load };
}
