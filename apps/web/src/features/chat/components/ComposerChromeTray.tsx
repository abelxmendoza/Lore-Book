import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type ComposerChromeTrayProps = {
  children: ReactNode;
  defaultCollapsed?: boolean;
  label?: string;
  /** Extra collapsed-header hint, e.g. "4 sources". */
  meta?: string;
  /** When this value changes to a non-empty string, open the tray (new answer sources). */
  expandSignal?: string;
};

/**
 * Collapses the chip / focus / sources chrome that sits on top of the
 * composer so it does not eat the message list — especially on mobile.
 */
export function ComposerChromeTray({
  children,
  defaultCollapsed = false,
  label = 'Chat context',
  meta,
  expandSignal,
}: ComposerChromeTrayProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasContent, setHasContent] = useState(false);

  useLayoutEffect(() => {
    setHasContent((contentRef.current?.childElementCount ?? 0) > 0);
  });

  useEffect(() => {
    if (!expandSignal) return;
    setCollapsed(false);
  }, [expandSignal]);

  return (
    <div
      data-testid="composer-chrome-tray"
      data-collapsed={hasContent ? collapsed : undefined}
      className={hasContent ? 'flex-shrink-0 border-t border-white/8 bg-black/40' : undefined}
    >
      {hasContent && (
        <button
          type="button"
          data-testid="composer-chrome-toggle"
          aria-expanded={!collapsed}
          aria-controls="composer-chrome-tray-content"
          onClick={() => setCollapsed((value) => !value)}
          className="flex min-h-8 w-full items-center gap-1.5 px-3 py-1.5 text-left text-[10px] uppercase tracking-wide text-white/40 touch-manipulation hover:bg-white/[0.03] hover:text-white/65 sm:px-4"
        >
          {label}
          {meta && (
            <span className="normal-case tracking-normal text-white/35">· {meta}</span>
          )}
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {collapsed && (
            <span className="normal-case tracking-normal text-white/30">Show</span>
          )}
        </button>
      )}
      <div
        id="composer-chrome-tray-content"
        ref={contentRef}
        hidden={hasContent && collapsed}
        className={hasContent && collapsed ? 'hidden' : 'max-h-[45vh] overflow-y-auto sm:max-h-none'}
      >
        {children}
      </div>
    </div>
  );
}
