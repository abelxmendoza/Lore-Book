import { describe, expect, it } from 'vitest';

import {
  entriesFromCommits,
  isSkippableCommit,
  mergeWhatsNewFeeds,
  themeForCommit,
} from './whatsNewFromCommits';

describe('whatsNewFromCommits', () => {
  it('skips engineering-only commits', () => {
    expect(isSkippableCommit('Merge remote-tracking branch origin/main')).toBe(true);
    expect(isSkippableCommit('Patch transitive nanoid advisory')).toBe(true);
    expect(isSkippableCommit('Rename entityResolutionCore.skip.test.ts to remove misleading vitest naming collision')).toBe(true);
    expect(isSkippableCommit('Show Calendar next to Swimlanes on the Omni Timeline')).toBe(false);
  });

  it('rewrites shipped work into product language instead of commit subjects', () => {
    const entries = entriesFromCommits([
      { date: '2026-08-20', subject: 'Show Calendar next to Swimlanes on the Omni Timeline' },
      { date: '2026-08-20', subject: 'Fix relative-date queries silently resolving in server UTC instead of the user\'s timezone' },
      { date: '2026-08-18', subject: 'Fix chat replies that never finish: orphaned streaming rows + autoSubmit race' },
      { date: '2026-08-16', subject: 'Patch web dependency advisories' },
    ]);
    expect(entries.map((entry) => entry.theme)).toEqual(['calendar', 'time', 'chat']);
    expect(entries.some((entry) => /Omni Timeline|autoSubmit|advisory/i.test(entry.title + entry.summary))).toBe(false);
    expect(entries[0]?.title).toBe('Your life, on a real calendar');
  });

  it('does not duplicate a theme already covered by curated copy', () => {
    const fromGit = entriesFromCommits([
      { date: '2026-08-21', subject: 'Show Calendar next to Swimlanes on the Omni Timeline' },
      { date: '2026-08-19', subject: 'Lock the mobile sidebar to vertical scrolling' },
    ]);
    const merged = mergeWhatsNewFeeds(
      [{ id: 'curated-cal', date: '2026-08-20', theme: 'calendar', title: 'Your life, on a real calendar', summary: 'Curated.' }],
      fromGit,
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe('curated-cal');
    expect(merged[1]?.theme).toBe('mobile');
    expect(themeForCommit('Lock the mobile sidebar to vertical scrolling')?.theme).toBe('mobile');
  });
});
