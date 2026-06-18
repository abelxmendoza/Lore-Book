import '../lorebook/LoreBookGeneratingScreen.css';

export type BookGhostSceneProps = {
  className?: string;
};

/**
 * The shared "ghost rising from an open book" animation (book + mist + ghost).
 *
 * Pure visual — no text, no layout chrome — so it can be dropped into the
 * welcome splash, the lorebook generating screen, and any other loading state.
 * Styling lives in LoreBookGeneratingScreen.css alongside the original screen.
 */
export function BookGhostScene({ className }: BookGhostSceneProps) {
  return (
    <div
      className={['lore-generating-scene', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
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
  );
}
