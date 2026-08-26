import { describe, expect, it } from 'vitest';
import { GROUP_WRITE_MEMBER_NAME_CAP } from '../query/bookQuerySourceCaps';
import {
  extractListedMemberNames,
  inferGroupNameFromContext,
  isReplyToGroupNamingPrompt,
  parseOrganizationRelationshipWrite,
  parseOrganizationSiteWrite,
  recoverListedMemberNamesFromHistory,
  resolveGroupWriteMemberNames,
} from './groupWriteService';

describe('groupWriteService helpers', () => {
  it('parses hierarchy and connected-group chat edits', () => {
    expect(parseOrganizationRelationshipWrite('make Robotics a department under Vanguard Robotics')).toEqual({
      fromName: 'Robotics',
      toName: 'Vanguard Robotics',
      relationshipType: 'part_of',
      action: 'upsert',
      childKind: 'team',
    });
    expect(parseOrganizationRelationshipWrite('Studio Team is a subgroup of MemoVault')).toEqual({
      fromName: 'Studio Team',
      toName: 'MemoVault',
      relationshipType: 'part_of',
      action: 'upsert',
      childKind: 'team',
    });
    expect(parseOrganizationRelationshipWrite('Robotics is a job at Vanguard Robotics')).toEqual({
      fromName: 'Robotics',
      toName: 'Vanguard Robotics',
      relationshipType: 'part_of',
      action: 'upsert',
      childKind: 'team',
    });
    expect(parseOrganizationRelationshipWrite('connect Vanguard Robotics with MemoVault')).toEqual({
      fromName: 'Vanguard Robotics',
      toName: 'MemoVault',
      relationshipType: 'affiliated_with',
      action: 'upsert',
    });
    expect(parseOrganizationRelationshipWrite('disconnect Robotics from Vanguard Robotics')).toEqual({
      fromName: 'Robotics',
      toName: 'Vanguard Robotics',
      relationshipType: 'affiliated_with',
      action: 'remove',
    });
    expect(parseOrganizationRelationshipWrite('Jamie is going to the store')).toBeNull();
    expect(parseOrganizationRelationshipWrite('make Field Crew a team at Northwind Depot under Northwind Logistics')).toEqual({
      fromName: 'Field Crew',
      toName: 'Northwind Logistics',
      relationshipType: 'part_of',
      action: 'upsert',
      childKind: 'team',
      locationName: 'Northwind Depot',
    });
    expect(parseOrganizationRelationshipWrite('QA Lab is a department at the Hollywood lab of Vanguard Robotics')).toEqual({
      fromName: 'QA Lab',
      toName: 'Vanguard Robotics',
      relationshipType: 'part_of',
      action: 'upsert',
      childKind: 'team',
      locationName: 'Hollywood lab',
    });
    expect(parseOrganizationRelationshipWrite('Field Crew belongs to Northwind Logistics at Northwind Depot')).toEqual({
      fromName: 'Field Crew',
      toName: 'Northwind Logistics',
      relationshipType: 'part_of',
      action: 'upsert',
      childKind: 'team',
      locationName: 'Northwind Depot',
    });
    expect(parseOrganizationSiteWrite('add Northwind Depot as a location of Northwind Logistics')).toEqual({
      organizationName: 'Northwind Logistics',
      locationName: 'Northwind Depot',
    });
    expect(parseOrganizationSiteWrite('Vanguard Robotics has a lab in Hollywood')).toEqual({
      organizationName: 'Vanguard Robotics',
      locationName: 'Hollywood',
    });
  });

  it('extracts a comma/and roster list', () => {
    expect(
      extractListedMemberNames(
        'So far we have NeonPulse, VelvetFox, LumaJade, Star Bats, and Neon Pixie',
      ),
    ).toEqual(['NeonPulse', 'VelvetFox', 'LumaJade', 'Star Bats', 'Neon Pixie']);
  });

  it(`caps roster extraction at ${GROUP_WRITE_MEMBER_NAME_CAP} names`, () => {
    const names = Array.from({ length: GROUP_WRITE_MEMBER_NAME_CAP + 10 }, (_, i) => `Person${i}`);
    const extracted = extractListedMemberNames(`Members are ${names.join(', ')}`);
    expect(extracted).toHaveLength(GROUP_WRITE_MEMBER_NAME_CAP);
  });

  it('does not turn Groups and Organizations Book UI language into members', () => {
    expect(
      extractListedMemberNames(
        'It should be in the Groups and Organizations book. The individual characters need cards.',
      ),
    ).toEqual([]);
    expect(
      extractListedMemberNames(
        'It should be in Groups, and Organizations Book. Make cards for the people.',
      ),
    ).toEqual([]);
    expect(extractListedMemberNames('can you make the group now')).toEqual([]);
  });

  it('extracts explicit add-to-group instructions without a comma', () => {
    expect(extractListedMemberNames('Add Marcus and Jamie to the group')).toEqual([
      'Marcus',
      'Jamie',
    ]);
  });

  it('recovers the latest explicit roster for a follow-up write request', () => {
    const history = [
      { role: 'user', content: 'make a group for that' },
      { role: 'assistant', content: 'Who belongs in it?' },
      { role: 'user', content: 'So far we have Marcus, Jamie, and Nova Reed' },
      { role: 'assistant', content: 'What should it be called?' },
    ];

    expect(
      recoverListedMemberNamesFromHistory(
        'The individual characters should have Character Book cards too.',
        history,
      ),
    ).toEqual(['Marcus', 'Jamie', 'Nova Reed']);
    expect(
      recoverListedMemberNamesFromHistory('well I just gave you a roster', history),
    ).toEqual(['Marcus', 'Jamie', 'Nova Reed']);
    expect(
      recoverListedMemberNamesFromHistory('hi so can you do it now', history),
    ).toEqual(['Marcus', 'Jamie', 'Nova Reed']);
    expect(resolveGroupWriteMemberNames('hi so can you do it now', history)).toEqual([
      'Marcus',
      'Jamie',
      'Nova Reed',
    ]);
  });

  it('does not reuse an old roster for an unrelated new-group request', () => {
    expect(
      recoverListedMemberNamesFromHistory('make a new group for designers', [
        { role: 'user', content: 'Members are Marcus, Jamie, and Nova Reed' },
      ]),
    ).toEqual([]);
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
