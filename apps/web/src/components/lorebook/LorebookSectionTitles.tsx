import { BookMarked, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';

const ORNAMENT = '— ✦ —';

type LorebookLibraryHeroProps = {
  subtitle?: string;
  /** Emerald accent for the compiled library editor page */
  variant?: 'default' | 'emerald';
  className?: string;
};

export function LorebookLibraryHero({
  subtitle,
  variant = 'default',
  className,
}: LorebookLibraryHeroProps) {
  const isEmerald = variant === 'emerald';
  const gradientClass = isEmerald
    ? 'from-emerald-200 via-teal-100 to-cyan-200 drop-shadow-[0_0_28px_rgba(52,211,153,0.3)]'
    : 'from-violet-200 via-purple-100 to-amber-200 drop-shadow-[0_0_30px_rgba(168,85,247,0.35)]';
  const lineClass = isEmerald ? 'via-emerald-400/45' : 'via-primary/50';
  const iconClass = isEmerald ? 'text-emerald-400/65' : 'text-primary/60';
  const ornamentClass = isEmerald ? 'text-emerald-400/35' : 'text-primary/35';

  return (
    <div className={cn('text-center mb-7 sm:mb-10 px-1', className)}>
      <p className={cn('font-serif text-xs sm:text-sm mb-3 tracking-[0.35em]', ornamentClass)}>
        {ORNAMENT}
      </p>

      <h1
        className="text-3xl sm:text-5xl lg:text-[3.25rem] font-bold mb-3 leading-[1.08] tracking-tight"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      >
        <span className={cn('text-transparent bg-clip-text bg-gradient-to-r', gradientClass)}>
          LoreBook
        </span>
        <span className="text-white/95"> Library</span>
      </h1>

      <div className="flex items-center justify-center gap-3 mb-4">
        <div className={cn('h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-transparent', lineClass)} />
        <BookMarked className={cn('h-4 w-4', iconClass)} aria-hidden />
        <div className={cn('h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-transparent', lineClass)} />
      </div>

      {subtitle && (
        <p className="text-white/50 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}

      <p className={cn('font-serif text-xs sm:text-sm mt-4 tracking-[0.35em]', ornamentClass)}>
        {ORNAMENT}
      </p>
    </div>
  );
}

type LorebookGeneratorSectionTitleProps = {
  className?: string;
};

export function LorebookGeneratorSectionTitle({ className }: LorebookGeneratorSectionTitleProps) {
  return (
    <div className={cn('flex items-center gap-2 mb-2.5', className)}>
      <Sparkles className="h-3 w-3 shrink-0 text-primary/45" aria-hidden />
      <h2 className="shrink-0 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.22em] text-white/40">
        Lorebook Generator
      </h2>
      <div className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" aria-hidden />
    </div>
  );
}
