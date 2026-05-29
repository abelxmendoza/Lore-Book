import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-lg border border-border/50 bg-black/20 px-4 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none',
        className
      )}
      {...props}
    />
  )
);

Input.displayName = 'Input';
