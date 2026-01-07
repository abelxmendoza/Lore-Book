import React from 'react';
import { CheckCircle, XCircle, AlertCircle, HelpCircle, Ban } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Tooltip } from '../ui/tooltip';

export type BeliefResolutionStatus = 
  | 'UNRESOLVED'
  | 'SUPPORTED'
  | 'CONTRADICTED'
  | 'PARTIALLY_SUPPORTED'
  | 'ABANDONED';

interface BeliefResolutionBadgeProps {
  status: BeliefResolutionStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  explanation?: string;
}

const getStatusConfig = (status: BeliefResolutionStatus) => {
  switch (status) {
    case 'UNRESOLVED':
      return {
        icon: HelpCircle,
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        label: 'Unresolved',
        description: 'No strong evidence yet',
      };
    case 'SUPPORTED':
      return {
        icon: CheckCircle,
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        label: 'Supported',
        description: 'Evidence aligns with this belief',
      };
    case 'CONTRADICTED':
      return {
        icon: XCircle,
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        label: 'Contradicted',
        description: 'Evidence conflicts with this belief',
      };
    case 'PARTIALLY_SUPPORTED':
      return {
        icon: AlertCircle,
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        label: 'Mixed Evidence',
        description: 'Some evidence supports, some contradicts',
      };
    case 'ABANDONED':
      return {
        icon: Ban,
        color: 'bg-gray-600/20 text-gray-500 border-gray-600/30',
        label: 'Abandoned',
        description: 'You moved away from this belief',
      };
    default:
      return {
        icon: HelpCircle,
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        label: 'Unknown',
        description: 'Resolution status unknown',
      };
  }
};

export const BeliefResolutionBadge: React.FC<BeliefResolutionBadgeProps> = ({
  status,
  showLabel = true,
  size = 'sm',
  explanation,
}) => {
  const config = getStatusConfig(status);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1.5',
  };

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const tooltipContent = explanation || config.description;

  return (
    <Tooltip content={tooltipContent} side="top">
      <Badge
        variant="outline"
        className={`${config.color} ${sizeClasses[size]} flex items-center gap-1 cursor-help`}
      >
        <Icon className={iconSizes[size]} />
        {showLabel && <span>{config.label}</span>}
      </Badge>
    </Tooltip>
  );
};

