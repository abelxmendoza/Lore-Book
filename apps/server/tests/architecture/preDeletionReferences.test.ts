import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const SERVER_ROOT = join(__dirname, '../..');
const SERVER_SRC = join(SERVER_ROOT, 'src');

function rgFiles(pattern: string, searchRoot: string): string[] {
  try {
    const out = execSync(`rg -l "${pattern}" "${searchRoot}" --glob "!**/*.test.*" --glob "!**/tests/**"`, {
      encoding: 'utf8',
      cwd: SERVER_ROOT,
    }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

function rel(p: string): string {
  const normalized = p.replace(/\\/g, '/');
  const idx = normalized.indexOf('/src/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

describe('pre-deletion reference guard', () => {
  it('entity_canonical_map has zero application references', () => {
    expect(rgFiles('entity_canonical_map', SERVER_SRC)).toEqual([]);
  });

  it('omega_relationships has zero application references', () => {
    expect(rgFiles('omega_relationships', SERVER_SRC)).toEqual([]);
  });

  it('timelines_v2 table name has zero application references after life_arcs redirect', () => {
    expect(rgFiles('timelines_v2', SERVER_SRC)).toEqual([]);
  });

  it('people_places SQL reads have zero references under services/chat', () => {
    const hits = rgFiles("from\\('people_places'\\)", join(SERVER_SRC, 'services/chat'));
    expect(hits.map(rel), hits.map(rel).join(', ')).toEqual([]);
  });

  it('people_places still referenced outside chat (table not droppable)', () => {
    expect(rgFiles('people_places', SERVER_SRC).length).toBeGreaterThan(5);
  });
});
