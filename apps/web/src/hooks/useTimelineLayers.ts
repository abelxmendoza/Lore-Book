import { useCallback, useMemo, useState } from 'react';

import type { TimelineLayer } from '../api/timeline';

const DEFAULT_LAYERS: Record<TimelineLayer, boolean> = {
  events: true,
  tasks: true,
  arcs: true,
  identity: true,
  drift: true,
  tags: true,
  voiceMemos: true
};

export const useTimelineLayers = () => {
  const [layers, setLayers] = useState<Record<TimelineLayer, boolean>>(DEFAULT_LAYERS);

  const toggleLayer = useCallback((layer: TimelineLayer) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const enableAll = useCallback(() => setLayers(DEFAULT_LAYERS), []);
  const disableAll = useCallback(() => setLayers(() => ({
    events: false,
    tasks: false,
    arcs: false,
    identity: false,
    drift: false,
    tags: false,
    voiceMemos: false
  })), []);

  const activeLayers = useMemo(() => Object.entries(layers).filter(([, enabled]) => enabled).map(([key]) => key as TimelineLayer), [layers]);

  return { layers, toggleLayer, enableAll, disableAll, activeLayers };
};
