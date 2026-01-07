// =====================================================
// CONTRADICTION REVIEW PANEL
// Purpose: Display and resolve open contradictions
// =====================================================

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchJson } from '../../lib/api';

interface ContradictionReview {
  id: string;
  unit_a_id: string;
  unit_b_id: string;
  contradiction_type: 'TEMPORAL' | 'FACTUAL' | 'PERSPECTIVE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'DISMISSED' | 'RESOLVED';
  detected_at: string;
}

interface ContradictionReviewPanelProps {
  contradictions: ContradictionReview[];
  onRefresh: () => void;
}

export const ContradictionReviewPanel: React.FC<ContradictionReviewPanelProps> = ({
  contradictions,
  onRefresh,
}) => {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionAction, setResolutionAction] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'HIGH':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'MEDIUM':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'LOW':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'TEMPORAL':
        return 'Temporal';
      case 'FACTUAL':
        return 'Factual';
      case 'PERSPECTIVE':
        return 'Perspective';
      default:
        return type;
    }
  };

  const handleResolve = async (contradictionId: string) => {
    if (!resolutionAction) {
      alert('Please select a resolution action');
      return;
    }

    setLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; message?: string; error?: string }>(
        `/api/correction-dashboard/contradictions/${contradictionId}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resolution_action: resolutionAction,
            reason: `Resolved via dashboard: ${resolutionAction}`,
          }),
        }
      );

      if (result.success) {
        setResolvingId(null);
        setResolutionAction('');
        onRefresh();
      } else {
        alert(result.error || 'Failed to resolve contradiction');
      }
    } catch (err: any) {
      console.error('Failed to resolve contradiction:', err);
      alert(err.message || 'Failed to resolve contradiction');
    } finally {
      setLoading(false);
    }
  };

  if (contradictions.length === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="pt-6 text-center py-12">
          <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-400/50" />
          <p className="text-white/60">No open contradictions found.</p>
          <p className="text-sm text-white/40 mt-2">
            All contradictions have been resolved or dismissed.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {contradictions.map(contradiction => (
        <Card key={contradiction.id} className="border-border/60 bg-black/40">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className={getSeverityColor(contradiction.severity)}>
                    {contradiction.severity} Severity
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {getTypeLabel(contradiction.contradiction_type)}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-white/50 mt-2">
                  Unit A: {contradiction.unit_a_id.substring(0, 8)}... | Unit B:{' '}
                  {contradiction.unit_b_id.substring(0, 8)}...
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Clock className="w-3 h-3" />
              <span>Detected: {formatDate(contradiction.detected_at)}</span>
            </div>

            {resolvingId === contradiction.id ? (
              <div className="space-y-3 p-4 border border-border/40 rounded bg-black/20">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Resolution Action:
                  </label>
                  <Select value={resolutionAction} onValueChange={setResolutionAction}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select resolution action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARK_CONTEXTUAL">
                        Mark as Contextual (Both valid in different contexts)
                      </SelectItem>
                      <SelectItem value="DEPRECATE_UNIT_A">Deprecate Unit A</SelectItem>
                      <SelectItem value="DEPRECATE_UNIT_B">Deprecate Unit B</SelectItem>
                      <SelectItem value="LOWER_CONFIDENCE">Lower Confidence of Both</SelectItem>
                      <SelectItem value="IGNORE_CONTRADICTION">Ignore Contradiction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleResolve(contradiction.id)}
                    disabled={!resolutionAction || loading}
                  >
                    Resolve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setResolvingId(null);
                      setResolutionAction('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResolvingId(contradiction.id)}
                disabled={loading}
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Resolve Contradiction
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

