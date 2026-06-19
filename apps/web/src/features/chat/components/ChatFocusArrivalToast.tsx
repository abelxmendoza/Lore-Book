import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

import type { ChatFocus } from '../../../types/chatFocus';
import { RomanticAddCelebration } from '../../../components/love/RomanticAddCelebration';

const VISIBLE_MS = 2200;

type Props = {
  focus: ChatFocus | null;
};

export function ChatFocusArrivalToast({ focus }: Props) {
  const [showCelebration, setShowCelebration] = useState(false);
  const [genericLabel, setGenericLabel] = useState<string | null>(null);
  const lastArrivedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focus?.arrivedAt) return;
    if (lastArrivedAtRef.current === focus.arrivedAt) return;
    lastArrivedAtRef.current = focus.arrivedAt;

    const age = Date.now() - focus.arrivedAt;
    if (age > VISIBLE_MS) return;

    const label = `Now focusing on ${focus.entityName} · ${focus.sourceLabel}`;

    if (focus.sourceSurface === 'love') {
      setShowCelebration(true);
      setGenericLabel(null);
    } else {
      setShowCelebration(false);
      setGenericLabel(label);
    }

    const timer = window.setTimeout(() => {
      setShowCelebration(false);
      setGenericLabel(null);
    }, VISIBLE_MS - age);

    return () => window.clearTimeout(timer);
  }, [focus?.arrivedAt, focus?.entityId, focus?.entityName, focus?.sourceLabel, focus?.sourceSurface]);

  return (
    <>
      <RomanticAddCelebration
        active={showCelebration && focus?.sourceSurface === 'love'}
        label={
          focus
            ? `Now focusing on ${focus.entityName} · ${focus.sourceLabel}`
            : undefined
        }
        onDone={() => setShowCelebration(false)}
      />
      {genericLabel && (
        <div
          className="pointer-events-none fixed inset-x-0 top-[18%] z-[80] flex justify-center px-4"
          aria-live="polite"
          role="status"
        >
          <p className="animate-chat-focus-enter flex items-center gap-2 rounded-full border border-primary/35 bg-gray-950/90 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-primary/15 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            {genericLabel}
          </p>
        </div>
      )}
    </>
  );
}
