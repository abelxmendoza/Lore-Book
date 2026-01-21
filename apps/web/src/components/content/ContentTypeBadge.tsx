import { Badge } from '../ui/badge';
import { 
  MessageSquare, 
  Heart, 
  BookOpen, 
  Lightbulb, 
  FileText, 
  Scroll, 
  Shield, 
  Lock,
  Sparkles,
  CheckCircle
} from 'lucide-react';
import { cn } from '../../lib/cn';

export type ContentType = 
  | 'standard'
  | 'testimony'
  | 'advice'
  | 'message_to_reader'
  | 'dedication'
  | 'acknowledgment'
  | 'preface'
  | 'epilogue'
  | 'manifesto'
  | 'vow'
  | 'promise'
  | 'declaration';

interface ContentTypeBadgeProps {
  contentType?: ContentType | string | null;
  preserveOriginal?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const contentTypeConfig: Record<ContentType, { 
  label: string; 
  icon: React.ComponentType<{ className?: string }>; 
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  standard: {
    label: 'Standard',
    icon: FileText,
    color: 'text-white/60',
    bgColor: 'bg-white/5',
    borderColor: 'border-white/10'
  },
  testimony: {
    label: 'Testimony',
    icon: Scroll,
    color: 'text-purple-300',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/30'
  },
  advice: {
    label: 'Advice',
    icon: Lightbulb,
    color: 'text-yellow-300',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/30'
  },
  message_to_reader: {
    label: 'To Reader',
    icon: MessageSquare,
    color: 'text-blue-300',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30'
  },
  dedication: {
    label: 'Dedication',
    icon: Heart,
    color: 'text-pink-300',
    bgColor: 'bg-pink-500/20',
    borderColor: 'border-pink-500/30'
  },
  acknowledgment: {
    label: 'Acknowledgment',
    icon: CheckCircle,
    color: 'text-green-300',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/30'
  },
  preface: {
    label: 'Preface',
    icon: BookOpen,
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-500/20',
    borderColor: 'border-cyan-500/30'
  },
  epilogue: {
    label: 'Epilogue',
    icon: BookOpen,
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-500/20',
    borderColor: 'border-cyan-500/30'
  },
  manifesto: {
    label: 'Manifesto',
    icon: Shield,
    color: 'text-orange-300',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/30'
  },
  vow: {
    label: 'Vow',
    icon: Lock,
    color: 'text-red-300',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/30'
  },
  promise: {
    label: 'Promise',
    icon: Sparkles,
    color: 'text-indigo-300',
    bgColor: 'bg-indigo-500/20',
    borderColor: 'border-indigo-500/30'
  },
  declaration: {
    label: 'Declaration',
    icon: Shield,
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/30'
  }
};

export const ContentTypeBadge: React.FC<ContentTypeBadgeProps> = ({
  contentType,
  preserveOriginal,
  className,
  size = 'sm'
}) => {
  if (!contentType || contentType === 'standard') {
    return null;
  }

  const config = contentTypeConfig[contentType as ContentType];
  if (!config) {
    return null;
  }

  const Icon = config.icon;
  const sizeClasses = {
    sm: 'text-[9px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-1 gap-1.5',
    lg: 'text-sm px-2.5 py-1.5 gap-2'
  };

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-4 w-4'
  };

  return (
    <Badge
      className={cn(
        'inline-flex items-center border font-medium',
        config.color,
        config.bgColor,
        config.borderColor,
        sizeClasses[size],
        preserveOriginal && 'ring-1 ring-primary/50',
        className
      )}
      title={preserveOriginal ? 'Original language preserved' : undefined}
    >
      <Icon className={iconSizes[size]} />
      <span>{config.label}</span>
      {preserveOriginal && (
        <Lock className={cn(iconSizes[size], 'text-primary/70')} />
      )}
    </Badge>
  );
};
