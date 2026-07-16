import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoreReadinessPanel } from './LoreReadinessPanel';
import type { LoreReadinessSummary } from '../../lib/loreReadiness';

const mockNavigate = vi.fn();
const mockOpenChat = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithPrefill: (...args: unknown[]) => mockOpenChat(...args),
  openChatWithFocus: vi.fn(),
}));

vi.mock('./LoreReadinessSimulator', () => ({
  LoreReadinessSimulator: () => null,
}));

const characterId = '22222222-2222-4222-8222-222222222222';

function baseReadiness(overrides: Partial<LoreReadinessSummary> = {}): LoreReadinessSummary {
  return {
    knowledgeScore: 84,
    overallProgress: 0.8,
    overallLevel: 'ready',
    canGenerateAnyBook: true,
    readyTopicCount: 2,
    buildingTopicCount: 1,
    stats: {
      totalJournalEntries: 40,
      totalChatMessages: 195,
      totalNarrativeAtoms: 121,
      totalWordCount: 12000,
      domainCoverage: [],
      entityCounts: { characters: 60, locations: 23, events: 10, skills: 2 },
    },
    topics: [
      {
        topic: {
          id: 'professional',
          label: 'Career & work',
          description: 'Jobs and growth',
          scope: 'domain',
          domain: 'professional',
          minAtoms: 8,
          minEntries: 5,
        },
        level: 'ready',
        progress: 1,
        atomCount: 31,
        entryCount: 31,
        wordCount: 4000,
        atomsNeeded: 0,
        entriesNeeded: 0,
        canGenerate: true,
        gaps: [],
        focusCandidates: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            kind: 'organization',
            label: 'Vanguard Robotics',
            topicId: 'professional',
            score: 0.92,
            canCompile: true,
            reasons: ['Your years around Vanguard Robotics'],
            signals: {
              atomCount: 18,
              wordCount: 3200,
              entryCount: 10,
              meaningClusters: 5,
              threadLinks: 3,
              evidenceFacts: 2,
            },
            compileRef: {
              organizationId: '44444444-4444-4444-8444-444444444444',
              themes: ['Vanguard Robotics'],
            },
          },
        ],
        signalSummary: '~3.2k words · 10 episodes · 3 linked threads',
      },
      {
        topic: {
          id: 'family',
          label: 'Family',
          description: 'Home life',
          scope: 'domain',
          domain: 'family',
          minAtoms: 6,
          minEntries: 4,
        },
        level: 'building',
        progress: 0.5,
        atomCount: 1,
        entryCount: 5,
        wordCount: 200,
        atomsNeeded: 5,
        entriesNeeded: 0,
        canGenerate: false,
        gaps: [
          {
            id: 'atoms',
            label: 'More stories',
            severity: 'blocker',
            suggestion: 'Share 5 more stories about family.',
            current: 1,
            required: 6,
          },
        ],
      },
      {
        topic: {
          id: 'character_book',
          label: 'A person',
          description: 'Someone in your life',
          scope: 'thematic',
          minAtoms: 6,
          minEntries: 3,
        },
        level: 'building',
        progress: 0.7,
        atomCount: 31,
        entryCount: 31,
        wordCount: 3000,
        atomsNeeded: 0,
        entriesNeeded: 0,
        canGenerate: false,
        gaps: [
          {
            id: 'atom_types',
            label: 'Relationship moments',
            severity: 'blocker',
            suggestion: 'Describe a meaningful moment with someone important.',
            current: 0,
            required: 1,
          },
        ],
        focusCandidates: [
          {
            id: characterId,
            kind: 'character',
            label: 'Marcus',
            topicId: 'character_book',
            score: 1,
            canCompile: false,
            reasons: ['Your story with Marcus'],
            signals: {
              atomCount: 20,
              wordCount: 2000,
              entryCount: 10,
              meaningClusters: 4,
              threadLinks: 3,
              evidenceFacts: 2,
            },
            compileRef: { characterId },
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            kind: 'character',
            label: 'Jamie',
            topicId: 'character_book',
            score: 0.9,
            canCompile: false,
            reasons: ['Your story with Jamie'],
            signals: {
              atomCount: 12,
              wordCount: 1200,
              entryCount: 6,
              meaningClusters: 3,
              threadLinks: 2,
              evidenceFacts: 1,
            },
            compileRef: { characterId: '33333333-3333-4333-8333-333333333333' },
          },
        ],
        signalSummary: '~2.0k words · 10 episodes · 3 linked threads',
      },
      {
        topic: {
          id: 'health',
          label: 'Health & body',
          description: 'Wellness',
          scope: 'domain',
          domain: 'health',
          minAtoms: 5,
          minEntries: 3,
        },
        level: 'needs_more',
        progress: 0.1,
        atomCount: 0,
        entryCount: 0,
        wordCount: 0,
        atomsNeeded: 5,
        entriesNeeded: 3,
        canGenerate: false,
        gaps: [],
      },
    ],
    ...overrides,
  } as LoreReadinessSummary;
}

const render = (ui: React.ReactElement) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

describe('LoreReadinessPanel', () => {
  const onGenerateTopic = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onGenerateTopic with organization focus when Career Compile is clicked', () => {
    render(
      <LoreReadinessPanel
        readiness={baseReadiness()}
        compiledBooks={[]}
        onGenerateTopic={onGenerateTopic}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /^Compile$/i })[0]);
    expect(onGenerateTopic).toHaveBeenCalledWith(
      'professional',
      expect.objectContaining({
        organizationId: '44444444-4444-4444-8444-444444444444',
      }),
    );
  });

  it('primary CTA compiles the best ready topic with focus', () => {
    render(
      <LoreReadinessPanel
        readiness={baseReadiness()}
        compiledBooks={[]}
        onGenerateTopic={onGenerateTopic}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Compile Career & work/i }));
    expect(onGenerateTopic).toHaveBeenCalledWith(
      'professional',
      expect.objectContaining({
        organizationId: '44444444-4444-4444-8444-444444444444',
      }),
    );
  });

  it('does not show Go compile a lorebook link to /lorebook', () => {
    render(
      <LoreReadinessPanel
        readiness={baseReadiness()}
        compiledBooks={[]}
        onGenerateTopic={onGenerateTopic}
      />,
    );
    expect(screen.queryByRole('button', { name: /Go compile a lorebook/i })).not.toBeInTheDocument();
  });

  it('opens chat with gap suggestion for building topics', () => {
    render(
      <LoreReadinessPanel
        readiness={baseReadiness()}
        compiledBooks={[]}
        onGenerateTopic={onGenerateTopic}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Chat about this/i })[0]);
    expect(mockOpenChat).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/chat');
  });

  it('shows entity picker and blocking gap for person topics', () => {
    render(
      <LoreReadinessPanel
        readiness={baseReadiness()}
        compiledBooks={[]}
        onGenerateTopic={onGenerateTopic}
      />,
    );

    expect(screen.getByText(/Still needed:/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getAllByText(/Marcus/).length).toBeGreaterThan(0);
  });

  it('compiles person topic with selected characterId when ready', () => {
    const readiness = baseReadiness();
    readiness.topics = readiness.topics.map((t) =>
      t.topic.id === 'character_book'
        ? {
            ...t,
            canGenerate: true,
            level: 'ready' as const,
            progress: 1,
            focusCandidates: t.focusCandidates?.map((f) => ({ ...f, canCompile: true })),
          }
        : t,
    );

    render(
      <LoreReadinessPanel
        readiness={readiness}
        compiledBooks={[]}
        onGenerateTopic={onGenerateTopic}
      />,
    );

    const personCard = screen.getByTestId('lore-topic-card-character_book');
    fireEvent.click(personCard.querySelector('button')!);
    expect(onGenerateTopic).toHaveBeenCalledWith(
      'character_book',
      expect.objectContaining({ characterId }),
    );
  });

  it('shows career org focus option', () => {
    render(
      <LoreReadinessPanel
        readiness={baseReadiness()}
        compiledBooks={[]}
        onGenerateTopic={onGenerateTopic}
      />,
    );
    expect(screen.getAllByText(/Vanguard Robotics/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/~3\.2k words/i).length).toBeGreaterThan(0);
  });
});
