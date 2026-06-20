/**
 * Bridges async LoreBook ingest parse back to the chat long-poll endpoint.
 * In-process only; TTL cache evicts stale entries.
 */

import { EventEmitter } from 'events';
import type { LoreBookNoticeEvent } from './loreBookNoticeTypes';

class LoreBookNoticeBus extends EventEmitter {
  private readonly cache = new Map<string, { data: LoreBookNoticeEvent; expiresAt: number }>();
  private readonly TTL_MS = 5 * 60 * 1000;

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  publish(chatMessageId: string, data: LoreBookNoticeEvent): void {
    this.cache.set(chatMessageId, { data, expiresAt: Date.now() + this.TTL_MS });
    this.emit(`notice:${chatMessageId}`, data);
  }

  get(chatMessageId: string): LoreBookNoticeEvent | null {
    const entry = this.cache.get(chatMessageId);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(chatMessageId);
      return null;
    }
    return entry.data;
  }

  waitFor(chatMessageId: string, timeoutMs = 8000): Promise<LoreBookNoticeEvent | null> {
    const cached = this.get(chatMessageId);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve) => {
      const eventKey = `notice:${chatMessageId}`;
      const timer = setTimeout(() => {
        this.off(eventKey, handler);
        resolve(null);
      }, timeoutMs);

      const handler = (data: LoreBookNoticeEvent) => {
        clearTimeout(timer);
        resolve(data);
      };

      this.once(eventKey, handler);
    });
  }

  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) this.cache.delete(key);
    }
  }
}

export const loreBookNoticeBus = new LoreBookNoticeBus();

setInterval(() => loreBookNoticeBus.evictExpired(), 10 * 60 * 1000).unref();
