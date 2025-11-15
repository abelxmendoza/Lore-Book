import type { TextareaHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={cn(
      'min-h-[120px] w-full rounded-lg border border-border/50 bg-black/20 p-4 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none',
      className
    )}
    {...props}
  />
);
