import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildNoticeEvent,
  noticeKey,
  publishLoreBookNotice,
  selectNoticeItems,
  LOREBOOK_NOTICE_MIN_CONFIDENCE,
} from '../../../src/services/lorebook/parser/loreBookNoticeService';
import { loreBookNoticeBus } from '../../../src/services/lorebook/parser/loreBookNoticeBus';

describe('loreBookNoticeService', () => {
  beforeEach(() => {
    loreBookNoticeBus.evictExpired();
  });

  describe('selectNoticeItems', () => {
    it('dedupes by domain+name and filters low confidence', () => {
      const items = selectNoticeItems([
        { domain: 'quests', name: 'Ship beta', confidence: 0.9 },
        { domain: 'quests', name: 'ship beta', confidence: 0.85 },
        { domain: 'skills', name: 'Robotics', confidence: 0.5 },
        { domain: 'characters', name: 'Oscar Martinez', confidence: LOREBOOK_NOTICE_MIN_CONFIDENCE },
      ]);

      expect(items).toHaveLength(2);
      expect(items.map((i) => i.name)).toEqual(['Ship beta', 'Oscar Martinez']);
    });

    it('returns empty when all items below threshold', () => {
      const items = selectNoticeItems([
        { domain: 'quests', name: 'Maybe quest', confidence: 0.4 },
      ]);
      expect(items).toEqual([]);
    });

    it('skips blank names', () => {
      const items = selectNoticeItems([
        { domain: 'quests', name: '   ', confidence: 0.9 },
      ]);
      expect(items).toEqual([]);
    });
  });

  describe('noticeKey', () => {
    it('normalizes case and whitespace', () => {
      expect(noticeKey({ domain: 'characters', name: '  Oscar Martinez  ' })).toBe(
        'characters:oscar martinez'
      );
    });
  });

  describe('buildNoticeEvent', () => {
    it('returns null when no qualifying items', () => {
      expect(
        buildNoticeEvent('msg-1', 'user-1', [
          { domain: 'quests', name: 'Weak', confidence: 0.2 },
        ])
      ).toBeNull();
    });

    it('builds event with filtered items', () => {
      const event = buildNoticeEvent('msg-1', 'user-1', [
        { domain: 'quests', name: 'Ship beta', confidence: 0.88 },
      ]);
      expect(event).toMatchObject({
        chatMessageId: 'msg-1',
        userId: 'user-1',
        items: [{ name: 'Ship beta', domain: 'quests' }],
      });
      expect(event?.timestamp).toBeTruthy();
    });
  });

  describe('publishLoreBookNotice', () => {
    it('publishes to bus and returns event', () => {
      const event = publishLoreBookNotice('chat-msg-1', 'user-1', [
        { domain: 'skills', name: 'Robotics', confidence: 0.75 },
      ]);
      expect(event).not.toBeNull();
      expect(loreBookNoticeBus.get('chat-msg-1')).toEqual(event);
    });

    it('does not publish when nothing qualifies', () => {
      const event = publishLoreBookNotice('chat-msg-2', 'user-1', [
        { domain: 'skills', name: 'Robotics', confidence: 0.3 },
      ]);
      expect(event).toBeNull();
      expect(loreBookNoticeBus.get('chat-msg-2')).toBeNull();
    });
  });
});
