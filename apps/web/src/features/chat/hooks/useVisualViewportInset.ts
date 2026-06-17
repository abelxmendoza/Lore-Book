import { useEffect, useState } from 'react';

/** Bottom inset when the mobile virtual keyboard is open (iOS/Android). */
export function useVisualViewportInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const keyboardGap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(keyboardGap > 40 ? keyboardGap : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return inset;
}
