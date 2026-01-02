import { cn } from '../../lib/cn';

type SkeletonProps = {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
};

export const Skeleton = ({ 
  className, 
  variant = 'rectangular', 
  width, 
  height,
  lines 
}: SkeletonProps) => {
  const baseClasses = 'animate-pulse bg-white/10 rounded';
  
  const variantClasses = {
    text: 'h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg'
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  if (lines && lines > 1) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(baseClasses, variantClasses[variant], i === lines - 1 ? 'w-3/4' : 'w-full')}
            style={i === lines - 1 ? { width: '75%' } : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(baseClasses, variantClasses[variant], className)}
      style={style}
    />
  );
};

// Pre-built skeleton components for common use cases
export const EntrySkeleton = () => (
  <div className="space-y-3 rounded-xl border border-border/60 bg-black/30 p-4">
    <Skeleton variant="text" width="60%" />
    <Skeleton variant="text" lines={3} />
    <div className="flex gap-2">
      <Skeleton variant="rectangular" width={60} height={24} />
      <Skeleton variant="rectangular" width={60} height={24} />
    </div>
  </div>
);

export const CharacterCardSkeleton = () => (
  <div className="space-y-3 rounded-xl border border-border/60 bg-black/30 p-4">
    <div className="flex items-center gap-3">
      <Skeleton variant="circular" width={40} height={40} />
      <div className="flex-1 space-y-2">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="text" width="60%" />
      </div>
    </div>
    <Skeleton variant="text" lines={2} />
  </div>
);

export const TimelineSkeleton = () => (
  <div className="space-y-4">
    {Array.from({ length: 5 }).map((_, i) => (
      <EntrySkeleton key={i} />
    ))}
  </div>
);

