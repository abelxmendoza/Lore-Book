import { useCallback, useState } from 'react';
import { BookMarked } from 'lucide-react';
import './HeroLogo.css';

/** Primary asset first; fall back through alternates then bundled SVG. */
export const HERO_LOGO_SOURCES = [
  '/images/LoreBookLogo.jpg',
  '/images/LoreBookLogo2.jpg',
  '/images/logo.svg',
] as const;

type HeroLogoProps = {
  variant?: 'hero' | 'compact';
};

type LogoLoadState = 'loading' | 'ready' | 'fallback';

function useHeroLogoImage() {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loadState, setLoadState] = useState<LogoLoadState>('loading');

  const src = HERO_LOGO_SOURCES[sourceIndex] ?? null;
  const canRetry = sourceIndex < HERO_LOGO_SOURCES.length - 1;

  const handleLoad = useCallback(() => {
    setLoadState('ready');
  }, []);

  const handleError = useCallback(() => {
    if (canRetry) {
      setSourceIndex((index) => index + 1);
      setLoadState('loading');
      return;
    }
    setLoadState('fallback');
  }, [canRetry]);

  return { src, loadState, handleLoad, handleError };
}

function HeroLogoFallback({ variant }: { variant: 'hero' | 'compact' }) {
  return (
    <div
      className={`hero-logo-shell hero-logo-shell--fallback ${variant === 'compact' ? 'hero-logo-shell--compact' : ''}`}
      role="img"
      aria-label="LoreBook"
    >
      <div className="hero-logo-halo" aria-hidden />
      <div className="hero-logo-ring" aria-hidden />
      <div className="hero-logo-fallback-content">
        <BookMarked className="hero-logo-fallback-icon" aria-hidden />
        <span className="hero-logo-fallback-text">LoreBook</span>
      </div>
    </div>
  );
}

const SMOKE_WISPS = [1, 2, 3, 4, 5, 6] as const;
const BOTTOM_FLAMES = [1, 2, 3] as const;
const TOP_FLAMES = [1, 2, 3] as const;
const LEFT_FLAMES = [1, 2] as const;
const RIGHT_FLAMES = [1, 2] as const;

function HeroLogoEffects() {
  return (
    <div className="hero-logo-fx" aria-hidden>
      <div className="hero-logo-spectral">
        <div className="hero-logo-smoke">
          {SMOKE_WISPS.map((n) => (
            <span key={n} className={`hero-logo-smoke-wisp hero-logo-smoke-wisp--${n}`} />
          ))}
        </div>
        <div className="hero-logo-flames">
          {BOTTOM_FLAMES.map((n) => (
            <span key={`b${n}`} className={`hero-logo-flame hero-logo-flame--bottom hero-logo-flame--b${n}`} />
          ))}
          {TOP_FLAMES.map((n) => (
            <span key={`t${n}`} className={`hero-logo-flame hero-logo-flame--top hero-logo-flame--t${n}`} />
          ))}
          {LEFT_FLAMES.map((n) => (
            <span key={`l${n}`} className={`hero-logo-flame hero-logo-flame--left hero-logo-flame--l${n}`} />
          ))}
          {RIGHT_FLAMES.map((n) => (
            <span key={`r${n}`} className={`hero-logo-flame hero-logo-flame--right hero-logo-flame--r${n}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeroLogo({ variant = 'hero' }: HeroLogoProps) {
  const { src, loadState, handleLoad, handleError } = useHeroLogoImage();

  return (
    <div
      className={`hero-logo-frame ${variant === 'compact' ? 'hero-logo-frame--compact' : 'hero-logo-frame--hero'}`}
      data-testid="hero-logo"
      data-logo-state={loadState}
    >
      <div className="hero-logo-stage">
        <HeroLogoEffects />

        {loadState === 'fallback' || !src ? (
          <HeroLogoFallback variant={variant} />
        ) : (
          <div
            className={`hero-logo-shell ${variant === 'compact' ? 'hero-logo-shell--compact' : ''} ${loadState === 'loading' ? 'hero-logo-shell--loading' : ''}`}
          >
            <div className="hero-logo-halo" aria-hidden />
            <div className="hero-logo-ring" aria-hidden />
            <img
              key={src}
              src={src}
              alt="LoreBook"
              className="hero-logo-image"
              width={320}
              height={320}
              decoding="async"
              onLoad={handleLoad}
              onError={handleError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
