/**
 * Chat Memory Suggestion
 * Proactive memory capture during chat - better than ChatGPT
 * Suggests memories to save based on conversation
 */

import { useState } from 'react';
import { Database, Plus, X, CheckCircle2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';

export interface MemorySuggestion {
  id: string;
  entity_name: string;
  claim_text: string;
  confidence: number;
  source_excerpt: string;
  reasoning?: string;
}

interface ChatMemorySuggestionProps {
  suggestion: MemorySuggestion;
  onApprove?: (suggestionId: string) => Promise<void>;
  onDismiss?: (suggestionId: string) => void;
}

export const ChatMemorySuggestion = ({ 
  suggestion, 
  onApprove, 
  onDismiss 
}: ChatMemorySuggestionProps) => {
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      if (onApprove) {
        await onApprove(suggestion.id);
      } else {
        // Default: approve via MRQ API
        await fetchJson(`/api/mrq/proposals/${suggestion.id}/approve`, {
          method: 'POST',
        });
      }
      setApproved(true);
      setTimeout(() => {
        if (onDismiss) {
          onDismiss(suggestion.id);
        }
      }, 2000);
    } catch (error) {
      console.error('Failed to approve memory suggestion:', error);
      setApproving(false);
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss(suggestion.id);
    }
  };

  if (approved) {
    return (
      <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">Memory saved!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 bg-primary/10 border border-primary/30 rounded-lg space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary">Memory Suggestion</span>
            <Badge variant="outline" className="text-xs border-primary/30 text-primary/70">
              {Math.round(suggestion.confidence * 100)}% confidence
            </Badge>
          </div>
          <p className="text-sm text-white/90 mb-1">
            <strong className="text-white">{suggestion.entity_name}:</strong> {suggestion.claim_text}
          </p>
          {suggestion.reasoning && (
            <p className="text-xs text-white/60 italic">"{suggestion.reasoning}"</p>
          )}
          <p className="text-xs text-white/50 mt-1">
            From: "{suggestion.source_excerpt}"
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleApprove}
            disabled={approving}
            className="p-1.5 rounded bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Save this memory"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4 text-white/40" />
          </button>
        </div>
      </div>
    </div>
  );
};

