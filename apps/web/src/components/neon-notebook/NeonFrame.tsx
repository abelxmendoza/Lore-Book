import type { PropsWithChildren } from 'react';

import { cn } from '../../lib/utils';

export const NeonFrame = ({ children, moodColor }: PropsWithChildren<{ moodColor: string }>) => {
  return (
    <div
      className={cn(
        'neon-border neon-shadow notebook-background relative overflow-hidden rounded-2xl border border-white/10 p-6 text-foreground',
        'transition-all duration-500'
      )}
      style={{ boxShadow: `0 0 30px ${moodColor}55, inset 0 0 20px ${moodColor}22` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 opacity-40" />
      <div className="relative z-10 crt-scanlines">{children}</div>
    </div>
  );
};
