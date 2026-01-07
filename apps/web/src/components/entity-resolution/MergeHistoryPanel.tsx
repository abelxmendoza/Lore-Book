// =====================================================
// MERGE HISTORY PANEL
// Purpose: Display entity merge history with revert capability
// =====================================================

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { RotateCcw, Clock, User, Bot, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchJson } from '../../lib/api';

interface EntityMergeRecord {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  source_entity_type: string;
  target_entity_type: string;
  merged_by: 'SYSTEM' | 'USER';
  reason: string | null;
  created_at: string;
  reversible: boolean;
  reverted_at: string | null;
}

interface MergeHistoryPanelProps {
  history: EntityMergeRecord[];
  onRefresh: () => void;
}

export const MergeHistoryPanel: React.FC<MergeHistoryPanelProps> = ({
  history,
  onRefresh,
}) => {
  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const handleRevert = async (mergeId: string) => {
    if (
      !confirm(
        'Are you sure you want to revert this merge? The source entity will be restored and references will be updated.'
      )
    ) {
      return;
    }

    try {
      const result = await fetchJson<{ success: boolean; message?: string; error?: string }>(
        `/api/entity-resolution/revert-merge/${mergeId}`,
        {
          method: 'POST',
        }
      );

      if (result.success) {
        onRefresh();
      } else {
        alert(result.error || 'Failed to revert merge');
      }
    } catch (err: any) {
      console.error('Failed to revert merge:', err);
      alert(err.message || 'Failed to revert merge');
    }
  };

  if (history.length === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="pt-6 text-center py-12">
          <p className="text-white/60">No merge history found.</p>
          <p className="text-sm text-white/40 mt-2">
            Merges will appear here when entities are combined.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {history.map(merge => (
        <Card key={merge.id} className="border-border/60 bg-black/40">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {merge.source_entity_type} → {merge.target_entity_type}
                  </Badge>
                  {merge.merged_by === 'USER' ? (
                    <User className="w-3 h-3" />
                  ) : (
                    <Bot className="w-3 h-3" />
                  )}
                  <span className="text-xs text-white/50">{merge.merged_by}</span>
                </CardTitle>
                {merge.reason && (
                  <p className="text-sm text-white/70 mt-2">{merge.reason}</p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 p-3 border border-border/40 rounded bg-black/20">
              <div className="flex-1 text-sm">
                <div className="font-medium">{merge.source_entity_id.substring(0, 8)}...</div>
                <div className="text-xs text-white/50">{merge.source_entity_type}</div>
              </div>
              <ArrowRight className="w-4 h-4" />
              <div className="flex-1 text-sm">
                <div className="font-medium">{merge.target_entity_id.substring(0, 8)}...</div>
                <div className="text-xs text-white/50">{merge.target_entity_type}</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-white/50">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                <span>{formatDate(merge.created_at)}</span>
              </div>
              {merge.reversible && !merge.reverted_at && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevert(merge.id)}
                  className="h-auto px-3 py-1.5 text-xs"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Revert
                </Button>
              )}
              {merge.reverted_at && (
                <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">
                  Reverted
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

