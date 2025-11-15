import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';

export const Card = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('rounded-xl border border-border/60 bg-black/30 p-6 shadow-panel backdrop-blur', className)}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-4 flex items-center justify-between', className)} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-lg font-semibold text-white font-techno tracking-wide', className)} {...props}>
    {children}
  </h3>
);

export const CardContent = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-4 text-sm text-white/80', className)} {...props}>
    {children}
  </div>
);
