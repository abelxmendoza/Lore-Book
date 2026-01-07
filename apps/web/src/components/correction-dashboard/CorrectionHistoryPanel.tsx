// =====================================================
// CORRECTION HISTORY PANEL
// Purpose: Display all correction records with before/after diffs
// =====================================================

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Clock, RotateCcw, User, Bot } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchJson } from '../../lib/api';

interface CorrectionRecord {
  id: string;
  target_type: 'CLAIM' | 'UNIT' | 'EVENT' | 'ENTITY';
  target_id: string;
  correction_type: string;
  before_snapshot: Record<string, any>;
  after_snapshot: Record<string, any>;
  reason: string | null;
  initiated_by: 'SYSTEM' | 'USER';
  reversible: boolean;
  created_at: string;
}

interface CorrectionHistoryPanelProps {
  corrections: CorrectionRecord[];
  onRefresh: () => void;
}

export const CorrectionHistoryPanel: React.FC<CorrectionHistoryPanelProps> = ({
  corrections,
  onRefresh,
}) => {
  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const getCorrectionTypeColor = (type: string) => {
    switch (type) {
      case 'USER_CORRECTION':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'AUTO_CONTRADICTION':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'CONFIDENCE_DOWNGRADE':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getTargetTypeLabel = (type: string) => {
    switch (type) {
      case 'UNIT':
        return 'Unit';
      case 'EVENT':
        return 'Event';
      case 'ENTITY':
        return 'Entity';
      case 'CLAIM':
        return 'Claim';
      default:
        return type;
    }
  };

  if (corrections.length === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="pt-6 text-center py-12">
          <p className="text-white/60">No corrections recorded yet.</p>
          <p className="text-sm text-white/40 mt-2">
            Corrections will appear here when information is updated or deprecated.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {corrections.map(correction => (
        <Card key={correction.id} className="border-border/60 bg-black/40">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className={getCorrectionTypeColor(correction.correction_type)}>
                    {correction.correction_type.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {getTargetTypeLabel(correction.target_type)}
                  </Badge>
                </CardTitle>
                {correction.reason && (
                  <p className="text-sm text-white/70 mt-2">{correction.reason}</p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/50">
                {correction.initiated_by === 'USER' ? (
                  <User className="w-3 h-3" />
                ) : (
                  <Bot className="w-3 h-3" />
                )}
                <span>{correction.initiated_by}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Before/After Diff */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border border-red-500/30 rounded bg-red-500/5">
                <div className="text-xs font-semibold text-red-400 mb-2">Before</div>
                <div className="text-sm text-white/80">
                  {correction.before_snapshot.content || JSON.stringify(correction.before_snapshot, null, 2)}
                </div>
              </div>
              <div className="p-3 border border-green-500/30 rounded bg-green-500/5">
                <div className="text-xs font-semibold text-green-400 mb-2">After</div>
                <div className="text-sm text-white/80">
                  {correction.after_snapshot.content || JSON.stringify(correction.after_snapshot, null, 2)}
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-white/50">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                <span>{formatDate(correction.created_at)}</span>
              </div>
              {correction.reversible && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs"
                  onClick={async () => {
                    // TODO: Implement revert functionality
                    alert('Revert functionality coming soon');
                  }}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Revert
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

