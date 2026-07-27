import { describe, expect, it } from 'vitest';
import {
  extractListedMemberNames,
  inferGroupNameFromContext,
} from './groupWriteService';

describe('groupWriteService helpers', () => {
  it('extracts a comma/and roster list', () => {
    expect(
      extractListedMemberNames(
        'So far we have NeonPulse, VelvetFox, LumaJade, Star Bats, and Neon Pixie',
      ),
    ).toEqual(['NeonPulse', 'VelvetFox', 'LumaJade', 'Star Bats', 'Neon Pixie']);
  });

  it('infers Popular E-Girls from prior egirl context when user says "for that"', () => {
    expect(
      inferGroupNameFromContext('shes a popular egirl. make a group for that', []),
    ).toBe('Popular E-Girls');
  });

  it('prefers an explicit group-for name', () => {
    expect(inferGroupNameFromContext('make a group for underground djs', [])).toBe(
      'Underground Djs',
    );
  });

  it('falls back to thread title', () => {
    expect(inferGroupNameFromContext('add them to the group', [], 'Popular Egirl Group')).toBe(
      'Popular Egirl Group',
    );
  });
});
