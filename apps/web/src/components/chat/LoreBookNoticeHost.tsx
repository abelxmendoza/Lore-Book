import { useCallback, useRef } from 'react';
import { useToast } from '../ui/toast';
import {
  evaluateLoreBookNoticeGate,
  loadLoreBookNoticeGateState,
  saveLoreBookNoticeGateState,
  type LoreBookNoticeGateState,
} from '../../lib/loreBookNoticePolicy';
import { useLoreBookNoticeSubscription } from '../../lib/loreBookNoticeClient';
import type { LoreBookNoticeEvent } from '../../lib/loreBookNoticeTypes';

/**
 * Single chat-scoped toast host for LoreBook ingest notices.
 * Throttled and deduped per browser session — max 2 toasts per 10 minutes.
 */
export function LoreBookNoticeHost() {
  const toast = useToast({ maxVisible: 1 });
  const gateRef = useRef<LoreBookNoticeGateState>(loadLoreBookNoticeGateState());

  const handleNotice = useCallback(
    (notice: LoreBookNoticeEvent) => {
      const result = evaluateLoreBookNoticeGate(notice, gateRef.current);
      gateRef.current = result.nextState;
      saveLoreBookNoticeGateState(result.nextState);

      if (!result.shouldShow || !result.message) return;

      toast.info(result.message, 6000);
    },
    [toast]
  );

  useLoreBookNoticeSubscription(handleNotice);

  return <toast.ToastContainer placement="demo" />;
}
