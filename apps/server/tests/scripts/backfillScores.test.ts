import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit + e2e tests for the consolidated scoring backfill (`backfill-scores.ts`),
 * which replaced the three identical backfill-character/-event/-relationship scripts.
 */

const h = vi.hoisted(() => {
  const listUsers = vi.fn();
  const scoreCharacters = vi.fn(async () => ({ scored: 3 }));
  const scoreEvents = vi.fn(async () => ({ scored: 5 }));
  const scoreRelationships = vi.fn(async () => ({ scored: 7 }));
  return {
    supabaseAdmin: { auth: { admin: { listUsers } } },
    listUsers,
    scoreCharacters,
    scoreEvents,
    scoreRelationships,
    reset: () => {
      listUsers.mockReset();
      scoreCharacters.mockClear();
      scoreEvents.mockClear();
      scoreRelationships.mockClear();
    },
  };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: h.supabaseAdmin }));
vi.mock('../../src/services/characters/characterImportanceService', () => ({
  scoreAllCharactersForUser: h.scoreCharacters,
}));
vi.mock('../../src/services/events/eventSignificanceService', () => ({
  scoreAllEventsForUser: h.scoreEvents,
}));
vi.mock('../../src/services/relationships/relationshipScoringService', () => ({
  scoreAllRelationshipsForUser: h.scoreRelationships,
}));

import { SCORERS, arg, resolveUserId, runBackfill } from '../../../../scripts/backfill-scores';

beforeEach(() => {
  h.reset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('backfill-scores — arg + SCORERS (unit)', () => {
  it('exposes the three score targets', () => {
    expect(Object.keys(SCORERS).sort()).toEqual(['characters', 'events', 'relationships']);
    expect(SCORERS.characters.noun).toBe('character');
    expect(SCORERS.events.noun).toBe('event');
    expect(SCORERS.relationships.noun).toBe('relationship');
  });

  it('arg() returns the token following a flag, or undefined', () => {
    expect(arg(['--user', 'a@b.com'], '--user')).toBe('a@b.com');
    expect(arg(['--user-id', 'u1'], '--user-id')).toBe('u1');
    expect(arg(['--user'], '--user')).toBeUndefined();
    expect(arg([], '--user')).toBeUndefined();
  });
});

describe('backfill-scores — resolveUserId (unit)', () => {
  it('returns --user-id directly without hitting Supabase', async () => {
    const id = await resolveUserId(['--user-id', 'u-direct']);
    expect(id).toBe('u-direct');
    expect(h.listUsers).not.toHaveBeenCalled();
  });

  it('resolves --user email to its auth id (case-insensitive)', async () => {
    h.listUsers.mockResolvedValue({
      data: { users: [{ id: 'u-42', email: 'Founder@Example.com' }] },
      error: null,
    });
    const id = await resolveUserId(['--user', 'founder@example.com']);
    expect(id).toBe('u-42');
    expect(h.listUsers).toHaveBeenCalledWith({ perPage: 1000 });
  });

  it('throws when neither --user nor --user-id is provided', async () => {
    await expect(resolveUserId([])).rejects.toThrow(/--user .*or --user-id/);
  });

  it('throws when the email has no matching auth user', async () => {
    h.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    await expect(resolveUserId(['--user', 'ghost@example.com'])).rejects.toThrow(/No auth user/);
  });

  it('propagates a Supabase listUsers error', async () => {
    h.listUsers.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(resolveUserId(['--user', 'x@y.com'])).rejects.toThrow(/boom/);
  });
});

describe('backfill-scores — runBackfill (e2e)', () => {
  it('"all" runs every scorer once with the resolved user id', async () => {
    await runBackfill(['all', '--user-id', 'u-all']);
    expect(h.scoreCharacters).toHaveBeenCalledExactlyOnceWith('u-all');
    expect(h.scoreEvents).toHaveBeenCalledExactlyOnceWith('u-all');
    expect(h.scoreRelationships).toHaveBeenCalledExactlyOnceWith('u-all');
  });

  it('a single target runs only that scorer', async () => {
    await runBackfill(['characters', '--user-id', 'u1']);
    expect(h.scoreCharacters).toHaveBeenCalledOnce();
    expect(h.scoreEvents).not.toHaveBeenCalled();
    expect(h.scoreRelationships).not.toHaveBeenCalled();
  });

  it('throws on an unknown subcommand', async () => {
    await expect(runBackfill(['bogus', '--user-id', 'u1'])).rejects.toThrow(/Usage: backfill-scores/);
  });

  it('throws when no subcommand is given', async () => {
    await expect(runBackfill([])).rejects.toThrow(/Usage: backfill-scores/);
  });

  it('does not run any scorer if the user cannot be resolved', async () => {
    await expect(runBackfill(['all'])).rejects.toThrow(/--user/);
    expect(h.scoreCharacters).not.toHaveBeenCalled();
  });
});
