import { describe, it, expect } from 'vitest';

import { assessNarrative } from './mcpLoreIngest';

describe('assessNarrative — dev-session lore guard', () => {
  it('accepts real autobiographical narrative (a club story)', () => {
    const story =
      'I went to the club last night after the comic con, there was an afters at the Warehouse. ' +
      'I got to dance with Mothdoll and Vexadoll and I was grabbing Vexadoll by the waist. ' +
      'Later I stopped by my tia’s to eat before the afters.';
    expect(assessNarrative(story)).toEqual({ isNarrative: true, reason: 'narrative' });
  });

  it('rejects technical discussion even in first person', () => {
    for (const text of [
      'I fixed the resolver bug by adding a migration and now the tests pass in CI',
      'I think we should refactor the ingestion endpoint, the API returns error TS2345',
      'My plan: npm run build, then git push to main and CREATE TABLE for the roster',
      'const x = () => { return 1 } // I wrote this function for my app',
    ]) {
      expect(assessNarrative(text).isNarrative, text).toBe(false);
    }
  });

  it('rejects third-person text with no autobiographical voice', () => {
    const r = assessNarrative('The quarterly report shows revenue increased across all regions during the fiscal year.');
    expect(r).toEqual({ isNarrative: false, reason: 'no_first_person' });
  });

  it('rejects too-short fragments', () => {
    expect(assessNarrative('I saw her.')).toEqual({ isNarrative: false, reason: 'too_short' });
  });

  it('accepts emotional life narrative that mentions no tech', () => {
    const r = assessNarrative(
      'My uncle Juan came over for dinner and we talked about my grandmother for hours. I miss how things used to be.',
    );
    expect(r.isNarrative).toBe(true);
  });
});
