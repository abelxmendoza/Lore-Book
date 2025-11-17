import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'outline' | 'secondary';
};

export const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => {
  const variantClasses = {
    default: 'border-primary/60 text-primary',
    outline: 'border-border/30 text-white/70',
    secondary: 'border-primary/30 text-primary/70 bg-primary/10'
  };

  return (
    <span
      className={cn(
        'rounded-full border px-3 py-1 text-xs uppercase tracking-wide',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
};
