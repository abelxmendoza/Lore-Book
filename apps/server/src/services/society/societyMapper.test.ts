import { describe, expect, it } from 'vitest';

import {
  extractEmployerNames,
  extractPublicEntityNames,
  extractSignalCategories,
  HIRING_PLACEMENT_SIGNAL,
  STAFFING_SIGNAL,
} from './signals';
import { mapSociety, type SocietyContext } from './societyMapper';

// Build a context the way the orchestration service would, so the test also
// exercises the shared signal extraction.
function ctx(contextId: string, text: string, members: Array<{ id: string; name: string }>): SocietyContext {
  return {
    contextId,
    members,
    signals: extractSignalCategories(text),
    employerNames: extractEmployerNames(text),
    publicEntityNames: extractPublicEntityNames(text),
    hiringPlacement: HIRING_PLACEMENT_SIGNAL.test(text),
    staffing: STAFFING_SIGNAL.test(text),
    snippet: text.slice(0, 200),
  };
}

describe('society mapper — cross-session group detection', () => {
  it('links an agency to its people and to the workplace ACROSS separate conversations (the Kforce case)', () => {
    const contexts: SocietyContext[] = [
      // The agency + workplace are mentioned in one conversation, with no people.
      ctx('conv:1', "I'm getting hired through Kforce, the staffing agency, for the Amazon job starting late June.", []),
      // Sam appears in a different conversation.
      ctx('conv:2', 'Sam is my recruiter and is handling the onboarding paperwork.', [{ id: 'sam', name: 'Sam' }]),
      // Kelly appears in yet another conversation.
      ctx('conv:3', 'Kelly is doing my onboarding and background check at work.', [{ id: 'kelly', name: 'Kelly' }]),
    ];

    const { clusters, affiliations } = mapSociety(contexts);

    const kforce = clusters.find(c => c.name === 'Kforce');
    expect(kforce).toBeDefined();
    expect(kforce?.group_type).toBe('company');
    expect(kforce?.is_public_entity).toBe(false);
    // Cross-session bridge: Sam and Kelly land under the single employer.
    expect(kforce?.memberIds.sort()).toEqual(['kelly', 'sam']);

    // org↔org: Kforce placed the user at Amazon.
    const link = affiliations.find(a => a.fromName === 'Kforce' && a.toName === 'Amazon');
    expect(link).toBeDefined();
    expect(link?.type).toBe('affiliated_with');
  });

  it('clusters a recurring scene from co-mentions and types it as a scene', () => {
    const contexts: SocietyContext[] = [
      ctx('conv:4', 'Goth Tio and Oscuri threw a goth night at the club.', [
        { id: 'goth_tio', name: 'Goth Tio' }, { id: 'oscuri', name: 'Oscuri' },
      ]),
      ctx('conv:5', 'Hung out with Oscuri and Chino DJing the underground scene.', [
        { id: 'oscuri', name: 'Oscuri' }, { id: 'chino', name: 'Chino' },
      ]),
      ctx('conv:6', 'Goth Tio and Chino were at the underground goth show.', [
        { id: 'goth_tio', name: 'Goth Tio' }, { id: 'chino', name: 'Chino' },
      ]),
    ];

    const { clusters } = mapSociety(contexts);
    const scene = clusters.find(c => c.group_type === 'scene');
    expect(scene).toBeDefined();
    expect(scene?.memberIds.sort()).toEqual(['chino', 'goth_tio', 'oscuri']);
    expect(scene?.membership_model).toBe('fuzzy');
  });

  it('clusters repeated family co-mentions as family, and never mixes a scene name into it', () => {
    const contexts: SocietyContext[] = [
      ctx('conv:7', 'Abuela and Tío Juan came over for family dinner.', [
        { id: 'abuela', name: 'Abuela' }, { id: 'tio_juan', name: 'Tío Juan' },
      ]),
      ctx('conv:8', 'Saw Abuela and Tío Juan again with the whole family.', [
        { id: 'abuela', name: 'Abuela' }, { id: 'tio_juan', name: 'Tío Juan' },
      ]),
      // Goth Tio is a scene collaborator, mentioned with a different person.
      ctx('conv:9', 'Goth Tio and Oscuri ran another goth club night.', [
        { id: 'goth_tio', name: 'Goth Tio' }, { id: 'oscuri', name: 'Oscuri' },
      ]),
    ];

    const { clusters } = mapSociety(contexts);
    const family = clusters.find(c => c.group_type === 'family');
    expect(family).toBeDefined();
    expect(family?.memberIds.sort()).toEqual(['abuela', 'tio_juan']);
    // Guardrail: the scene collaborator must not be pulled into family.
    expect(family?.memberIds).not.toContain('goth_tio');
  });

  it('does not invent a group from a single non-repeating co-mention with no type signal', () => {
    const contexts: SocietyContext[] = [
      ctx('conv:10', 'I bumped into Dave and Karen once.', [
        { id: 'dave', name: 'Dave' }, { id: 'karen', name: 'Karen' },
      ]),
    ];
    const { clusters } = mapSociety(contexts);
    expect(clusters).toHaveLength(0);
  });

  it('keeps two dense communities separate even when they share a bridge mention', () => {
    // A goth clique and a family, linked by ONE window that mentions both.
    const contexts: SocietyContext[] = [
      ctx('s1#0', 'Goth Tio and Oscuri ran the goth night.', [{ id: 'gt', name: 'Goth Tio' }, { id: 'os', name: 'Oscuri' }]),
      ctx('s1#1', 'Oscuri and Chino DJed the underground scene.', [{ id: 'os', name: 'Oscuri' }, { id: 'ch', name: 'Chino' }]),
      ctx('s1#2', 'Goth Tio and Chino at the warehouse goth show.', [{ id: 'gt', name: 'Goth Tio' }, { id: 'ch', name: 'Chino' }]),
      ctx('s2#0', 'Abuela and Tío Juan came for family dinner.', [{ id: 'ab', name: 'Abuela' }, { id: 'tj', name: 'Tío Juan' }]),
      ctx('s2#1', 'My mom and Tío Juan and Abuela at the family party.', [{ id: 'ab', name: 'Abuela' }, { id: 'tj', name: 'Tío Juan' }, { id: 'mom', name: 'Mom' }]),
      ctx('s2#2', 'Mom and Abuela cooked for the family.', [{ id: 'ab', name: 'Abuela' }, { id: 'mom', name: 'Mom' }]),
      // single weak bridge: Oscuri shows up once with Abuela
      ctx('s3#0', 'Abuela met Oscuri once at my show.', [{ id: 'ab', name: 'Abuela' }, { id: 'os', name: 'Oscuri' }]),
    ];

    const { clusters } = mapSociety(contexts);
    const scene = clusters.find(c => c.group_type === 'scene');
    const family = clusters.find(c => c.group_type === 'family');
    expect(scene?.memberIds.sort()).toEqual(['ch', 'gt', 'os']);
    expect(family?.memberIds.sort()).toEqual(['ab', 'mom', 'tj']);
    // The bridge must not fuse the two.
    expect(family?.memberIds).not.toContain('os');
    expect(scene?.memberIds).not.toContain('ab');
  });

  it('does not bridge people to an employer when MULTIPLE employers are present (avoids mis-assignment)', () => {
    const contexts: SocietyContext[] = [
      ctx('conv:11', 'I work for Initech and also did a contract through Globex.', []),
      ctx('conv:12', 'Bob is my coworker at the office.', [{ id: 'bob', name: 'Bob' }]),
    ];
    const { clusters } = mapSociety(contexts);
    const initech = clusters.find(c => c.name === 'Initech');
    // With ambiguity, Bob is NOT auto-attached to either employer.
    expect(initech?.memberIds ?? []).not.toContain('bob');
  });
});
