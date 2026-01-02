import { Sparkles } from 'lucide-react';

import { Badge } from '../ui/badge';

export type HQIResult = {
  node_id: string;
  title?: string;
  snippet?: string;
  timestamp?: string;
  score: number;
  tags?: string[];
  reasons: string[];
};

type Props = {
  result: HQIResult;
  selected?: boolean;
  onSelect?: (result: HQIResult) => void;
};

const prettyTimestamp = (timestamp?: string) => {
  if (!timestamp) return 'No timestamp';
  const date = new Date(timestamp);
  return date.toLocaleString();
};

export const HQIResultCard = ({ result, selected, onSelect }: Props) => {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(result)}
      className={`w-full rounded-2xl border border-border/60 bg-black/50 p-4 text-left transition hover:border-primary/60 hover:bg-black/60 ${
        selected ? 'border-primary/70 shadow-lg shadow-primary/20' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase text-white/50">HQI Score</p>
          <h4 className="text-xl font-semibold text-white">{result.title ?? result.node_id}</h4>
          <p className="text-xs text-white/50">{prettyTimestamp(result.timestamp)}</p>
        </div>
        <Badge className="bg-primary/20 text-primary">{result.score.toFixed(3)}</Badge>
      </div>

      {result.snippet && <p className="mt-3 text-sm text-white/70">{result.snippet}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {result.tags?.map((tag) => (
          <Badge key={tag} variant="outline" className="border-primary/50 text-primary">
            {tag}
          </Badge>
        ))}
        {result.reasons.map((reason, idx) => (
          <Badge key={`${reason}-${idx}`} className="bg-emerald-500/10 text-emerald-200">
            <Sparkles className="mr-1 h-3 w-3" />
            {reason}
          </Badge>
        ))}
      </div>
    </button>
  );
};
