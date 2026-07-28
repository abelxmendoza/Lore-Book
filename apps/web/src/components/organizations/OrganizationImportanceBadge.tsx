import { Tooltip } from '../ui/tooltip';
import { importanceDisplay } from '../../lib/organizationLore';
import { cn } from '../../lib/cn';

type Props = {
  score: number | undefined | null;
  /** Compact card row vs modal header. */
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * Labeled importance chip — stars alone look like favorites; this always
 * says "in your life" and explains the scoring criteria on hover/focus.
 */
export function OrganizationImportanceBadge({ score, size = 'md', className }: Props) {
  const { stars, band, shortLabel, tooltip } = importanceDisplay(score);
  const compact = size === 'sm';

  return (
    <Tooltip content={tooltip}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-200/90',
          compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]',
          className,
        )}
        aria-label={`${shortLabel}, ${stars} of 5 stars`}
      >
        <span className={cn('font-medium text-amber-100/90', compact ? 'hidden' : 'inline')}>
          {band}
        </span>
        <span className={cn('text-white/45', compact ? 'inline' : 'hidden sm:inline')}>in your life</span>
        <span className="inline-flex items-center leading-none text-amber-300" aria-hidden="true">
          {'★'.repeat(stars)}
          <span className="text-white/20">{'★'.repeat(5 - stars)}</span>
        </span>
      </span>
    </Tooltip>
  );
}
