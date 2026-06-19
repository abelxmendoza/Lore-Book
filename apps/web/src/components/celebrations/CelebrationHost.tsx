import { useCallback, useEffect, useState } from 'react';
import { CELEBRATION_EVENT, type CelebrationPayload } from '../../lib/celebrations';
import { AddCelebrationOverlay } from './AddCelebrationOverlay';

type ActiveCelebration = CelebrationPayload & { id: number };

/**
 * Global celebration layer — listens for `lk:celebration` and demo effect ripples.
 */
export function CelebrationHost() {
  const [queue, setQueue] = useState<ActiveCelebration[]>([]);
  const [active, setActive] = useState<ActiveCelebration | null>(null);

  const enqueue = useCallback((payload: CelebrationPayload) => {
    setQueue((prev) => [...prev, { ...payload, id: Date.now() + Math.random() }]);
  }, []);

  useEffect(() => {
    const onCelebration = (event: Event) => {
      const detail = (event as CustomEvent<CelebrationPayload>).detail;
      if (!detail?.label || !detail.variant) return;
      enqueue(detail);
    };
    window.addEventListener(CELEBRATION_EVENT, onCelebration);
    return () => window.removeEventListener(CELEBRATION_EVENT, onCelebration);
  }, [enqueue]);

  useEffect(() => {
    if (active || queue.length === 0) return;
    setActive(queue[0]);
    setQueue((prev) => prev.slice(1));
  }, [active, queue]);

  const handleDone = useCallback(() => {
    setActive(null);
  }, []);

  if (!active) return null;

  return (
    <AddCelebrationOverlay
      key={active.id}
      variant={active.variant}
      label={active.label}
      subtitle={active.subtitle}
      xp={active.xp}
      durationMs={active.durationMs}
      onDone={handleDone}
    />
  );
}
