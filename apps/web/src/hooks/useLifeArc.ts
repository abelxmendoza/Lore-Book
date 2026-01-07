// =====================================================
// USE LIFE ARC HOOK
// Purpose: Fetch and manage life arc data
// =====================================================

import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api';

export type Timeframe = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS';

interface Event {
  id: string;
  title: string;
  summary: string | null;
  start_time: string;
  end_time: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  activities: string[];
  type: string | null;
}

interface EventGroup {
  significant_events: Event[];
  recurring_patterns: Array<{
    label: string;
    event_ids: string[];
    frequency: number;
  }>;
  new_entities: Array<{
    type: 'PERSON' | 'LOCATION';
    id: string;
    name: string;
    first_seen: string;
  }>;
  unresolved_events: Event[];
}

interface ChangeSignals {
  first_time_people: Array<{ id: string; name: string; first_seen: string }>;
  first_time_locations: Array<{ id: string; name: string; first_seen: string }>;
  pattern_shifts: Array<{ description: string; evidence_event_ids: string[] }>;
  emotional_shifts: Array<{ description: string; evidence_event_ids: string[] }>;
}

interface NarrativeSummary {
  text: string;
  event_ids: string[];
  confidence: number;
}

export interface LifeArcData {
  timeframe: Timeframe;
  event_groups: EventGroup;
  narrative_summary: NarrativeSummary;
  change_signals: ChangeSignals;
  stability_state?: 'STABLE_EMPTY' | 'STABLE_CONTINUATION' | 'UNSTABLE_UNCLEAR' | 'SIGNAL_PRESENT';
  is_silence?: boolean;
  events_with_continuity?: Array<Event & { continuity_notes?: string[] }>;
}

export function useLifeArc(timeframe: Timeframe = 'LAST_30_DAYS') {
  const [data, setData] = useState<LifeArcData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLifeArc();
  }, [timeframe]);

  const loadLifeArc = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ success: boolean } & LifeArcData>(
        `/api/life-arc/recent?timeframe=${timeframe}`
      );
      if (result.success) {
        setData({
          timeframe: result.timeframe,
          event_groups: result.event_groups,
          narrative_summary: result.narrative_summary,
          change_signals: result.change_signals,
        });
      } else {
        setError('Failed to load life arc');
      }
    } catch (err: any) {
      console.error('Failed to load life arc:', err);
      setError(err.message || 'Failed to load life arc');
    } finally {
      setLoading(false);
    }
  };

  return {
    data,
    loading,
    error,
    refresh: loadLifeArc,
  };
}

