import { MAIN_LORE_ENTITIES, type LoreEntityKind } from '../../lib/loreEntities';
import { cn } from '../../lib/cn';

type Props = {
  className?: string;
  /** Highlight kinds linked on the current surface (e.g. project) */
  activeKinds?: LoreEntityKind[];
  compact?: boolean;
  title?: string;
};

export function LoreEntityLegend({
  className,
  activeKinds,
  compact = false,
  title = 'Lore entity types',
}: Props) {
  const activeSet = activeKinds ? new Set(activeKinds) : null;

  return (
    <div className={cn('rounded-lg border border-white/10 bg-black/25 p-2.5 sm:p-3', className)}>
      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">
        {title}
      </p>
      <div
        className={cn(
          'grid gap-1.5',
          compact ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3',
        )}
      >
        {MAIN_LORE_ENTITIES.map((entity) => {
          const Icon = entity.icon;
          const isActive = activeSet?.has(entity.kind);
          return (
            <div
              key={entity.kind}
              className={cn(
                'flex items-start gap-1.5 rounded-md border px-1.5 py-1.5 min-w-0 transition-colors',
                isActive
                  ? cn(entity.chip, 'ring-1 ring-white/10')
                  : 'border-white/8 bg-white/[0.02] text-white/55',
                !compact && 'sm:py-2 sm:px-2',
              )}
              title={entity.description}
            >
              <span
                className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', entity.swatch, isActive ? 'opacity-100' : 'opacity-60')}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 min-w-0">
                  <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  <span className={cn('font-medium truncate', compact ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-xs')}>
                    {compact ? entity.shortLabel : entity.label}
                  </span>
                </div>
                {!compact && (
                  <p className="text-[9px] text-white/35 leading-snug line-clamp-2 mt-0.5 hidden sm:block">
                    {entity.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
