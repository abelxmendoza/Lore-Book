/**
 * Builds accurate, deduped LoreBook notices from ingest parse results.
 * O(n) over applied items; publishes only when qualifying items exist.
 */

import { loreBookNoticeBus } from './loreBookNoticeBus';
import type { LoreBookAppliedItem, LoreBookNoticeEvent } from './loreBookNoticeTypes';

/** Minimum confidence to surface a live-chat notice (conservative). */
export const LOREBOOK_NOTICE_MIN_CONFIDENCE = 0.68;

export function noticeKey(item: Pick<LoreBookAppliedItem, 'domain' | 'name'>): string {
  return `${item.domain}:${item.name.trim().toLowerCase()}`;
}

/**
 * Filter applied items to those worthy of user notification.
 * Single pass O(n); dedupes by domain+name.
 */
export function selectNoticeItems(
  appliedItems: LoreBookAppliedItem[],
  minConfidence = LOREBOOK_NOTICE_MIN_CONFIDENCE
): LoreBookAppliedItem[] {
  const seen = new Set<string>();
  const out: LoreBookAppliedItem[] = [];

  for (const item of appliedItems) {
    const name = item.name.trim();
    if (!name || item.confidence < minConfidence) continue;
    const key = noticeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ domain: item.domain, name, confidence: item.confidence });
  }

  return out;
}

/** Map successful suggest_add ops to applied items (for notice building). */
export function buildNoticeEvent(
  chatMessageId: string,
  userId: string,
  items: LoreBookAppliedItem[]
): LoreBookNoticeEvent | null {
  const selected = selectNoticeItems(items);
  if (selected.length === 0) return null;
  return {
    chatMessageId,
    userId,
    timestamp: new Date().toISOString(),
    items: selected,
  };
}

export function publishLoreBookNotice(
  chatMessageId: string,
  userId: string,
  items: LoreBookAppliedItem[]
): LoreBookNoticeEvent | null {
  const event = buildNoticeEvent(chatMessageId, userId, items);
  if (!event) return null;
  loreBookNoticeBus.publish(chatMessageId, event);
  return event;
}
