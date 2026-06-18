import { BookGhostScene } from './BookGhostScene';
import './BookGhostLoader.css';

export type BookGhostLoaderProps = {
  /** Primary line under the animation. */
  caption?: string;
  /** Optional secondary line (e.g. a hint or detail). */
  subtext?: string;
  /** Full-viewport loader with the dark themed background (page-level loading). */
  fullScreen?: boolean;
  className?: string;
  'data-testid'?: string;
};

/**
 * Generic loading state built on the shared {@link BookGhostScene} animation.
 *
 * - `fullScreen` → page-level loader (reuses the themed `.lore-generating-screen`
 *   background); use this for auth/session/route-level waits.
 * - default → compact inline loader for cards and panels.
 */
export function BookGhostLoader({
  caption,
  subtext,
  fullScreen = false,
  className,
  'data-testid': testId = 'book-ghost-loader',
}: BookGhostLoaderProps) {
  if (fullScreen) {
    return (
      <div
        className={['lore-generating-screen', className].filter(Boolean).join(' ')}
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid={testId}
      >
        <BookGhostScene />
        {caption && <p className="lore-generating-stage book-ghost-loader__caption">{caption}</p>}
        {subtext && <p className="lore-generating-query">{subtext}</p>}
      </div>
    );
  }

  return (
    <div
      className={['book-ghost-loader', 'book-ghost-loader--inline', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid={testId}
    >
      <div className="book-ghost-loader__scene-clip">
        <BookGhostScene />
      </div>
      {caption && <p className="book-ghost-loader__caption">{caption}</p>}
      {subtext && <p className="book-ghost-loader__subtext">{subtext}</p>}
    </div>
  );
}
