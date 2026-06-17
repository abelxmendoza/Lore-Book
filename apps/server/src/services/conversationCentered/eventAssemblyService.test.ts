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
  it('never returns "Untitled Event" for empty units', () => {
    const title = extractTitle([]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title.length).toBeGreaterThan(0);
  });

  it('builds a contextual title from unit content', () => {
    const title = extractTitle([
      { content: 'Went to Costco with Grandma Rose and bought groceries for the week.' },
    ]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title.toLowerCase()).toMatch(/costco|abuela|grocer/);
  });

  it('handles whitespace-only content without "Untitled"', () => {
    const title = extractTitle([{ content: '   ' }]);
    expect(title.toLowerCase()).not.toContain('untitled');
    expect(title.length).toBeGreaterThan(0);
  });
});
