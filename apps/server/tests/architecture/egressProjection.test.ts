import { readFileSync, readdirSync } from 'node:fs';
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

describe('Egress projection guard (memoryRetriever journal_entries)', () => {
  const src = readSrc('services/chat/memoryRetriever.ts');
  const colsSrc = readSrc('db/journalEntryColumns.ts');

  it('reads journal_entries through the embedding-free column projection', () => {
    expect(colsSrc).toContain('JOURNAL_COLS');
    expect(colsSrc.split(',').map((c) => c.trim())).not.toContain('embedding');
    expect(src).toContain('JOURNAL_COLS');
    expect(src).toContain('.select(JOURNAL_COLS)');
  });

  it('does select(*) on journal_entries at most once — the documented one-time schema probe', () => {
    // The single allowed select('*') is the cached `.limit(1)` column probe used to
    // learn the schema. Any additional one would re-introduce embedding egress on a
    // per-message path. If this count changes, re-justify it.
    expect(countSelectStar(src, 'journal_entries')).toBeLessThanOrEqual(1);
  });

  it('MMR diversity no longer depends on the embedding vector', () => {
    // simD must score on content; pulling `.embedding` back into MMR would force the
    // retrieval path to fetch 1536-dim vectors again.
    const mmrUsesEmbedding = /simD[\s\S]{0,200}\.embedding/.test(src);
    expect(mmrUsesEmbedding).toBe(false);
  });
});

describe('Egress projection guard (match_journal_entries RPC shape)', () => {
  const MIGRATIONS_DIR = join(__dirname, '../../../../supabase/migrations');

  // The latest migration that (re)defines match_journal_entries is what the live
  // DB returns. The RPC is called multiple times per chat message and up to ~150×
  // per consolidation run, so returning the 1536-dim `embedding` vector here is a
  // top egress source. No caller reads embedding off this RPC's result set.
  function latestMatchJournalEntriesDefinition(): { file: string; sql: string } {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    let found: { file: string; sql: string } | null = null;
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      if (/FUNCTION\s+(public\.)?match_journal_entries/i.test(sql) && /RETURNS\s+TABLE/i.test(sql)) {
        found = { file, sql };
      }
    }
    if (!found) throw new Error('No migration defines match_journal_entries with RETURNS TABLE');
    return found;
  }

  function returnsTableColumns(sql: string): string[] {
    // Grab the column list inside the LAST `RETURNS TABLE ( ... )` block.
    const matches = [...sql.matchAll(/RETURNS\s+TABLE\s*\(([\s\S]*?)\)/gi)];
    const block = matches[matches.length - 1]?.[1] ?? '';
    return block
      .split(',')
      .map((line) => line.trim().split(/\s+/)[0]?.toLowerCase())
      .filter(Boolean) as string[];
  }

  it('latest definition does not return the embedding vector', () => {
    const { file, sql } = latestMatchJournalEntriesDefinition();
    const cols = returnsTableColumns(sql);
    expect(cols, `embedding leaked back into RETURNS TABLE in ${file}`).not.toContain('embedding');
  });

  it('still returns the fields callers actually use', () => {
    const { sql } = latestMatchJournalEntriesDefinition();
    const cols = returnsTableColumns(sql);
    for (const required of ['id', 'content', 'similarity']) {
      expect(cols).toContain(required);
    }
  });
});
