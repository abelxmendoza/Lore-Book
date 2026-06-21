import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Egress regression guard. The embedding-egress sprint stopped fetching 1536-dim
 * `embedding` vectors (~19 KB/row as JSON) on read/hot paths that never use them.
 * These tests fail if someone reintroduces `select('*')` on an embedding-bearing
 * table, which would silently restore the egress that blew the quota.
 *
 * See memory: project-egress-optimization. Measured savings: 92–98% per row.
 */

const SERVER_SRC = join(__dirname, '../../src');

function readSrc(relativePath: string): string {
  return readFileSync(join(SERVER_SRC, relativePath), 'utf8');
}

// Count `.from('<table>')` immediately followed (within a few lines) by select('*').
function countSelectStar(src: string, table: string): number {
  const re = new RegExp(`\\.from\\('${table}'\\)[\\s\\S]{0,80}?\\.select\\('\\*'\\)`, 'g');
  return (src.match(re) ?? []).length;
}

describe('Egress projection guard (omegaMemoryService)', () => {
  const src = readSrc('services/omegaMemoryService.ts');

  it('defines explicit non-embedding column constants', () => {
    expect(src).toContain('OMEGA_ENTITY_COLS');
    expect(src).toContain('OMEGA_CLAIM_COLS');
  });

  it('column constants never include the embedding vector', () => {
    for (const name of ['OMEGA_ENTITY_COLS', 'OMEGA_CLAIM_COLS']) {
      const m = src.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`));
      expect(m, `${name} should be a single-quoted column list`).toBeTruthy();
      expect(m![1].split(',').map((c) => c.trim())).not.toContain('embedding');
    }
  });

  it('never does select(*) on omega_entities (all reads are projected)', () => {
    expect(countSelectStar(src, 'omega_entities')).toBe(0);
  });

  it('does select(*) on omega_claims exactly once — the documented findSimilarClaims trade-off', () => {
    // findSimilarClaims intentionally keeps the embedding so conflictDetected can
    // reuse it instead of paying for an OpenAI re-embed. If this count changes,
    // re-justify it (either a new leak to fix, or a new deliberate exception).
    expect(countSelectStar(src, 'omega_claims')).toBe(1);
  });
});

describe('Egress projection guard (memoryEngine route)', () => {
  it('GET components route does not ship embeddings to the client', () => {
    const src = readSrc('routes/memoryEngine.ts');
    expect(countSelectStar(src, 'memory_components')).toBe(0);
  });
});
