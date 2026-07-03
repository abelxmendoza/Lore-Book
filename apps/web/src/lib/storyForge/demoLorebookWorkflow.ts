import type { CompiledLorebook } from '../../hooks/useLoreReadiness';
import type { LoreReadinessCompiledMode, LoreReadinessKnowledgePreset } from '../../mocks/loreReadiness';
import { DEMO_LOREBOOKS, getDemoLorebookById, type DemoLorebook } from '../../mocks/lorebooks';
import { computeLoreReadiness, type LoreTopicId } from '../loreReadiness';
import { runForgeForPreset } from './forgeReadinessBridge';
import {
  compiledBookToDemoLorebook,
  getForgeDemoBookById,
  registerForgeDemoBooks,
  setForgeDemoBook,
} from './forgeDemoLibrary';
import type { CompiledBookDraft } from './types';

export type DemoCompileInput = {
  query?: string;
  topicId?: LoreTopicId;
  preset: LoreReadinessKnowledgePreset;
};

export type DemoCompileResult =
  | { ok: true; bookId: string; compiled: CompiledLorebook; demoLorebook: DemoLorebook }
  | { ok: false; reason: 'insufficient_knowledge' | 'compile_failed'; message: string };

const TOPIC_TITLES: Partial<Record<LoreTopicId, string>> = {
  full_life: 'Full Life Story',
  professional: 'Career & Work',
  relationships: 'Dating & Romance',
  family: 'Family Story',
  creative: 'Creative Life',
  health: 'Health & Body',
  education: 'Education Journey',
  personal: 'Personal Growth',
  character_book: 'A Person in My Life',
  place_book: 'A Place That Shaped Me',
};

const QUERY_STATIC_MATCHES: Array<{ pattern: RegExp; demoId: string }> = [
  { pattern: /mira|solene|relationship|love|city/i, demoId: 'demo-2' },
  { pattern: /marrowvale|keeper|lighthouse|archipelago/i, demoId: 'demo-1' },
  { pattern: /cartographer|map|chart/i, demoId: 'demo-3' },
  { pattern: /tide|sea|harbor/i, demoId: 'demo-4' },
];

function deriveCompileTitle(input: DemoCompileInput): string {
  if (input.query?.trim()) return input.query.trim();
  if (input.topicId && TOPIC_TITLES[input.topicId]) return TOPIC_TITLES[input.topicId]!;
  return 'My LoreBook';
}

function pickStaticDemoForQuery(query: string): DemoLorebook | undefined {
  for (const { pattern, demoId } of QUERY_STATIC_MATCHES) {
    if (pattern.test(query)) return getDemoLorebookById(demoId);
  }
  return undefined;
}

function toCompiledEntry(book: DemoLorebook, lorebookName?: string): CompiledLorebook {
  return {
    id: book.id,
    title: book.title,
    lorebook_name: lorebookName ?? book.scope,
    created_at: book.outline.lastUpdated,
    chapterCount: book.chapters,
  };
}

function withDemoGenId(draft: CompiledBookDraft, title: string): CompiledBookDraft {
  const slug = draft.id.replace(/^book-/, '');
  return {
    ...draft,
    id: `demo-gen-${slug}`,
    title,
  };
}

/** Register preset + user-generated demo books into the forge read cache. */
export function syncSimulationDemoLibrary(
  compiledMode: LoreReadinessCompiledMode,
  generatedBooks: CompiledLorebook[],
): void {
  const books: DemoLorebook[] = [...presetDemoBooksForMode(compiledMode)];

  for (const entry of generatedBooks) {
    const cached = getForgeDemoBookById(entry.id);
    if (cached) {
      books.push(cached);
      continue;
    }
    const staticBook = DEMO_LOREBOOKS.find((book) => book.id === entry.id);
    if (staticBook) books.push(staticBook);
  }

  registerForgeDemoBooks(books);
}

export function compileDemoLorebook(input: DemoCompileInput): DemoCompileResult {
  const forge = runForgeForPreset(input.preset);
  const readiness = computeLoreReadiness(forge.stats);

  if (!readiness.canGenerateAnyBook || !forge.memory || !forge.mainBook) {
    return {
      ok: false,
      reason: 'insufficient_knowledge',
      message: "There isn't enough material yet. Keep chatting — then compile your first lorebook.",
    };
  }

  const title = deriveCompileTitle(input);
  const staticMatch = input.query ? pickStaticDemoForQuery(input.query) : undefined;

  if (staticMatch) {
    setForgeDemoBook(staticMatch);
    return {
      ok: true,
      bookId: staticMatch.id,
      compiled: toCompiledEntry(staticMatch, title),
      demoLorebook: staticMatch,
    };
  }

  const topicBook =
    input.topicId && input.topicId !== 'full_life'
      ? forge.domainBooks.find((book) =>
          book.chapters.some((ch) => ch.domain === mapTopicToDomain(input.topicId!)),
        ) ?? forge.domainBooks[0]
      : null;

  const sourceDraft = topicBook ?? forge.mainBook;
  const draft = withDemoGenId({ ...sourceDraft, title }, title);
  const demoLorebook = compiledBookToDemoLorebook(draft, forge.memory, {
    lorebookName: title,
  });

  setForgeDemoBook(demoLorebook);

  return {
    ok: true,
    bookId: demoLorebook.id,
    compiled: {
      id: demoLorebook.id,
      title: demoLorebook.title,
      lorebook_name: title,
      created_at: demoLorebook.outline.lastUpdated,
      chapterCount: demoLorebook.chapters,
    },
    demoLorebook,
  };
}

function mapTopicToDomain(topicId: LoreTopicId): string {
  switch (topicId) {
    case 'professional':
      return 'career';
    case 'relationships':
      return 'relationships';
    case 'family':
      return 'family';
    case 'creative':
      return 'creative';
    case 'health':
      return 'health';
    case 'personal':
      return 'identity';
    case 'character_book':
      return 'relationships';
    case 'place_book':
      return 'place';
    default:
      return 'identity';
  }
}

/** Seed Marrowvale demo books for preset compiled modes. */
export function presetDemoBooksForMode(mode: LoreReadinessCompiledMode): DemoLorebook[] {
  if (mode === 'none') return [];
  if (mode === 'one') return [DEMO_LOREBOOKS[0]];
  return DEMO_LOREBOOKS.slice(0, 2);
}
