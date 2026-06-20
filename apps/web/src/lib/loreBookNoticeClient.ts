import { useCallback, useEffect, useRef } from 'react';
import { config } from '../config/env';
import type { LoreBookNoticeEvent } from './loreBookNoticeTypes';

export async function pollLoreBookNotice(
  messageId: string,
  token: string | undefined,
  onNotice: (notice: LoreBookNoticeEvent) => void
): Promise<void> {
  const apiUrl = config.api.url;
  const url = apiUrl
    ? `${apiUrl}/api/chat/lorebook-notice/${messageId}`
    : `/api/chat/lorebook-notice/${messageId}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 200) {
        const notice: LoreBookNoticeEvent = await res.json();
        if (notice.items?.length > 0) {
          onNotice(notice);
        }
        return;
      }
    } catch {
      return;
    }
  }
}

type LoreBookNoticeListener = (notice: LoreBookNoticeEvent) => void;

const listeners = new Set<LoreBookNoticeListener>();

export function subscribeLoreBookNotice(listener: LoreBookNoticeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dispatchLoreBookNotice(notice: LoreBookNoticeEvent): void {
  for (const listener of listeners) {
    listener(notice);
  }
}

/** Hook for components that receive notices from chat polling. */
export function useLoreBookNoticeDispatch() {
  const dispatch = useCallback((notice: LoreBookNoticeEvent) => {
    dispatchLoreBookNotice(notice);
  }, []);
  return dispatch;
}

export function useLoreBookNoticeSubscription(onNotice: LoreBookNoticeListener) {
  const handlerRef = useRef(onNotice);
  handlerRef.current = onNotice;

  useEffect(() => {
    return subscribeLoreBookNotice((notice) => handlerRef.current(notice));
  }, []);
}
