/**
 * Recall Sources Component
 * 
 * Expandable list of past moments that match the recall query
 */

import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RecallSourceItem } from './RecallSourceItem';
import type { RecallSource } from './recallTypes';

type RecallSourcesProps = {
  sources: RecallSource[];
};

export const RecallSources = ({ sources }: RecallSourcesProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="recall-sources mt-3 pt-3 border-t border-border/20">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-white/70 hover:text-white hover:bg-white/5 w-full justify-between"
      >
        <span>
          {expanded ? 'Hide' : 'View'} {sources.length} past moment{sources.length > 1 ? 's' : ''}
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </Button>

      {expanded && (
        <ul className="mt-3 space-y-2">
          {sources.map((source) => (
            <RecallSourceItem key={source.entry_id} source={source} />
          ))}
        </ul>
      )}
    </div>
  );
};

