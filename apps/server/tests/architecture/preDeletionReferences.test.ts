import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_ROOT = join(__dirname, '../..');
const SERVER_SRC = join(SERVER_ROOT, 'src');

// Node-based file scan — deliberately NOT shelling out to ripgrep. `rg` is not
// installed in every CI image, and the old `catch { return [] }` fallback made
// the "zero references" assertions pass silently when the binary was missing
// (false green). A pure-Node walk is deterministic on every machine.
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.json']);

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') continue;
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      if (/\.test\./.test(entry.name)) continue; // mirror the old --glob "!**/*.test.*"
      const dot = entry.name.lastIndexOf('.');
      if (dot >= 0 && SCANNED_EXTENSIONS.has(entry.name.slice(dot))) out.push(full);
    }
  }
  return out;
}

function rgFiles(pattern: string, searchRoot: string): string[] {
  const re = new RegExp(pattern);
  return walkFiles(searchRoot).filter((file) => re.test(readFileSync(file, 'utf8')));
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
