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
    saga,
  };
}
