/**
 * Recall Message Component
 * 
 * Displays memory recall results with confidence badges,
 * expandable sources, and Archivist persona indicators.
 */

import { useState } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ChevronDown, ChevronUp, Archive, Info } from 'lucide-react';
import type { RecallChatPayload } from './recallTypes';
import { RecallHeader } from './RecallHeader';
import { RecallSources } from './RecallSources';
import { RecallFooter } from './RecallFooter';

type RecallMessageProps = {
  message: {
    content: string;
    recall?: RecallChatPayload;
    response_mode?: string;
    recall_sources?: Array<{
      entry_id: string;
      timestamp: string;
      summary?: string;
      emotions?: string[];
      themes?: string[];
      entities?: string[];
    }>;
    confidence_label?: string;
    recall_meta?: {
      persona?: string;
      recall_type?: string;
    };
    disclaimer?: string;
  };
};

export const RecallMessage = ({ message }: RecallMessageProps) => {
  // Support both direct fields and metadata fields
  const recall = message.recall || {
    mode: (message.response_mode || message.metadata?.response_mode as 'RECALL' | 'SILENCE') || 'RECALL',
    confidence_label: (message.confidence_label || message.metadata?.confidence_label) as 'Strong match' | 'Tentative' | undefined,
    recall_sources: message.recall_sources || message.metadata?.recall_sources,
    recall_meta: message.recall_meta || message.metadata?.recall_meta,
    explanation: message.disclaimer || message.metadata?.disclaimer,
  };

  return (
    <div className="recall-message my-4">
      <Card className="bg-black/40 border-primary/20">
        <CardContent className="p-4 space-y-3">
          {/* Header with confidence and persona badges */}
          <RecallHeader
            confidence={recall.confidence_label}
            persona={recall.recall_meta?.persona as 'ARCHIVIST' | 'DEFAULT' | undefined}
          />

          {/* Main content */}
          <div className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>

          {/* Explanation */}
          {recall.explanation && (
            <div className="text-xs text-white/60 italic">
              {recall.explanation}
            </div>
          )}

          {/* Expandable sources */}
          {recall.recall_sources && recall.recall_sources.length > 0 && (
            <RecallSources sources={recall.recall_sources} />
          )}

          {/* Footer with meta info */}
          {recall.recall_meta && (
            <RecallFooter meta={recall.recall_meta} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

