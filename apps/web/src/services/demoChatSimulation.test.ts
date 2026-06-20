import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  buildDemoChatResponse,
  createDemoSeedThreads,
  deriveDemoThreadMeta,
  isDemoChatMockup,
  seedDemoChatThreadsIfEmpty,
  simulateDemoChatSend,
} from './demoChatSimulation';
import { compileChatLoreContext } from '../lib/chatLoreContext';
import { mockDataService } from './mockDataService';

vi.mock('../hooks/useShouldUseMockData', () => ({
  shouldUseMockData: () => true,
}));

vi.mock('../contexts/MockDataContext', () => ({
  getGlobalMockDataEnabled: () => true,
}));

vi.mock('./demoMutationEffects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./demoMutationEffects')>();
  return { ...actual, emitDemoEffect: vi.fn() };
});

vi.mock('../lib/storyRefresh', () => ({
  dispatchStoryDataUpdated: vi.fn(),
}));

function seedBooks() {
  mockDataService.register.characters([
    { id: 'c-alex', name: 'Alex', alias: [] } as never,
    { id: 'c-marcus', name: 'Marcus', alias: [] } as never,
  ]);
  mockDataService.register.locations([
    { id: 'l-mission', name: 'Mission Beach' } as never,
  ]);
  mockDataService.register.skills([
    { id: 's-muay', skill_name: 'Muay Thai' } as never,
  ]);
}

describe('demoChatSimulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedBooks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects demo chat mockup mode', () => {
    expect(isDemoChatMockup()).toBe(true);
  });

  it('seeds threads when storage is empty', () => {
    const seeded = seedDemoChatThreadsIfEmpty([]);
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded[0].title).toBeTruthy();
  });

  it('builds entity-aware demo responses from certified + fallback lore', () => {
    const result = buildDemoChatResponse('I saw Alex in San Diego yesterday');
    expect(result.content).toContain('Demo');
    expect(result.mentionedEntities?.some((e) => e.name === 'Alex')).toBe(true);
    expect(result.mentionedEntities?.some((e) => e.name === 'San Diego')).toBe(true);
  });

  it('uses lexical ontology for new entities in demo chat', () => {
    mockDataService.register.characters([]);
    const result = buildDemoChatResponse(
      'My aunt Maribel and I started working at Summit Staffing while learning muay thai',
    );
    expect(result.content).toContain('lexical intelligence');
    expect(result.mentionedEntities?.some((e) => e.name === 'Maribel')).toBe(true);
    expect(result.mentionedEntities?.some((e) => e.type === 'organization')).toBe(true);
    expect(result.mentionedEntities?.some((e) => e.type === 'skill')).toBe(true);
  });

  it('includes thread memory line when history carries prior entities', () => {
    const history = [
      {
        role: 'user' as const,
        content: 'Marcus mentioned Vanguard Robotics might have an opening',
      },
    ];
    const lore = compileChatLoreContext('What did he say about the role?', {
      conversationHistory: history,
    });
    const result = buildDemoChatResponse('What did he say about the role?');

    expect(lore.priorMentionedNames).toContain('Marcus');
    expect(result.subtitle).toBeTruthy();
  });

  it('routes recall intent in pre-LLM compilation', () => {
    const lore = compileChatLoreContext('What do you know about Alex from Mission Beach?');
    expect(lore.intent).toBe('recall');
    const result = buildDemoChatResponse('What do you know about Alex from Mission Beach?');
    expect(result.content).toMatch(/memory recall|demo mode/i);
  });

  it('derives thread meta from recent messages', () => {
    const messages = [
      { id: '1', role: 'user' as const, content: 'Alex and I went to Mission Beach', timestamp: new Date() },
      {
        id: '2',
        role: 'assistant' as const,
        content: 'That sounds like a meaningful reset.',
        timestamp: new Date(),
      },
    ];
    const meta = deriveDemoThreadMeta(messages);
    expect(meta.subtitle).toBe('Relationships');
    expect(meta.dominantEntities?.some((n) => n === 'Alex')).toBe(true);
  });

  it('simulates staged streaming without API', async () => {
    const chunks: string[] = [];
    const stages: string[] = [];

    const promise = simulateDemoChatSend({
      message: 'Tell me about Marcus at Vanguard Robotics',
      onStage: (stage) => stages.push(stage),
      onChunk: (chunk) => chunks.push(chunk),
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(stages.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe(result.content);
    expect(result.mentionedEntities?.some((e) => e.name === 'Marcus')).toBe(true);
  });

  it('creates seed threads with saved messages', () => {
    const threads = createDemoSeedThreads();
    expect(threads.length).toBeGreaterThanOrEqual(10);
    expect(threads.every((t) => t.messages.length > 0)).toBe(true);
    expect(threads.some((t) => t.dominantEntities?.length)).toBe(true);
    expect(threads.some((t) => t.messages.some((m) => m.mentionedEntities?.length))).toBe(true);
  });

  it('aligns demo response entities with compileChatLoreContext output', () => {
    const message = 'I worked at Vanguard Robotics and trained in Muay Thai with Marcus';
    const lore = compileChatLoreContext(message);
    const result = buildDemoChatResponse(message);

    const loreNames = new Set(lore.entities.map((e) => e.name));
    const responseNames = new Set(result.mentionedEntities?.map((e) => e.name) ?? []);
    expect(responseNames).toEqual(loreNames);
  });
});
