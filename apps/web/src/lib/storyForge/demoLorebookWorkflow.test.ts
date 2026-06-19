import { describe, it, expect, beforeEach } from 'vitest';
import { compileDemoLorebook, syncSimulationDemoLibrary } from './demoLorebookWorkflow';
import { resolveDemoLorebookById } from './forgeDemoLibrary';

describe('demoLorebookWorkflow', () => {
  beforeEach(() => {
    syncSimulationDemoLibrary('none', []);
  });

  it('blocks compile when preset has insufficient knowledge', () => {
    const result = compileDemoLorebook({ query: 'my story', preset: 'empty' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('insufficient_knowledge');
    }
  });

  it('compiles a forge-backed demo book for rich preset', () => {
    const result = compileDemoLorebook({ query: 'my professional journey', preset: 'rich' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bookId.startsWith('demo-gen-')).toBe(true);
      expect(resolveDemoLorebookById(result.bookId)?.outline.sections.length).toBeGreaterThan(0);
    }
  });

  it('maps known queries to static Marrowvale demo books', () => {
    const result = compileDemoLorebook({ query: 'The Keeper of Marrowvale', preset: 'rich' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bookId).toBe('demo-1');
      expect(result.compiled.title).toBe('The Keeper of Marrowvale');
    }
  });

  it('syncs preset compiled books into the read cache', () => {
    syncSimulationDemoLibrary('two', []);
    expect(resolveDemoLorebookById('demo-1')?.title).toBe('The Keeper of Marrowvale');
    expect(resolveDemoLorebookById('demo-2')?.title).toBe('Mira Solenne');
  });
});
