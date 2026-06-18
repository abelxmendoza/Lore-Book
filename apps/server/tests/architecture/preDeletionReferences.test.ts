import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Pre-deletion reference guard — fails if retirement-candidate tables gain unexpected
 * references in application code. Update allowlists in docs/pre-deletion-salvage-audit.md
 * when a redirect PR intentionally adds/removes a reference.
 *
 * This does NOT drop anything; it prevents accidental re-coupling before merge work completes.
 */

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
  it('entity_canonical_map has zero application references (safe dead schema)', () => {
    const hits = rgFiles('entity_canonical_map', SERVER_SRC);
    expect(hits, `unexpected refs: ${hits.join(', ')}`).toEqual([]);
  });

  it('omega_relationships has zero application references after redirect merge', () => {
    const hits = rgFiles('omega_relationships', SERVER_SRC);
    expect(hits, `unexpected refs: ${hits.join(', ')}`).toEqual([]);
  });

  it('timelines_v2 references are documented (broken but wired — do not drop blindly)', () => {
    const hits = rgFiles('timelines_v2', SERVER_SRC);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.includes('timelineV2.ts'))).toBe(true);
  });

  it('people_places still has active references (table not droppable yet)', () => {
    const hits = rgFiles('people_places', SERVER_SRC);
    expect(hits.length).toBeGreaterThan(10);
  });
});
