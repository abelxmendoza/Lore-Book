import { describe, expect, it, vi, beforeEach } from 'vitest';

// Control the user's known organizations (schools) and characters per test.
let mockOrgs: Array<{ id: string; name: string; type: string }> = [];
let mockCharacters: Array<{ id: string; name: string; aliases: string[] }> = [];
const insertSpy = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data:
            table === 'organizations'
              ? mockOrgs
              : table === 'characters'
                ? mockCharacters
                : [],
        }),
      }),
      insert: insertSpy,
      update: insertSpy,
      upsert: insertSpy,
    })),
  },
}));

import { previewLexicalSpans } from '../../src/services/lexical/lexicalPreviewService';
import {
  SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT,
  assertSchoolPreviewSpans,
  assertSchoolHierarchy,
} from '../fixtures/schoolDetentionLunchFootballTeamFriends';
import {
  LOST_BEST_FRIEND_LA_SHOWS_SKA_SCENE_TEXT,
  assertOscarPreviewSpans,
  assertOscarInference,
  assertOscarKnownWhenIndexed,
} from '../fixtures/lostBestFriendLaShowsSkaScene';

const run = () =>
  previewLexicalSpans({
    text: SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT,
    userId: 'test-user',
    mode: 'composer_preview',
  });

describe('lexicalPreview — school/community fixture', () => {
  beforeEach(() => {
    mockOrgs = [];
    mockCharacters = [];
    insertSpy.mockClear();
  });

  it('returns colored spans for people, groups, events, and times', async () => {
    const result = await run();
    assertSchoolPreviewSpans(result);
  });

  it('infers the school-community hierarchy (review-first, soft)', async () => {
    const result = await run();
    assertSchoolHierarchy(result);
  });

  it('creates an Unknown School Community when no school is known', async () => {
    const result = await run();
    expect(
      result.inferredAssociations.some((a) => /unknown school community/i.test(a.label)),
    ).toBe(true);
    expect(result.ambiguities).toContain('school_parent_unresolved');
  });

  it('resolves to the known school when exactly one exists', async () => {
    mockOrgs = [{ id: 'sch-1', name: 'Lincoln High', type: 'school' }];
    const result = await run();
    expect(
      result.inferredAssociations.some((a) => /lincoln high school community/i.test(a.label)),
    ).toBe(true);
    expect(result.ambiguities).not.toContain('school_parent_unresolved');
  });

  it('does not create individual unnamed friends from "friends"', async () => {
    const result = await run();
    // The plural "friends" yields ONE group span, never PERSON spans for friends.
    const personNames = result.spans.filter((s) => s.type === 'PERSON').map((s) => s.text);
    expect(personNames).toEqual(['Abel Mendoza']);
  });

  it('is read-only — performs no DB writes', async () => {
    await run();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

const runOscar = () =>
  previewLexicalSpans({
    text: LOST_BEST_FRIEND_LA_SHOWS_SKA_SCENE_TEXT,
    userId: 'test-user',
    mode: 'composer_preview',
  });

describe('lexicalPreview — lost best friend / LA ska scene fixture', () => {
  beforeEach(() => {
    mockOrgs = [];
    mockCharacters = [];
    insertSpy.mockClear();
  });

  it('returns colored spans for person, relationship, time, place, events, interest, emotion', async () => {
    const result = await runOscar();
    assertOscarPreviewSpans(result);
  });

  it('infers music-scene associations without inferring death or conflict', async () => {
    const result = await runOscar();
    assertOscarInference(result);
  });

  it('marks Oscar as known when already in LoreBook', async () => {
    mockCharacters = [{ id: 'char-oscar', name: 'Oscar Trujio', aliases: [] }];
    const result = await runOscar();
    assertOscarKnownWhenIndexed(result);
  });

  it('is read-only — performs no DB writes', async () => {
    await runOscar();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
