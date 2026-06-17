/**
 * Demo / dev simulation for LoreBook knowledge readiness UI states.
 * Persisted in localStorage so presets survive refresh during mockup work.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { config } from '../config/env';
import { subscribeToMockDataState } from '../contexts/MockDataContext';
import { shouldUseMockData } from '../hooks/useShouldUseMockData';
import { useAuth } from '../lib/supabase';
import type {
  LoreReadinessCompiledMode,
  LoreReadinessKnowledgePreset,
} from '../mocks/loreReadiness';

const STORAGE_KEY = 'lore_readiness_simulation_v1';

type StoredSimulation = {
  enabled: boolean;
  preset: LoreReadinessKnowledgePreset;
  compiledMode: LoreReadinessCompiledMode;
};

type LoreReadinessSimulationContextValue = {
  isSimulating: boolean;
  simulationEnabled: boolean;
  preset: LoreReadinessKnowledgePreset;
  compiledMode: LoreReadinessCompiledMode;
  setSimulationEnabled: (enabled: boolean) => void;
  setPreset: (preset: LoreReadinessKnowledgePreset) => void;
  setCompiledMode: (mode: LoreReadinessCompiledMode) => void;
  showSimulator: boolean;
};

const DEFAULT_STORED: StoredSimulation = {
  enabled: true,
  preset: 'rich',
  compiledMode: 'two',
};

function readStored(): StoredSimulation {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORED;
    const parsed = JSON.parse(raw) as Partial<StoredSimulation>;
    return {
      enabled: parsed.enabled ?? DEFAULT_STORED.enabled,
      preset: parsed.preset ?? DEFAULT_STORED.preset,
      compiledMode: parsed.compiledMode ?? DEFAULT_STORED.compiledMode,
    };
  } catch {
    return DEFAULT_STORED;
  }
}

const LoreReadinessSimulationContext = createContext<LoreReadinessSimulationContextValue | undefined>(
  undefined
);

export function LoreReadinessSimulationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mockRevision, setMockRevision] = useState(0);
  const [stored, setStored] = useState<StoredSimulation>(() =>
    typeof window !== 'undefined' ? readStored() : DEFAULT_STORED
  );

  useEffect(() => {
    return subscribeToMockDataState(() => setMockRevision((n) => n + 1));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [stored]);

  const shouldUseMock = user ? false : shouldUseMockData();
  void mockRevision;

  const showSimulator = shouldUseMock || config.dev.allowMockData;
  const isSimulating = shouldUseMock || (showSimulator && stored.enabled);

  const setSimulationEnabled = useCallback((enabled: boolean) => {
    setStored((prev) => ({ ...prev, enabled }));
  }, []);

  const setPreset = useCallback((preset: LoreReadinessKnowledgePreset) => {
    setStored((prev) => ({ ...prev, enabled: true, preset }));
  }, []);

  const setCompiledMode = useCallback((compiledMode: LoreReadinessCompiledMode) => {
    setStored((prev) => ({ ...prev, enabled: true, compiledMode }));
  }, []);

  const value = useMemo(
    (): LoreReadinessSimulationContextValue => ({
      isSimulating,
      simulationEnabled: stored.enabled,
      preset: stored.preset,
      compiledMode: stored.compiledMode,
      setSimulationEnabled,
      setPreset,
      setCompiledMode,
      showSimulator,
    }),
    [isSimulating, stored, setSimulationEnabled, setPreset, setCompiledMode, showSimulator]
  );

  return (
    <LoreReadinessSimulationContext.Provider value={value}>
      {children}
    </LoreReadinessSimulationContext.Provider>
  );
}

export function useLoreReadinessSimulation(): LoreReadinessSimulationContextValue {
  const ctx = useContext(LoreReadinessSimulationContext);
  if (!ctx) {
    throw new Error('useLoreReadinessSimulation must be used within LoreReadinessSimulationProvider');
  }
  return ctx;
}

export function useLoreReadinessSimulationOptional(): LoreReadinessSimulationContextValue | null {
  return useContext(LoreReadinessSimulationContext) ?? null;
}
