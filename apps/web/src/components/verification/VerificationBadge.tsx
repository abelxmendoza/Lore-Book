import { CheckCircle2, AlertCircle, XCircle, HelpCircle } from 'lucide-react';
import { type VerificationStatus } from '../../api/verification';
import { cn } from '../../lib/cn';

type VerificationBadgeProps = {
  status: VerificationStatus | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
  onClick?: () => void;
};

const statusConfig = {
  verified: {
    icon: CheckCircle2,
    label: 'Verified',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    borderColor: 'border-green-400/30'
  },
  unverified: {
    icon: HelpCircle,
    label: 'Unverified',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    borderColor: 'border-yellow-400/30'
  },
  contradicted: {
    icon: XCircle,
    label: 'Contradicted',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400/30'
  },
  ambiguous: {
    icon: AlertCircle,
    label: 'Ambiguous',
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    borderColor: 'border-orange-400/30'
  }
};

export const VerificationBadge = ({
  status = 'unverified',
  size = 'md',
  showLabel = false,
  className,
  onClick
}: VerificationBadgeProps) => {
  if (!status) return null;

  const config = statusConfig[status];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1',
        config.bgColor,
        config.borderColor,
        onClick && 'cursor-pointer hover:opacity-80',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Verification status: ${config.label}`}
    >
      <Icon className={cn(sizeClasses[size], config.color)} />
      {showLabel && (
        <span className={cn(textSizeClasses[size], config.color, 'font-medium')}>
          {config.label}
        </span>
      )}
    </div>
  );
};

