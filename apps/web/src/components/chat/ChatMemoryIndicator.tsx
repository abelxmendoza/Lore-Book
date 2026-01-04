/**
 * Chat Memory Indicator
 * Shows which memories were used in the response with confidence scores
 * Better than ChatGPT - shows confidence, source, and allows editing
 */

import { useState } from 'react';
import { Database, Edit, Info, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { Claim } from '../../hooks/useOmegaMemory';

export interface MemoryIndicator {
  claim_id: string;
  entity_name: string;
  claim_text: string;
  confidence: number;
  source: 'USER' | 'AI' | 'EXTERNAL';
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
}

interface ChatMemoryIndicatorProps {
  memories: MemoryIndicator[];
  onEdit?: (claimId: string) => void;
  onDismiss?: () => void;
}

const ConfidenceDot = ({ confidence }: { confidence: number }) => {
  const color = confidence >= 0.7 ? 'bg-green-400' : confidence >= 0.4 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className={`w-2 h-2 rounded-full ${color}`} title={`${Math.round(confidence * 100)}% confidence`} />
  );
};

const SourceBadge = ({ source }: { source: string }) => {
  const colors = {
    USER: 'bg-green-500/20 text-green-400 border-green-500/50',
    AI: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    EXTERNAL: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  };

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${colors[source as keyof typeof colors] || colors.USER}`}>
      {source}
    </span>
  );
};

export const ChatMemoryIndicator = ({ memories, onEdit, onDismiss }: ChatMemoryIndicatorProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!memories || memories.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-primary/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-xs font-semibold text-primary/70">
            Memories Used ({memories.length})
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary/50 hover:text-primary/70 transition-colors"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-0.5 rounded hover:bg-white/10 transition-colors"
            title="Dismiss"
          >
            <X className="h-3 w-3 text-white/40" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-2">
          {memories.map((memory) => (
            <div
              key={memory.claim_id}
              className="bg-primary/5 border border-primary/20 rounded p-2 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <ConfidenceDot confidence={memory.confidence} />
                    <SourceBadge source={memory.source} />
                    <span className="text-xs text-white/60 truncate">
                      About: {memory.entity_name}
                    </span>
                  </div>
                  <p className="text-xs text-white/80 leading-relaxed">{memory.claim_text}</p>
                  {memory.sentiment && (
                    <span className="text-xs text-white/50 mt-1 inline-block">
                      Sentiment: {memory.sentiment}
                    </span>
                  )}
                </div>
                {onEdit && (
                  <button
                    onClick={() => onEdit(memory.claim_id)}
                    className="p-1 rounded hover:bg-primary/20 transition-colors flex-shrink-0"
                    title="Edit memory"
                  >
                    <Edit className="h-3 w-3 text-primary/70" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!expanded && (
        <div className="flex items-center gap-2 flex-wrap">
          {memories.slice(0, 3).map((memory) => (
            <Badge
              key={memory.claim_id}
              variant="outline"
              className="text-xs border-primary/30 text-primary/70 bg-primary/5"
            >
              <ConfidenceDot confidence={memory.confidence} />
              <span className="ml-1">{memory.entity_name}</span>
            </Badge>
          ))}
          {memories.length > 3 && (
            <span className="text-xs text-white/40">+{memories.length - 3} more</span>
          )}
        </div>
      )}
    </div>
  );
};

