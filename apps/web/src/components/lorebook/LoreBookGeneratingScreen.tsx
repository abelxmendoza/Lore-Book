import { useEffect, useState } from 'react';
import { BookGhostScene } from '../common/BookGhostScene';
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
      <BookGhostScene />

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
