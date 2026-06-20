import { useEffect, useState } from 'react';

/** Tracks visual viewport height — accounts for mobile software keyboard. */
export function useVisualViewportSize(enabled = true): { height: number; width: number } {
  const [size, setSize] = useState(() => ({
    height: typeof window !== 'undefined'
      ? window.visualViewport?.height ?? window.innerHeight
      : 0,
    width: typeof window !== 'undefined'
      ? window.visualViewport?.width ?? window.innerWidth
      : 0,
  }));

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setSize({ height: vv.height, width: vv.width });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return size;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function getComposerStats(text: string) {
  return {
    chars: text.length,
    words: countWords(text),
    paragraphs: text.trim() ? text.split(/\n\s*\n/).filter((p) => p.trim()).length : 0,
  };
}
