import { describe, expect, it } from 'vitest';
import {
  extractListedMemberNames,
  inferGroupNameFromContext,
  isReplyToGroupNamingPrompt,
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

  it('title-cases hyphenated words in the inferred name', () => {
    expect(inferGroupNameFromContext('make a group for popular e-girls', [])).toBe(
      'Popular E-Girls',
    );
  });
});

describe('isReplyToGroupNamingPrompt', () => {
  const namingPromptHistory = [
    { role: 'user', content: 'make a group for popular egirls' },
    {
      role: 'assistant',
      content: "Got it! I'll create the group. Is there anything specific you want to name the group?",
    },
  ];

  it('recognizes a bare reply right after the assistant asked for a name', () => {
    expect(isReplyToGroupNamingPrompt('popular e-girls', namingPromptHistory)).toBe(true);
  });

  it('recognizes "what do you want to call it?" phrasing too', () => {
    const history = [
      { role: 'assistant', content: 'Sure — what do you want to call it?' },
    ];
    expect(isReplyToGroupNamingPrompt('The Night Owls', history)).toBe(true);
  });

  it('rejects when no naming question was asked', () => {
    const history = [{ role: 'assistant', content: "I've added them to the roster." }];
    expect(isReplyToGroupNamingPrompt('popular e-girls', history)).toBe(false);
  });

  it('rejects a message that is itself a roster list, not a name', () => {
    expect(
      isReplyToGroupNamingPrompt('NeonPulse, VelvetFox, and LumaJade', namingPromptHistory),
    ).toBe(false);
  });

  it('rejects an overly long reply (not a bare name answer)', () => {
    expect(
      isReplyToGroupNamingPrompt(
        'I think we should call it something fun like Popular E-Girls Club maybe',
        namingPromptHistory,
      ),
    ).toBe(false);
  });

  it('rejects an empty message', () => {
    expect(isReplyToGroupNamingPrompt('', namingPromptHistory)).toBe(false);
  });
});
