import React from 'react';
import { AlertTriangle, X, CheckCircle, Ban, Eye, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { format, parseISO } from 'date-fns';

export type ContradictionAlertAction = 'REVIEW' | 'ABANDON' | 'DISMISS' | 'NOT_NOW';

export interface ContradictionAlert {
  id: string;
  user_id: string;
  belief_unit_id: string;
  belief_content: string;
  resolution_status: string;
  resolution_confidence: number;
  contradicting_evidence_ids: string[];
  supporting_evidence_ids: string[];
  suggested_action: ContradictionAlertAction;
  user_action?: ContradictionAlertAction | null;
  dismissed_at?: string | null;
  created_at: string;
  metadata: Record<string, any>;
}

interface ContradictionAlertCardProps {
  alert: ContradictionAlert;
  onAction?: (alertId: string, action: ContradictionAlertAction) => void;
}

const getStatusConfig = (status: string, confidence: number) => {
  if (status === 'CONTRADICTED') {
    return {
      icon: AlertTriangle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10 border-red-500/30',
      label: 'Contradicted',
      description: `This belief conflicts with evidence (${Math.round(confidence * 100)}% confidence)`,
    };
  }
  if (status === 'PARTIALLY_SUPPORTED') {
    return {
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10 border-yellow-500/30',
      label: 'Mixed Evidence',
      description: `This belief has conflicting evidence (${Math.round(confidence * 100)}% confidence)`,
    };
  }
  return null;
};

const getActionConfig = (action: ContradictionAlertAction) => {
  switch (action) {
    case 'REVIEW':
      return { icon: Eye, label: 'Review', variant: 'default' as const };
    case 'ABANDON':
      return { icon: Ban, label: 'Abandon', variant: 'destructive' as const };
    case 'DISMISS':
      return { icon: X, label: 'Dismiss', variant: 'outline' as const };
    case 'NOT_NOW':
      return { icon: Clock, label: 'Not Now', variant: 'outline' as const };
    default:
      return { icon: Eye, label: 'Review', variant: 'default' as const };
  }
};

export const ContradictionAlertCard: React.FC<ContradictionAlertCardProps> = ({
  alert,
  onAction,
}) => {
  const statusConfig = getStatusConfig(alert.resolution_status, alert.resolution_confidence);
  const StatusIcon = statusConfig?.icon || AlertTriangle;
  const actionConfig = getActionConfig(alert.suggested_action);
  const ActionIcon = actionConfig.icon;

  const handleAction = async (action: ContradictionAlertAction) => {
    try {
      await fetchJson(`/api/contradiction-alerts/${alert.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (onAction) {
        onAction(alert.id, action);
      }
    } catch (error) {
      console.error('Failed to handle alert action:', error);
    }
  };

  if (!statusConfig) {
    return null; // Don't show if status doesn't warrant alert
  }

  return (
    <Card className={`bg-black/40 border-border/50 ${statusConfig.bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
            <h3 className="text-lg font-semibold text-white">{statusConfig.label}</h3>
            <Badge variant="outline" className="text-xs">
              {Math.round(alert.resolution_confidence * 100)}% confidence
            </Badge>
          </div>
          <div className="text-xs text-white/50">
            {format(parseISO(alert.created_at), 'MMM d, yyyy')}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Belief Content */}
        <div className="space-y-2">
          <div className="text-xs text-white/50">Your belief:</div>
          <p className="text-sm text-white/80 italic pl-4 border-l-2 border-white/20">
            "{alert.belief_content}"
          </p>
        </div>

        {/* Evidence Summary */}
        <div className="space-y-2">
          <div className="text-xs text-white/50">Evidence:</div>
          <div className="flex items-center gap-4 text-xs">
            {alert.contradicting_evidence_ids.length > 0 && (
              <div className="flex items-center gap-1 text-red-400">
                <X className="h-3 w-3" />
                <span>{alert.contradicting_evidence_ids.length} contradicting</span>
              </div>
            )}
            {alert.supporting_evidence_ids.length > 0 && (
              <div className="flex items-center gap-1 text-green-400">
                <CheckCircle className="h-3 w-3" />
                <span>{alert.supporting_evidence_ids.length} supporting</span>
              </div>
            )}
          </div>
        </div>

        {/* Suggested Action */}
        {alert.suggested_action && (
          <div className="pt-2 border-t border-white/10">
            <div className="text-xs text-white/50 mb-2">
              Suggested: {getActionConfig(alert.suggested_action).label}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!alert.user_action && !alert.dismissed_at && (
          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              variant={actionConfig.variant}
              onClick={() => handleAction(alert.suggested_action)}
            >
              <ActionIcon className="h-4 w-4 mr-2" />
              {actionConfig.label}
            </Button>
            {alert.suggested_action !== 'DISMISS' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction('DISMISS')}
              >
                <X className="h-4 w-4 mr-2" />
                Dismiss
              </Button>
            )}
            {alert.suggested_action !== 'NOT_NOW' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction('NOT_NOW')}
              >
                <Clock className="h-4 w-4 mr-2" />
                Not Now
              </Button>
            )}
          </div>
        )}

        {/* User Action Status */}
        {alert.user_action && (
          <div className="pt-2 border-t border-white/10">
            <div className="text-xs text-white/50">
              You chose: <span className="text-white/70">{getActionConfig(alert.user_action).label}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

