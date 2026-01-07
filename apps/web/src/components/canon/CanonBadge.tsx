import React from 'react';
import { BookOpen, Theater, Lightbulb, PenTool, Brain, Settings } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Tooltip } from '../ui/tooltip';

export type CanonStatus = 
  | 'CANON'
  | 'ROLEPLAY'
  | 'HYPOTHETICAL'
  | 'FICTIONAL'
  | 'THOUGHT_EXPERIMENT'
  | 'META';

interface CanonBadgeProps {
  status: CanonStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const getStatusConfig = (status: CanonStatus) => {
  switch (status) {
    case 'CANON':
      return {
        icon: BookOpen,
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        label: 'Canon',
        description: 'Real life, factual content',
      };
    case 'ROLEPLAY':
      return {
        icon: Theater,
        color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        label: 'Roleplay',
        description: 'Acting as a character',
      };
    case 'HYPOTHETICAL':
      return {
        icon: Lightbulb,
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        label: 'Hypothetical',
        description: '"What if..." exploration',
      };
    case 'FICTIONAL':
      return {
        icon: PenTool,
        color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        label: 'Fictional',
        description: 'Creative writing',
      };
    case 'THOUGHT_EXPERIMENT':
      return {
        icon: Brain,
        color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        label: 'Thought Experiment',
        description: 'Abstract/philosophical reasoning',
      };
    case 'META':
      return {
        icon: Settings,
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        label: 'Meta',
        description: 'Talking about the system itself',
      };
    default:
      return {
        icon: BookOpen,
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        label: 'Unknown',
        description: 'Unknown canon status',
      };
  }
};

export const CanonBadge: React.FC<CanonBadgeProps> = ({
  status,
  showLabel = true,
  size = 'sm',
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

  return (
    <Tooltip content={config.description} side="top">
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

