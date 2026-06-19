import {
  DEMO_LOREBOOKS,
  type DemoLorebook,
  type DemoLorebookCatalogEntry,
  type DemoLoreChapter,
  type DemoMemoirOutline,
  type DemoMemoirSection,
} from '../../mocks/lorebooks';
import type { CompiledBookDraft, StoryMemoryState, StoryDomain } from './types';

const FORGE_BOOK_CACHE = new Map<string, DemoLorebook>();

const DOMAIN_STYLE: Record<
  StoryDomain,
  { gradient: string; accent: string; border: string; scope: string }
> = {
  romance: {
    gradient: 'from-rose-700 via-pink-800 to-rose-900',
    accent: 'text-rose-300',
    border: 'border-rose-600/40',
    scope: 'Love & intimacy',
  },
  relationships: {
    gradient: 'from-violet-700 via-purple-800 to-violet-900',
    accent: 'text-violet-300',
    border: 'border-violet-600/40',
    scope: 'People & bonds',
  },
  family: {
    gradient: 'from-amber-700 via-orange-800 to-amber-900',
    accent: 'text-amber-300',
    border: 'border-amber-600/40',
    scope: 'Family',
  },
  career: {
    gradient: 'from-blue-700 via-cyan-800 to-blue-900',
    accent: 'text-sky-300',
    border: 'border-sky-600/40',
    scope: 'Career',
  },
  health: {
    gradient: 'from-emerald-700 via-teal-800 to-emerald-900',
    accent: 'text-emerald-300',
    border: 'border-emerald-600/40',
    scope: 'Health',
  },
  creative: {
    gradient: 'from-indigo-700 via-violet-800 to-indigo-900',
    accent: 'text-indigo-300',
    border: 'border-indigo-600/40',
    scope: 'Creative',
  },
  social: {
    gradient: 'from-emerald-600 via-green-800 to-emerald-900',
    accent: 'text-emerald-300',
    border: 'border-emerald-600/40',
    scope: 'Community',
  },
  place: {
    gradient: 'from-teal-700 via-cyan-800 to-teal-900',
    accent: 'text-cyan-300',
    border: 'border-cyan-600/40',
    scope: 'Places',
  },
  identity: {
    gradient: 'from-fuchsia-700 via-purple-800 to-fuchsia-900',
    accent: 'text-fuchsia-300',
    border: 'border-fuchsia-600/40',
    scope: 'Identity',
  },
};

const DEFAULT_STYLE = {
  gradient: 'from-purple-700 via-indigo-800 to-purple-900',
  accent: 'text-purple-300',
  border: 'border-purple-600/40',
  scope: 'Life story',
};

function chapterStyle(domain?: StoryDomain) {
  return (domain && DOMAIN_STYLE[domain]) || DEFAULT_STYLE;
}

function atomsForChapter(
  memory: StoryMemoryState,
  atomIds: string[]
): string {
  return memory.atoms
    .filter((a) => atomIds.includes(a.id))
    .map((a) => a.content)
    .join('\n\n');
}

export type ForgeBookMeta = {
  lorebookVersion?: number;
  edition?: 'main' | 'safe' | 'explicit' | 'private';
  lorebookName?: string;
};

function editionLabel(edition?: ForgeBookMeta['edition']): string {
  if (!edition || edition === 'main') return 'Main edition';
  return `${edition.charAt(0).toUpperCase()}${edition.slice(1)} edition`;
}

/** Turn a compiled forge draft + memory into a readable demo lorebook. */
export function compiledBookToDemoLorebook(
  book: CompiledBookDraft,
  memory: StoryMemoryState,
  meta: ForgeBookMeta = {}
): DemoLorebook {
  const primaryDomain = book.chapters[0]?.domain;
  const style = chapterStyle(primaryDomain);
  const versionLabel = meta.lorebookVersion ? ` · v${meta.lorebookVersion}` : '';
  const editionSuffix = meta.edition && meta.edition !== 'main' ? ` (${meta.edition})` : '';

  const sections: DemoMemoirSection[] = book.chapters.map((ch, index) => {
    const chStyle = chapterStyle(ch.domain);
    const body = atomsForChapter(memory, ch.atomIds);
    return {
      id: `${book.id}-sec-${ch.id}`,
      title: ch.title,
      content: body || ch.summary,
      order: index,
      focus: chStyle.scope,
      period: {
        from: memory.startedAt.slice(0, 10),
        to: memory.updatedAt.slice(0, 10),
      },
    };
  });

  const outline: DemoMemoirOutline = {
    id: book.id,
    title: `${book.title}${editionSuffix}${versionLabel}`,
    sections,
    lastUpdated: book.latestVersion.compiledAt,
    autoUpdate: false,
    metadata: {
      languageStyle: 'compiled from chat',
      originalDocument: true,
    },
  };

  const loreChapters: DemoLoreChapter[] = book.chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    start_date: memory.startedAt,
    end_date: memory.updatedAt,
    description: ch.summary,
    summary: ch.summary,
  }));

  const wordEstimate = sections.reduce(
    (sum, s) => sum + s.content.split(/\s+/).filter(Boolean).length,
    0
  );

  return {
    id: book.id,
    title: book.title,
    scope: meta.lorebookName ?? style.scope,
    period: `${book.latestVersion.sourceTurns} chats · ${editionLabel(meta.edition)}${versionLabel}`,
    chapters: book.chapters.length,
    pages: Math.max(1, Math.ceil(wordEstimate / 280)),
    gradient: style.gradient,
    accent: style.accent,
    border: style.border,
    lastRead: 'Compiled from your chats',
    outline,
    loreChapters,
  };
}

export function registerForgeDemoBooks(books: DemoLorebook[]): void {
  FORGE_BOOK_CACHE.clear();
  for (const book of books) {
    FORGE_BOOK_CACHE.set(book.id, book);
  }
}

export function setForgeDemoBook(book: DemoLorebook): void {
  FORGE_BOOK_CACHE.set(book.id, book);
}

export function getAllForgeDemoBooks(): DemoLorebook[] {
  return [...FORGE_BOOK_CACHE.values()];
}

export function getForgeDemoBookById(bookId: string): DemoLorebook | undefined {
  return FORGE_BOOK_CACHE.get(bookId);
}

/** Static Marrowvale demos + forge-generated books in the read cache. */
export function resolveDemoLorebookById(bookId: string): DemoLorebook | undefined {
  return FORGE_BOOK_CACHE.get(bookId) ?? DEMO_LOREBOOKS.find((book) => book.id === bookId);
}

export function forgeBooksToCatalog(books: DemoLorebook[]): DemoLorebookCatalogEntry[] {
  return books.map(({ outline: _o, loreChapters: _c, ...catalog }) => catalog);
}

/** Filter atom content for safe/explicit/private demo editions. */
export function filterBookEdition(
  book: CompiledBookDraft,
  memory: StoryMemoryState,
  edition: 'safe' | 'explicit' | 'private'
): CompiledBookDraft {
  const filteredAtoms = new Set(
    memory.atoms
      .filter((atom) => {
        const lower = atom.content.toLowerCase();
        if (edition === 'safe') {
          return !/\b(breakup|grief|cried|stress|burnout|relieved|sad)\b/.test(lower);
        }
        if (edition === 'explicit') {
          return true;
        }
        return true;
      })
      .map((a) => a.id)
  );

  const chapters = book.chapters
    .map((ch) => ({
      ...ch,
      atomIds: ch.atomIds.filter((id) => filteredAtoms.has(id)),
    }))
    .filter((ch) => ch.atomIds.length > 0);

  return {
    ...book,
    id: `${book.id}-${edition}`,
    title: `${book.title} (${edition})`,
    subtitle: `${edition} edition · compiled from chat`,
    chapters,
  };
}
