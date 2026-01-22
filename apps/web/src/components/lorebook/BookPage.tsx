import { useEffect, useRef } from 'react';
import './bookPage.css';

export interface BookPageProps {
  content: string;
  pageNumber: number;
  totalPages: number;
  sectionTitle?: string;
  sectionPeriod?: { from: string; to?: string };
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  lineHeight: 'normal' | 'relaxed' | 'loose';
  animationDirection?: 'none' | 'next' | 'prev';
  onAnimationEnd?: () => void;
  className?: string;
}

/**
 * BookPage Component
 * Renders a single page of the book with Kindle-like styling
 */
export const BookPage = ({
  content,
  pageNumber,
  totalPages,
  sectionTitle,
  sectionPeriod,
  fontSize,
  lineHeight,
  animationDirection = 'none',
  onAnimationEnd,
  className = ''
}: BookPageProps) => {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const handleTransitionEnd = (e: TransitionEvent) => {
      // Only trigger on transform transitions
      if (e.propertyName === 'transform' && onAnimationEnd) {
        onAnimationEnd();
      }
    };

    page.addEventListener('transitionend', handleTransitionEnd);
    return () => {
      page.removeEventListener('transitionend', handleTransitionEnd);
    };
  }, [onAnimationEnd, fontSize, lineHeight, content]);

  const fontSizeClasses = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  };

  const lineHeightClasses = {
    normal: 'leading-normal',
    relaxed: 'leading-relaxed',
    loose: 'leading-loose'
  };

  const fontSizePx = {
    sm: 18,
    base: 22,
    lg: 26,
    xl: 30
  };

  const lineHeightMultiplier = {
    normal: 1.7,
    relaxed: 1.9,
    loose: 2.2
  };

  // Animation classes
  const animationClass = animationDirection === 'next' 
    ? 'page-slide-in-from-right' 
    : animationDirection === 'prev'
    ? 'page-slide-in-from-left'
    : '';

  return (
    <div
      ref={pageRef}
      className={`book-page ${animationClass} ${className}`}
      style={{
        transform: animationDirection === 'next' 
          ? 'translateX(100%)' 
          : animationDirection === 'prev'
          ? 'translateX(-100%)'
          : 'translateX(0)'
      }}
      role="article"
      aria-label={`Page ${pageNumber} of ${totalPages}`}
    >
      <div className="book-page-content">
        {/* Page Header (optional - can be hidden on mobile) */}
        {sectionTitle && (
          <header className="book-page-header">
            <h2 className="book-section-title">{sectionTitle}</h2>
            {sectionPeriod && (
              <p className="book-section-period">
                {new Date(sectionPeriod.from).toLocaleDateString()}
                {sectionPeriod.to && ` - ${new Date(sectionPeriod.to).toLocaleDateString()}`}
              </p>
            )}
          </header>
        )}

        {/* Page Content */}
        <main 
          className={`book-page-text ${fontSizeClasses[fontSize]} ${lineHeightClasses[lineHeight]}`}
          style={{
            fontSize: `${fontSizePx[fontSize]}px`,
            lineHeight: lineHeightMultiplier[lineHeight],
            textAlign: 'justify',
            textJustify: 'inter-word'
          }}
        >
          {content || (
            <span className="text-white/40 italic">This page is empty.</span>
          )}
        </main>

        {/* Page Footer with Page Number */}
        <footer className="book-page-footer">
          <span className="book-page-number" aria-label={`Page ${pageNumber} of ${totalPages}`}>
            {pageNumber} / {totalPages}
          </span>
        </footer>
      </div>
    </div>
  );
};
