import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import './RotatingHeroHeadline.css';

const PHRASES = [
  { id: 'remembers', label: 'It Remembers.' },
  { id: 'noted', label: 'Noted.' },
  { id: 'learns', label: 'It learns who you are.' },
  { id: 'autobiographer', label: 'The Autobiographer AI' },
] as const;

const ROTATE_MS = 5500;
const CROSSFADE_MS = 800;

const serifStyle = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

const HEADLINE_SIZE_CLASS =
  'text-[1.5rem] leading-[1.12] sm:text-3xl md:text-4xl lg:text-5xl xl:text-[3.25rem] max-w-[22ch] sm:max-w-none mx-auto md:mx-0 text-balance';

function HeadlineContent({ phraseId }: { phraseId: (typeof PHRASES)[number]['id'] }) {
  if (phraseId === 'remembers') {
    return (
      <>
        <span className="text-white/95">It </span>
        <span className="relative mx-1 inline-block sm:mx-1.5">
          <span
            className="absolute -inset-x-3 -inset-y-2 bg-gradient-to-r from-purple-500/40 via-pink-500/35 to-violet-500/40 blur-2xl rounded-full pointer-events-none hero-headline-glow"
            aria-hidden
          />
          <span className="relative bg-gradient-to-r from-purple-200 via-pink-200 to-violet-300 bg-clip-text text-transparent">
            Remembers
          </span>
        </span>
        <span className="text-white/95">.</span>
      </>
    );
  }

  if (phraseId === 'noted') {
    return (
      <span className="relative inline-block">
        <span
          className="absolute -inset-x-4 -inset-y-3 bg-gradient-to-r from-violet-500/30 via-fuchsia-500/25 to-purple-500/30 blur-2xl rounded-full pointer-events-none hero-headline-glow"
          aria-hidden
        />
        <span
          className="relative font-mono tracking-tight bg-gradient-to-r from-purple-100 via-pink-100 to-violet-200 bg-clip-text text-transparent"
          style={{ letterSpacing: '-0.02em' }}
        >
          Noted.
        </span>
      </span>
    );
  }

  if (phraseId === 'learns') {
    return (
      <>
        <span className="text-white/95">It&nbsp;</span>
        <span className="relative inline-block">
          <span
            className="absolute -inset-x-2 -inset-y-1 bg-gradient-to-r from-purple-500/25 via-pink-500/20 to-violet-500/25 blur-xl rounded-full pointer-events-none hero-headline-glow"
            aria-hidden
          />
          <span className="relative bg-gradient-to-r from-white via-purple-100 to-pink-100 bg-clip-text text-transparent">
            learns
          </span>
        </span>
        <span className="text-white/95"> who you are.</span>
      </>
    );
  }

  return (
    <>
      <span className="text-white/90">The </span>
      <span className="relative mx-1 inline-block sm:mx-1.5">
        <span
          className="absolute -inset-x-3 -inset-y-2 bg-gradient-to-r from-purple-500/35 via-pink-500/30 to-violet-500/35 blur-2xl rounded-full pointer-events-none hero-headline-glow"
          aria-hidden
        />
        <span className="relative bg-gradient-to-r from-purple-200 via-pink-200 to-violet-300 bg-clip-text text-transparent">
          Autobiographer
        </span>
      </span>
      <span className="text-white/90"> AI</span>
    </>
  );
}

type RotatingHeroHeadlineProps = {
  className?: string;
};

export function RotatingHeroHeadline({ className }: RotatingHeroHeadlineProps) {
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const phrase = PHRASES[index];

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const timer = window.setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % PHRASES.length;
        setPrevIndex(current);
        window.setTimeout(() => setPrevIndex(null), CROSSFADE_MS);
        return next;
      });
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, []);

  const visibleIndices = new Set(
    [index, prevIndex].filter((i): i is number => i !== null),
  );

  return (
    <div
      className={cn('relative w-full text-center md:text-left', className)}
      data-testid="hero-rotating-headline"
    >
      <div className="relative">
        <span
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 sm:h-20 bg-[radial-gradient(ellipse_at_center,rgba(154,77,255,0.12),transparent_70%)]"
          aria-hidden
        />
        <h1
          className={cn(
            'hero-headline-stage relative font-bold text-white tracking-wide [word-spacing:0.08em] sm:[word-spacing:0.1em]',
            HEADLINE_SIZE_CLASS,
          )}
          style={serifStyle}
          aria-live="polite"
        >
          {PHRASES.map((item, i) => {
            if (!visibleIndices.has(i)) return null;
            const isActive = i === index;
            const isExiting = prevIndex !== null && i === prevIndex && !isActive;
            return (
            <span
              key={item.id}
              className={cn(
                'hero-headline-layer',
                isActive && 'hero-headline-layer--active',
                isExiting && 'hero-headline-layer--exit',
              )}
              aria-hidden={!isActive}
            >
              <span className="hero-headline-phrase">
                <HeadlineContent phraseId={item.id} />
              </span>
            </span>
            );
          })}
        </h1>
        <span className="sr-only">{phrase.label}</span>
      </div>
    </div>
  );
}

export { PHRASES as HERO_ROTATING_PHRASES };
