import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('../../logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }));
vi.mock('../beliefRealityReconciliationService', () => ({ beliefRealityReconciliationService: {} }));
vi.mock('../confidenceTrackingService', () => ({ confidenceTrackingService: {} }));
vi.mock('../knowledgeTypeEngineService', () => ({ knowledgeTypeEngineService: {} }));
vi.mock('../metaControlService', () => ({ metaControlService: {} }));
vi.mock('../omegaMemoryService', () => ({ omegaMemoryService: {} }));

import { EventAssemblyService } from './eventAssemblyService';

const extractTitle = (units: Array<{ content: string }>) =>
  (new EventAssemblyService() as any).extractEventTitle(units) as string;

describe('EventAssemblyService.extractEventTitle', () => {
  it('returns no title for an empty failed extraction', () => {
    const title = extractTitle([]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title).toBe('');
  });

  it('builds a contextual title from unit content', () => {
    const title = extractTitle([
      { content: 'Went to Costco with Grandma Rose and bought groceries for the week.' },
    ]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title.toLowerCase()).toMatch(/costco|abuela|grocer/);
  });

  it('returns no title for whitespace-only content', () => {
    const title = extractTitle([{ content: '   ' }]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title).toBe('');
  });

  it.each([
    ['I briefly saw her at Ska Prom.', 'Ska Prom'],
    ['I went to Catch One for the Anime Expo afters over Fourth of July weekend.', 'Anime Expo Afters at Catch One'],
    ["I stayed at Tia Grace's house for Memorial Day weekend.", "Memorial Day Weekend at Tia Grace's House"],
    ['I started onboarding for Amazon Ring through Kforce.', 'Amazon Ring Onboarding'],
    ['I am currently onboarding with Kforce.', 'Kforce Onboarding'],
    ['There was a conflict with Jenna and Voltra.', 'Conflict with Jenna and Voltra'],
    ['I hooked up with Ashley after the party.', 'Night with Ashley'],
  ])('recognizes a known life-event shape without using a raw sentence title', (content, expected) => {
    expect(extractTitle([{ content }])).toBe(expected);
  });
});
