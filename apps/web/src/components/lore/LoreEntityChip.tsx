import type { ReactNode } from 'react';
import { getLoreEntity, type LoreEntityKind } from '../../lib/loreEntities';
import { cn } from '../../lib/cn';

type Props = {
  kind: LoreEntityKind;
  children: ReactNode;
  className?: string;
};

export function LoreEntityChip({ kind, children, className }: Props) {
  const entity = getLoreEntity(kind);
  const Icon = entity.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium max-w-full',
        entity.chip,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
