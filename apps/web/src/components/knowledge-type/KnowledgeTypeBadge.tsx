import React from 'react';
import { Eye, Heart, Lightbulb, CheckCircle, Target, HelpCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Tooltip } from '../ui/tooltip';

export type KnowledgeType = 
  | 'EXPERIENCE'
  | 'FEELING'
  | 'BELIEF'
  | 'FACT'
  | 'DECISION'
  | 'QUESTION';

interface KnowledgeTypeBadgeProps {
  type: KnowledgeType;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const getTypeConfig = (type: KnowledgeType) => {
  switch (type) {
    case 'EXPERIENCE':
      return {
        icon: Eye,
        color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        label: 'Experience',
        description: 'What happened to you',
      };
    case 'FEELING':
      return {
        icon: Heart,
        color: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
        label: 'Feeling',
        description: 'What you felt',
      };
    case 'BELIEF':
      return {
        icon: Lightbulb,
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        label: 'Belief',
        description: 'What you think or assume',
      };
    case 'FACT':
      return {
        icon: CheckCircle,
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        label: 'Fact',
        description: 'Verifiable claim',
      };
    case 'DECISION':
      return {
        icon: Target,
        color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        label: 'Decision',
        description: 'What you chose',
      };
    case 'QUESTION':
      return {
        icon: HelpCircle,
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        label: 'Question',
        description: 'Unresolved inquiry',
      };
    default:
      return {
        icon: HelpCircle,
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        label: 'Unknown',
        description: 'Unknown knowledge type',
      };
  }
};

export const KnowledgeTypeBadge: React.FC<KnowledgeTypeBadgeProps> = ({
  type,
  showLabel = true,
  size = 'sm',
}) => {
  const config = getTypeConfig(type);
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
