import { describe, expect, it } from 'vitest';

import { clustersMatch, normalizeMemberKey, sharedMemberCount } from './clusterMatch';

describe('clusterMatch', () => {
  it('normalizes accents and casing', () => {
    expect(normalizeMemberKey('Uncle James')).toBe('tio juan');
    expect(normalizeMemberKey('  ABUELA ')).toBe('abuela');
  });

  it('counts shared members regardless of accent/case', () => {
    expect(sharedMemberCount(['Uncle James', 'Grandma Rose'], ['tio juan', 'ABUELA', 'Mom'])).toBe(2);
    expect(sharedMemberCount(['Sam'], ['Kelly'])).toBe(0);
  });

  it('matches clusters that share two or more members', () => {
    expect(clustersMatch(['Sam', 'Kelly', 'Bob'], ['Kelly', 'Sam'])).toBe(true);
    expect(clustersMatch(['Sam', 'Bob'], ['Kelly', 'Dana'])).toBe(false);
  });

  it('matches clusters with the same name even without member overlap', () => {
    expect(clustersMatch([], [], 'Neon Collective', 'los goths')).toBe(true);
    expect(clustersMatch([], [], 'Neon Collective', 'My Family')).toBe(false);
  });

  it('does not match on a single shared member', () => {
    expect(clustersMatch(['Sam', 'Bob'], ['Sam', 'Dana'])).toBe(false);
  });
});
