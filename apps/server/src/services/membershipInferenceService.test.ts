import { describe, it, expect } from 'vitest';

import { extractMembershipStatements } from './membershipInferenceService';

describe('extractMembershipStatements', () => {
  it('extracts explicit membership forms', () => {
    expect(extractMembershipStatements('Poppy is in Static Petals now')).toEqual([
      { memberName: 'Poppy', orgName: 'Static Petals now', action: 'member', role: undefined },
    ]);
    expect(extractMembershipStatements('Marco joined Voltra last month')[0]).toMatchObject({
      memberName: 'Marco',
      action: 'join',
    });
  });

  it('captures instrument roles', () => {
    const [st] = extractMembershipStatements('Rafa plays bass for Neon Newts');
    expect(st).toMatchObject({ memberName: 'Rafa', orgName: 'Neon Newts', action: 'member', role: 'bass' });
  });

  it('extracts leaves', () => {
    const [st] = extractMembershipStatements('Poppy left Static Petals');
    expect(st).toMatchObject({ memberName: 'Poppy', orgName: 'Static Petals', action: 'leave' });
  });

  it('ignores non-membership sentences and lowercase noise', () => {
    expect(extractMembershipStatements('we danced all night at the club')).toEqual([]);
    expect(extractMembershipStatements('the bug is in the resolver')).toEqual([]);
  });
});
