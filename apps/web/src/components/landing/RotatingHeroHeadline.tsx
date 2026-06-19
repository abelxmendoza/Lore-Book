import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import './RotatingHeroHeadline.css';

const PHRASES = [
  { id: 'remembers', label: 'It Remembers.' },
  { id: 'noted', label: 'Noted.' },
  { id: 'learns', label: 'The AI that learns who you are' },
  { id: 'autobiographer', label: 'The AutoBiographer AI' },
] as const;

const ROTATE_MS = 4200;

const serifStyle = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

function HeadlineContent({ phraseId }: { phraseId: (typeof PHRASES)[number]['id'] }) {
  if (phraseId === 'remembers') {
    return (
      <>
        <span className="text-white/95">It </span>
        <span className="relative inline-block">
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
      <span className="bg-gradient-to-r from-white via-purple-100 to-pink-100 bg-clip-text text-transparent">
        The AI that learns who you are
      </span>
    );
  }

  return (
    <>
      <span className="text-white/90">The </span>
      <span className="relative inline-block">
        <span
          className="absolute -inset-x-3 -inset-y-2 bg-gradient-to-r from-purple-500/35 via-pink-500/30 to-violet-500/35 blur-2xl rounded-full pointer-events-none hero-headline-glow"
          aria-hidden
        />
        <span className="relative bg-gradient-to-r from-purple-200 via-pink-200 to-violet-300 bg-clip-text text-transparent">
          AutoBiographer
        </span>
      </span>
      <span className="text-white/90"> AI</span>
    </>
  );
}

function sizeClassForPhrase(phraseId: (typeof PHRASES)[number]['id']) {
  switch (phraseId) {
    case 'remembers':
    case 'noted':
      return 'text-[1.875rem] leading-[1.1] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl max-w-[11ch] sm:max-w-none mx-auto md:mx-0';
    case 'learns':
      return 'text-xl leading-[1.15] sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl max-w-[18ch] sm:max-w-none mx-auto md:mx-0';
    case 'autobiographer':
      return 'text-lg leading-[1.15] sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl max-w-[16ch] sm:max-w-none mx-auto md:mx-0';
    default:
      return '';
  }
}

type RotatingHeroHeadlineProps = {
  className?: string;
};

export function RotatingHeroHeadline({ className }: RotatingHeroHeadlineProps) {
  const [index, setIndex] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const phrase = PHRASES[index];

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % PHRASES.length);
      setFlashKey((key) => key + 1);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className={cn('relative w-full text-center md:text-left', className)}
      data-testid="hero-rotating-headline"
    >
      <div className="relative flex items-center justify-center md:justify-start min-h-[2.5rem] sm:min-h-[4.5rem] md:min-h-[5.5rem] lg:min-h-[6rem]">
        <span
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 sm:h-20 bg-[radial-gradient(ellipse_at_center,rgba(154,77,255,0.12),transparent_70%)]"
          aria-hidden
        />
        <h1
          key={`${phrase.id}-${flashKey}`}
          className={cn(
            'hero-headline-enter relative leading-[1.08] font-bold text-white px-0.5',
            sizeClassForPhrase(phrase.id),
          )}
          style={serifStyle}
          aria-live="polite"
        >
          <HeadlineContent phraseId={phrase.id} />
        </h1>
      </div>

      <div className="flex items-center justify-center md:justify-start gap-2 mt-2 sm:mt-3" aria-hidden>
        {PHRASES.map((item, i) => (
          <span
            key={item.id}
            className={cn(
              'h-1 rounded-full transition-all duration-500',
              i === index
                ? 'w-7 bg-gradient-to-r from-purple-400 to-pink-400 shadow-[0_0_12px_rgba(168,85,247,0.45)]'
                : 'w-1.5 bg-white/15',
            )}
          />
        ))}
      </div>
    </div>
  );
}

export { PHRASES as HERO_ROTATING_PHRASES };
