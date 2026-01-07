// =====================================================
// ENTITY CONFLICTS PANEL
// Purpose: Display and resolve entity conflicts/duplicates
// =====================================================

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { AlertTriangle, Merge, X, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchJson } from '../../lib/api';

interface EntityConflict {
  id: string;
  entity_a_id: string;
  entity_b_id: string;
  entity_a_type: string;
  entity_b_type: string;
  similarity_score: number;
  conflict_reason: string;
  status: string;
  detected_at: string;
}

interface EntityConflictsPanelProps {
  conflicts: EntityConflict[];
  onRefresh: () => void;
}

export const EntityConflictsPanel: React.FC<EntityConflictsPanelProps> = ({
  conflicts,
  onRefresh,
}) => {
  const [mergingConflict, setMergingConflict] = useState<EntityConflict | null>(null);
  const [mergeReason, setMergeReason] = useState('');
  const [loading, setLoading] = useState(false);

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const getConflictReasonLabel = (reason: string) => {
    switch (reason) {
      case 'NAME_SIMILARITY':
        return 'Similar Names';
      case 'CONTEXT_OVERLAP':
        return 'Context Overlap';
      case 'COREFERENCE':
        return 'Coreference';
      case 'TEMPORAL_OVERLAP':
        return 'Temporal Overlap';
      default:
        return reason;
    }
  };

  const handleMerge = async (conflict: EntityConflict) => {
    if (!mergeReason.trim()) {
      alert('Please provide a reason for merging');
      return;
    }

    setLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; message?: string; error?: string }>(
        '/api/entity-resolution/merge',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_id: conflict.entity_a_id,
            target_id: conflict.entity_b_id,
            source_type: conflict.entity_a_type,
            target_type: conflict.entity_b_type,
            reason: mergeReason,
          }),
        }
      );

      if (result.success) {
        setMergingConflict(null);
        setMergeReason('');
        onRefresh();
      } else {
        alert(result.error || 'Failed to merge entities');
      }
    } catch (err: any) {
      console.error('Failed to merge entities:', err);
      alert(err.message || 'Failed to merge entities');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (conflictId: string) => {
    if (!confirm('Are you sure you want to dismiss this conflict? It will not be shown again.')) {
      return;
    }

    setLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; message?: string; error?: string }>(
        `/api/entity-resolution/conflicts/${conflictId}/dismiss`,
        {
          method: 'POST',
        }
      );

      if (result.success) {
        onRefresh();
      } else {
        alert(result.error || 'Failed to dismiss conflict');
      }
    } catch (err: any) {
      console.error('Failed to dismiss conflict:', err);
      alert(err.message || 'Failed to dismiss conflict');
    } finally {
      setLoading(false);
    }
  };

  if (conflicts.length === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="pt-6 text-center py-12">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-green-400/50" />
          <p className="text-white/60">No conflicts found.</p>
          <p className="text-sm text-white/40 mt-2">
            All entities appear to be distinct. Conflicts will appear here if duplicates are detected.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {conflicts.map(conflict => (
          <Card key={conflict.id} className="border-border/60 bg-black/40">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                      {Math.round(conflict.similarity_score * 100)}% Similar
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {getConflictReasonLabel(conflict.conflict_reason)}
                    </Badge>
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Side-by-side entity cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border border-border/40 rounded bg-black/20">
                  <div className="text-xs font-semibold text-white/60 mb-1">Entity A</div>
                  <div className="text-sm font-medium">{conflict.entity_a_id.substring(0, 8)}...</div>
                  <div className="text-xs text-white/50 mt-1">{conflict.entity_a_type}</div>
                </div>
                <div className="p-3 border border-border/40 rounded bg-black/20">
                  <div className="text-xs font-semibold text-white/60 mb-1">Entity B</div>
                  <div className="text-sm font-medium">{conflict.entity_b_id.substring(0, 8)}...</div>
                  <div className="text-xs text-white/50 mt-1">{conflict.entity_b_type}</div>
                </div>
              </div>

              <div className="text-xs text-white/50">
                Detected: {formatDate(conflict.detected_at)}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMergingConflict(conflict)}
                  disabled={loading}
                  className="h-auto px-3 py-1.5 text-xs"
                >
                  <Merge className="w-3 h-3 mr-1" />
                  Merge
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDismiss(conflict.id)}
                  disabled={loading}
                  className="h-auto px-3 py-1.5 text-xs"
                >
                  <X className="w-3 h-3 mr-1" />
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Merge Modal */}
      {mergingConflict && (
        <Modal
          isOpen={true}
          onClose={() => {
            setMergingConflict(null);
            setMergeReason('');
          }}
          title="Merge Entities"
        >
          <div className="space-y-4">
            <p className="text-sm text-white/70">
              Merging will combine these entities. All references to Entity A will be updated to
              point to Entity B. This action is reversible.
            </p>
            <div className="flex items-center gap-2 p-3 border border-border/40 rounded bg-black/20">
              <div className="flex-1 text-sm">
                <div className="font-medium">{mergingConflict.entity_a_id.substring(0, 8)}...</div>
                <div className="text-xs text-white/50">{mergingConflict.entity_a_type}</div>
              </div>
              <ArrowRight className="w-4 h-4" />
              <div className="flex-1 text-sm">
                <div className="font-medium">{mergingConflict.entity_b_id.substring(0, 8)}...</div>
                <div className="text-xs text-white/50">{mergingConflict.entity_b_type}</div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Reason for merging:</label>
              <Input
                value={mergeReason}
                onChange={e => setMergeReason(e.target.value)}
                placeholder="Why are you merging these entities?"
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMergingConflict(null);
                  setMergeReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleMerge(mergingConflict)}
                disabled={!mergeReason.trim() || loading}
              >
                Merge Entities
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

