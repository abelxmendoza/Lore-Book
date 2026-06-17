import { useEffect, useState } from 'react';
import './LoreBookGeneratingScreen.css';

const STAGES = [
  'Gathering memories from the archive…',
  'Connecting people, places, and moments…',
  'Weaving chapters from your lore…',
  'Summoning your story from the pages…',
] as const;

export type LoreBookGeneratingScreenProps = {
  /** Optional query or book title being compiled */
  query?: string | null;
  title?: string;
  className?: string;
};

/** Full-screen loading state while a lorebook is being compiled. */
export function LoreBookGeneratingScreen({
  query,
  title = 'Generating LoreBook',
  className,
}: LoreBookGeneratingScreenProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setStageIndex((i) => (i + 1) % STAGES.length);
        setFade(true);
      }, 220);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={['lore-generating-screen', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="lorebook-generating-screen"
    >
      <div className="lore-generating-scene" aria-hidden="true">
        <div className="lore-generating-book">
          <div className="lore-generating-book-page lore-generating-book-page--left" />
          <div className="lore-generating-book-spine" />
          <div className="lore-generating-book-page lore-generating-book-page--right" />
          <div className="lore-generating-book-glow" />
        </div>

        <div className="lore-generating-mist">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>

        <div className="lore-generating-ghost-wrap">
          <div className="lore-generating-ghost">
            <div className="lore-generating-ghost-body" />
            <span className="lore-generating-ghost-eye lore-generating-ghost-eye--left" />
            <span className="lore-generating-ghost-eye lore-generating-ghost-eye--right" />
            <span className="lore-generating-ghost-mouth" />
          </div>
        </div>
      </div>

      <h2 className="lore-generating-title">{title}</h2>
      <p
        className="lore-generating-stage"
        style={{ opacity: fade ? 1 : 0 }}
      >
        {STAGES[stageIndex]}
      </p>
      {query?.trim() && (
        <p className="lore-generating-query">&ldquo;{query.trim()}&rdquo;</p>
      )}

      <div className="lore-generating-progress" aria-hidden="true">
        <div className="lore-generating-progress-bar" />
      </div>
    </div>
  );
}

/** Keep the generating screen visible long enough for the animation to read. */
export async function ensureMinGeneratingDuration(startedAt: number, minMs = 2800): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) {
    await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
  }
}
