import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn('rounded-full border border-primary/60 px-3 py-1 text-xs uppercase tracking-wide text-primary', className)}
    {...props}
  />
);
