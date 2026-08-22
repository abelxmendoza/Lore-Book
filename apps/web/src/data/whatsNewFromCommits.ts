import type { WhatsNewEntry } from './whatsNewTypes';

export type GitCommitRef = {
  date: string;
  subject: string;
};

type ProductTheme = {
  theme: string;
  match: RegExp;
  title: string;
  summary: string;
};

const SKIP_COMMIT =
  /^(merge |wip\b|chore:|test:|ci:|docs:)/i;

const SKIP_SUBJECT =
  /dependabot|advisory|nanoid|peer.?dep|vitest|skip\.test|rls policy|redact leaked|founder|fixture|pgrst|eslint|prettier|husky|lockfile|npm warn/i;

/**
 * Maps engineering commit subjects onto product language.
 * Commit text never appears in the UI — only these titles/summaries do.
 */
export const PRODUCT_THEMES: ProductTheme[] = [
  {
    theme: 'calendar',
    match: /\bcalendar\b|omni timeline|swimlane/i,
    title: 'Your life, on a real calendar',
    summary:
      'The timeline now sits beside a calendar, so years of memory read like a life — not a stack of chats.',
  },
  {
    theme: 'time',
    match: /timezone|relative-date|chronolog|temporal|when it happened|timeline history/i,
    title: 'Time means when it happened',
    summary:
      '“Last week” is your week, in your timezone. History shows when a moment occurred — not when it was typed.',
  },
  {
    theme: 'people',
    match: /character title|family tree|relationship-to-you|kinship|character modal|cast trend/i,
    title: 'People, as they actually are to you',
    summary:
      'Names, titles, and family ties stay consistent across Character pages, Family Tree, and chat — including how they change.',
  },
  {
    theme: 'story',
    match: /story.?thread|topic shift|entity timeline|rag retrieval|org\/location|organization\/group/i,
    title: 'Chat that stays with the story',
    summary:
      'Change the subject and LoreBook follows. People, places, and groups keep their own timelines instead of collapsing into one thread.',
  },
  {
    theme: 'chat',
    match: /chat repl|streaming|autoSubmit|chat sidebar|cross-device|empty-response|conversation_sessions/i,
    title: 'Replies that finish',
    summary:
      'Conversations no longer vanish mid-thought. Chat stays in sync across devices, and the thread you left is the one you return to.',
  },
  {
    theme: 'mobile',
    match: /mobile sidebar|vertical scroll/i,
    title: 'Built for the phone in your hand',
    summary: 'The sidebar stays with you on a phone — scroll the story, not the whole screen sideways.',
  },
  {
    theme: 'books',
    match: /vignette|chapter|lorebook tier|editor-default|anchor timeline|per-Book "Ask"|Ask query/i,
    title: 'One place to ask, one place to remember',
    summary: 'Books, chapters, and the Editor feel like LoreBook — and you ask from the main conversation, not scattered side panels.',
  },
];

export function isSkippableCommit(subject: string): boolean {
  const text = subject.trim();
  return SKIP_COMMIT.test(text) || SKIP_SUBJECT.test(text);
}

export function themeForCommit(subject: string): ProductTheme | null {
  if (isSkippableCommit(subject)) return null;
  return PRODUCT_THEMES.find((theme) => theme.match.test(subject)) ?? null;
}

export function entriesFromCommits(
  commits: GitCommitRef[],
  limit = 6,
): WhatsNewEntry[] {
  const seen = new Set<string>();
  const entries: WhatsNewEntry[] = [];
  for (const commit of commits) {
    const theme = themeForCommit(commit.subject);
    if (!theme || seen.has(theme.theme)) continue;
    seen.add(theme.theme);
    entries.push({
      id: `git-${theme.theme}-${commit.date}`,
      date: commit.date,
      title: theme.title,
      summary: theme.summary,
      theme: theme.theme,
    });
    if (entries.length >= limit) break;
  }
  return entries;
}

export function mergeWhatsNewFeeds(
  curated: WhatsNewEntry[],
  fromGit: WhatsNewEntry[],
  limit = 6,
): WhatsNewEntry[] {
  const usedThemes = new Set(
    curated.map((entry) => entry.theme).filter((theme): theme is string => Boolean(theme)),
  );
  const extras = fromGit.filter((entry) => !entry.theme || !usedThemes.has(entry.theme));
  return [...curated, ...extras].slice(0, limit);
}

export function whatsNewDigest(entries: WhatsNewEntry[]): string {
  return entries.map((entry) => entry.id).join('+');
}
