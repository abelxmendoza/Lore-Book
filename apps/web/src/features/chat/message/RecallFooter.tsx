/**
 * Recall Footer Component
 * 
 * Displays meta information and explanation tooltip
 */

import { Info } from 'lucide-react';
import type { RecallMeta } from './recallTypes';

type RecallFooterProps = {
  meta: RecallMeta;
};

export const RecallFooter = ({ meta }: RecallFooterProps) => {
  const explanation = meta.recall_type
    ? `This response was generated using memory recall based on ${getRecallTypeDescription(meta.recall_type)}.`
    : 'This response was generated using memory recall based on similarity to past moments.';

  return (
    <div className="recall-footer mt-2 pt-2 border-t border-border/10">
      <div className="flex items-center gap-1.5 text-xs text-white/40">
        <Info className="h-3 w-3" />
        <span className="italic">{explanation}</span>
      </div>
    </div>
  );
};

function getRecallTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    EMOTIONAL_SIMILARITY: 'emotional similarity',
    TEMPORAL_COMPARISON: 'temporal patterns',
    PATTERN_LOOKBACK: 'recurring patterns',
    GENERAL_RECALL: 'general similarity',
  };
  return descriptions[type] || 'similarity';
}

