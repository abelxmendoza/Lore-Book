import { useCallback, useEffect, useState } from 'react';

import { fetchJson } from '../lib/api';

export type TimelineContext = { events: any[]; arcs: any[]; season: Record<string, unknown> };
export type IdentityContext = { identity: Record<string, unknown>; persona: Record<string, unknown> };
export type ContinuityContext = { canonical: any[]; conflicts: any[] };
export type CharacterContext = { character: Record<string, unknown>; relationships: any[] };
export type AutopilotContext = {
  daily: Record<string, unknown>;
  weekly: Record<string, unknown>;
  momentum: Record<string, unknown>;
};

export type OrchestratorSummary = {
  timeline: TimelineContext;
  identity: IdentityContext;
  continuity: ContinuityContext;
  characters: CharacterContext[];
  tasks: any[];
  arcs: any[];
  season: Record<string, unknown>;
  autopilot: AutopilotContext;
  saga: Record<string, unknown>;
};

export const useLoreOrchestrator = () => {
  const [summary, setSummary] = useState<OrchestratorSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineContext | null>(null);
  const [identity, setIdentity] = useState<IdentityContext | null>(null);
  const [continuity, setContinuity] = useState<ContinuityContext | null>(null);
  const [characters, setCharacters] = useState<CharacterContext[]>([]);
  const [fabricNeighbors, setFabricNeighbors] = useState<any[]>([]);
  const [hqiResults, setHqiResults] = useState<any[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<OrchestratorSummary>('/api/orchestrator/summary');
      setSummary(payload);
      setTimeline(payload.timeline);
      setIdentity(payload.identity);
      setContinuity(payload.continuity);
      setCharacters(payload.characters);
      setAutopilot(payload.autopilot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orchestrator data');
    } finally {
      setLoading(false);
    }
  }, []);

  const searchHQI = useCallback(async (query: string) => {
    const result = await fetchJson<{ results: any[] }>(`/api/orchestrator/hqi?query=${encodeURIComponent(query)}`);
    setHqiResults(result.results);
  }, []);

  const loadFabricNeighbors = useCallback(async (memoryId: string) => {
    const result = await fetchJson<{ memoryId: string; neighbors: any[] }>(`/api/orchestrator/fabric/${memoryId}`);
    setFabricNeighbors(result.neighbors);
  }, []);

  const loadCharacter = useCallback(
    async (id: string) => {
      const result = await fetchJson<CharacterContext>(`/api/orchestrator/characters/${id}`);
      setCharacters((prev) => {
        const others = prev.filter((c) => c.character.id !== id);
        return [...others, result];
      });
      return result;
    },
    []
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
import { useEffect, useState } from "react";
import api from "../api";

export function useLoreOrchestrator() {
  const [summary, setSummary] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [continuity, setContinuity] = useState(null);
  const [saga, setSaga] = useState(null);

  useEffect(() => {
    api.orchestrator.summary().then(setSummary);
    api.orchestrator.timeline().then(setTimeline);
    api.orchestrator.identity().then(setIdentity);
    api.orchestrator.continuity().then(setContinuity);
    api.orchestrator.saga().then(setSaga);
  }, []);

  return {
    summary,
    timeline,
    identity,
    continuity,
    characters,
    fabricNeighbors,
    hqiResults,
    autopilot,
    loading,
    error,
    refresh,
    searchHQI,
    loadFabricNeighbors,
    loadCharacter,
  };
};
    saga,
  };
}
