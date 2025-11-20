import { useEffect, useState } from "react";
import api from "../api";
import { useOrchestratorStream, type OrchestratorSnapshot } from "./useOrchestratorStream";

const createInitialState = (): OrchestratorSnapshot => ({
  summary: null,
  timeline: null,
  identity: null,
  continuity: null,
  saga: null,
  fabric: null,
  tasks: null,
});

export function useLoreOrchestrator() {
  const [orchestratorState, setOrchestratorState] = useState<OrchestratorSnapshot>(createInitialState);
  const { lastDelta, applyDeltaToState } = useOrchestratorStream();

  useEffect(() => {
    Promise.all([
      api.orchestrator.summary(),
      api.orchestrator.timeline(),
      api.orchestrator.identity(),
      api.orchestrator.continuity(),
      api.orchestrator.saga(),
    ]).then(([summary, timeline, identity, continuity, saga]) => {
      setOrchestratorState((prev) => ({ ...prev, summary, timeline, identity, continuity, saga }));
    });
  }, []);

  useEffect(() => {
    if (!lastDelta) return;
    setOrchestratorState((prev) => applyDeltaToState(prev, lastDelta));
  }, [lastDelta, applyDeltaToState]);

  return {
      summary: orchestratorState.summary,
      timeline: orchestratorState.timeline,
      identity: orchestratorState.identity,
      continuity: orchestratorState.continuity,
      saga: orchestratorState.saga,
      orchestratorState,
      lastDelta,
  };
}
