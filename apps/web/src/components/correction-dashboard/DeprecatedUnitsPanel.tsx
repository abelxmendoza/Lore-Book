// =====================================================
// DEPRECATED UNITS PANEL
// Purpose: Display and manage deprecated units
// =====================================================

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
// Using Modal instead of AlertDialog (if AlertDialog doesn't exist)
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { Trash2, RotateCcw, Clock, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchJson } from '../../lib/api';

interface DeprecatedUnit {
  unit_id: string;
  unit_type: string;
  content: string;
  deprecated_reason: string;
  deprecated_at: string;
  linked_events: string[];
  source_message_ids: string[];
  confidence: number;
}

interface DeprecatedUnitsPanelProps {
  units: DeprecatedUnit[];
  onRefresh: () => void;
}

export const DeprecatedUnitsPanel: React.FC<DeprecatedUnitsPanelProps> = ({
  units,
  onRefresh,
}) => {
  const [pruningUnitId, setPruningUnitId] = useState<string | null>(null);
  const [pruneReason, setPruneReason] = useState('');
  const [loading, setLoading] = useState(false);

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const handlePrune = async (unitId: string) => {
    if (!pruneReason.trim()) {
      alert('Please provide a reason for pruning');
      return;
    }

    setLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; message?: string; error?: string }>(
        `/api/correction-dashboard/deprecated/${unitId}/prune`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: pruneReason }),
        }
      );

      if (result.success) {
        setPruningUnitId(null);
        setPruneReason('');
        onRefresh();
      } else {
        alert(result.error || 'Failed to prune unit');
      }
    } catch (err: any) {
      console.error('Failed to prune unit:', err);
      alert(err.message || 'Failed to prune unit');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (unitId: string) => {
    setLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; message?: string; error?: string }>(
        `/api/correction-dashboard/deprecated/${unitId}/restore`,
        {
          method: 'POST',
        }
      );

      if (result.success) {
        onRefresh();
      } else {
        alert(result.error || 'Failed to restore unit');
      }
    } catch (err: any) {
      console.error('Failed to restore unit:', err);
      alert(err.message || 'Failed to restore unit');
    } finally {
      setLoading(false);
    }
  };

  if (units.length === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="pt-6 text-center py-12">
          <p className="text-white/60">No deprecated units found.</p>
          <p className="text-sm text-white/40 mt-2">
            Units that are corrected or contradicted will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {units.map(unit => (
        <Card key={unit.unit_id} className="border-border/60 bg-black/40">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {unit.unit_type}
                  </Badge>
                  <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">
                    {Math.round(unit.confidence * 100)}% confidence
                  </Badge>
                </CardTitle>
                <p className="text-sm text-white/80 mt-2">{unit.content}</p>
                <p className="text-xs text-white/50 mt-1 italic">{unit.deprecated_reason}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Clock className="w-3 h-3" />
              <span>Deprecated: {formatDate(unit.deprecated_at)}</span>
            </div>

            {unit.linked_events.length > 0 && (
              <div className="text-xs text-white/50">
                Linked to {unit.linked_events.length} event(s)
              </div>
            )}

            <div className="flex items-center gap-2">
              <Modal
                isOpen={pruningUnitId === unit.unit_id}
                onClose={() => {
                  setPruningUnitId(null);
                  setPruneReason('');
                }}
                title="Prune Deprecated Unit"
              >
                <div className="space-y-4">
                  <p className="text-sm text-white/70">
                    Pruning will permanently remove this unit from the system. This action can be
                    reversed, but the unit will need to be manually restored.
                  </p>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Reason for pruning:</label>
                    <Input
                      value={pruneReason}
                      onChange={e => setPruneReason(e.target.value)}
                      placeholder="Why are you pruning this unit?"
                      className="w-full"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPruningUnitId(null);
                        setPruneReason('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handlePrune(unit.unit_id)}
                      disabled={!pruneReason.trim() || loading}
                    >
                      Prune
                    </Button>
                  </div>
                </div>
              </Modal>
              <Button
                variant="outline"
                size="sm"
                className="h-auto px-3 py-1.5 text-xs"
                disabled={loading}
                onClick={() => setPruningUnitId(unit.unit_id)}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Prune
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-auto px-3 py-1.5 text-xs"
                onClick={() => handleRestore(unit.unit_id)}
                disabled={loading}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Restore
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

