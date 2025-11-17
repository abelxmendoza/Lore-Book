import type { TimelineLayer } from '../../api/timeline';
import { Button } from '../ui/button';

export const TimelineLayerToggles = ({
  layers,
  onToggle
}: {
  layers: Record<TimelineLayer, boolean>;
  onToggle: (layer: TimelineLayer) => void;
}) => (
  <div className="flex flex-wrap gap-2 text-xs">
    {(Object.keys(layers) as TimelineLayer[]).map((layer) => (
      <Button
        key={layer}
        size="sm"
        variant={layers[layer] ? 'default' : 'outline'}
        className="border-cyan/40 bg-opacity-70 text-xs uppercase"
        onClick={() => onToggle(layer)}
      >
        {layer}
      </Button>
    ))}
  </div>
);
