import { useEffect } from 'react';

import { SmartContextTray } from '../components/harmonized/SmartContextTray';
import { SmartRecommendations } from '../components/harmonized/SmartRecommendations';
import { SmartTimelineCluster } from '../components/harmonized/SmartTimelineCluster';
import { useHarmonization } from '../hooks/useHarmonization';
import { mergeSummary } from './harmonization.utils';
import { initialState } from './harmonization.reducer';

const fetchSummary = async () => {
  const response = await fetch('/api/harmonization/summary');
  if (!response.ok) {
    throw new Error('Unable to load harmonization summary');
  }
  return response.json();
};

export function HarmonizationManager() {
  const { state, dispatch } = useHarmonization();

  useEffect(() => {
    let mounted = true;
    fetchSummary()
      .then((payload) => {
        if (!mounted) return;
        dispatch({ type: 'SET_SUMMARY', payload: mergeSummary(initialState, payload) });
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      mounted = false;
    };
  }, [dispatch]);

  return (
    <div className="space-y-6">
      <SmartContextTray hints={state.identityHints} flags={state.continuityFlags} mode={state.mode} />
      <SmartRecommendations surfaces={state.recommendedSurfaces} />
      {state.clusters.map((cluster) => (
        <SmartTimelineCluster key={cluster.label} cluster={cluster} />
      ))}
    </div>
  );
}
