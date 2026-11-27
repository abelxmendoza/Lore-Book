import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: {} }));

import { agentHivemindStateSchema, milestoneDateToIso, sanitizeSearchTerm, slugify } from '../../src/services/hivemind/hivemindService';

describe('hivemindService helpers', () => {
  it('slugify is stable so the same title updates the same memory', () => {
    expect(slugify('Web install needs --legacy-peer-deps!')).toBe('web-install-needs-legacy-peer-deps');
    expect(slugify('!!!')).toBe('memory');
  });

  it('sanitizeSearchTerm escapes LIKE wildcards and strips or() separators', () => {
    expect(sanitizeSearchTerm('100%_done')).toBe('100\\%\\_done');
    expect(sanitizeSearchTerm('a,b),title.eq.x')).toBe('a b  title.eq.x');
  });
});

describe('agent-hivemind import helpers', () => {
  it('converts ledger dates to ISO timestamps', () => {
    expect(milestoneDateToIso('2026-10')).toBe('2026-10-01T00:00:00Z');
    expect(milestoneDateToIso('2026-10-05')).toBe('2026-10-05T00:00:00Z');
    expect(milestoneDateToIso('2026-11-26T08:00:00Z')).toBe('2026-11-26T08:00:00.000Z');
    expect(milestoneDateToIso('Fall 2026')).toBeUndefined();
    expect(milestoneDateToIso(undefined)).toBeUndefined();
  });

  it('accepts a real-shaped state file and ignores machine details', () => {
    const parsed = agentHivemindStateSchema.parse({
      owner: 'someone',
      machines: [{ name: 'box', tailscale_ip: '100.0.0.1' }],
      active_tasks: [
        { repo: 'Lore-Book', path: 'C:/x', last_agent: 'Claude Code', where_i_left_off: 'Shipped it', next_steps: ['Smoke test'] },
      ],
      career_ledger: { tracks: [], milestones: [{ date: '2026-10', track: 'Full-stack', project: 'Hivemind', highlight: 'Built it' }] },
    });
    expect(parsed.active_tasks?.[0].repo).toBe('Lore-Book');
    expect(parsed.career_ledger?.milestones?.[0].project).toBe('Hivemind');
  });
});
