import { beforeEach, describe, expect, it } from 'vitest';

import { supabaseFromMock } from '../../../tests/setup';
import { skillService } from './skillService';
import { invalidateSkillsSchemaCache } from './skillSchemaAdapter';

function mockSchemaDetectionThenInsert(insertResult: { data: unknown; error: unknown }) {
  // getSkillsDbSchema() probes `.select('skill_name').limit(0)` first (modern
  // schema check) — succeeding there short-circuits before it ever tries the
  // legacy `.select('name')` probe. createSkill() then makes a second,
  // separate .from('skills') call to actually insert.
  supabaseFromMock
    .mockImplementationOnce(() => ({
      select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
    }))
    .mockImplementationOnce(() => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve(insertResult),
        }),
      }),
    }));
}

describe('skillService.createSkill', () => {
  beforeEach(() => {
    invalidateSkillsSchemaCache();
  });

  it('wraps a duplicate-name constraint violation in a clear, actionable error instead of throwing the raw Postgrest object', async () => {
    // Regression: skills has no pre-insert dedupe (unlike organizations/
    // projects) and the raw Supabase error object was thrown as-is — not an
    // Error instance — so callers checking `instanceof Error` (the
    // reclassify route) always fell back to a generic "Failed to
    // reclassify entity" message instead of the real reason.
    mockSchemaDetectionThenInsert({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "skills_user_id_skill_name_key"' },
    });

    await expect(
      skillService.createSkill('user-1', { skill_name: 'Woodworking', skill_category: 'practical' }),
    ).rejects.toThrow('You already have a skill named "Woodworking"');
  });

  it('wraps any other insert failure as a real Error carrying the DB message', async () => {
    mockSchemaDetectionThenInsert({
      data: null,
      error: { code: '23514', message: 'new row for relation "skills" violates check constraint "skills_category_check"' },
    });

    await expect(
      skillService.createSkill('user-1', { skill_name: 'Something', skill_category: 'practical' }),
    ).rejects.toThrow('violates check constraint');
  });
});
