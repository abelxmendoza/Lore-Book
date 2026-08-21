import { describe, expect, it } from 'vitest';

import { evaluateSuggestionAcceptance } from './suggestionAcceptanceGate';
import { mapSuggestionDomainsToApplyDomains, operationMatchesApplyDomains } from './suggestionApplyDomains';
import { createCrossBookIndex } from '../../lexical/projects/projectCrossBookGuard';
import { hasRomanticSignals } from '../../ontology/romanticIntelligence';

describe('suggestionApplyDomains', () => {
  it('maps a Places rescan to locations writes only', () => {
    expect(mapSuggestionDomainsToApplyDomains(['locations'])).toEqual(['locations']);
    expect(operationMatchesApplyDomains('quests', ['locations'])).toBe(false);
    expect(operationMatchesApplyDomains('locations', ['locations'])).toBe(true);
  });

  it('maps Groups to organization/group/school writes', () => {
    expect(mapSuggestionDomainsToApplyDomains(['organizations'])).toEqual(
      expect.arrayContaining(['organizations', 'groups', 'schools']),
    );
  });

  it('does not let Love Story rescan seed other books', () => {
    expect(mapSuggestionDomainsToApplyDomains(['romantic'])).toEqual([]);
  });
});

describe('suggestionAcceptanceGate — synthetic contamination corpus', () => {
  const personCanon = createCrossBookIndex({ characters: ['Shyla'] });
  const orgCanon = createCrossBookIndex({ organizations: ['USC', 'University of Southern California'] });

  it('does not let a canonical person become a Place', () => {
    const result = evaluateSuggestionAcceptance({
      name: 'Shyla',
      domain: 'locations',
      evidence: 'Shyla walked into the lounge',
      qualityContext: { crossBook: personCanon },
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toMatch(/person|dal_person|known_as_person/i);
  });

  it('does not let a place become a Character', () => {
    const result = evaluateSuggestionAcceptance({
      name: 'Riverside Park',
      domain: 'characters',
      qualityContext: { crossBook: createCrossBookIndex({ places: ['Riverside Park'] }) },
    });
    expect(result.accept).toBe(false);
  });

  it('classifies USC as a university, not a generic company', () => {
    const result = evaluateSuggestionAcceptance({
      name: 'USC',
      domain: 'organizations',
      evidence: 'Xingpeng graduated from USC.',
    });
    expect(result.accept).toBe(true);
    expect(result.organizationType).toBe('university');
  });

  it('keeps software tools out of Character and company membership', () => {
    expect(
      evaluateSuggestionAcceptance({ name: 'Claude Code', domain: 'characters', evidence: 'I use Claude Code' }).accept,
    ).toBe(false);
    const org = evaluateSuggestionAcceptance({
      name: 'Claude Code',
      domain: 'organizations',
      evidence: 'I use Claude Code to write tests',
    });
    expect(org.organizationType).toBe('software');
    expect(org.reason).toBe('software_tool_labeled');
  });

  it('rejects generic department phrases and accepts a grounded team', () => {
    expect(
      evaluateSuggestionAcceptance({ name: 'Failure Analysis', domain: 'organizations' }).accept,
    ).toBe(false);
    expect(
      evaluateSuggestionAcceptance({ name: 'Support Team', domain: 'organizations' }).accept,
    ).toBe(false);
    expect(
      evaluateSuggestionAcceptance({
        name: 'Acme Failure Analysis Team',
        domain: 'organizations',
        evidence: 'I joined the Acme Failure Analysis Team',
      }).accept,
    ).toBe(true);
  });

  it('does not promote her friend or a job title into Characters', () => {
    expect(evaluateSuggestionAcceptance({ name: 'her friend', domain: 'characters' }).accept).toBe(false);
    expect(
      evaluateSuggestionAcceptance({ name: 'Quality Assurance Technician', domain: 'characters' }).accept,
    ).toBe(false);
  });

  it('rejects academic disciplines and malformed venue spans as Places', () => {
    expect(
      evaluateSuggestionAcceptance({ name: 'Electrical Engineering', domain: 'locations' }).accept,
    ).toBe(false);
    expect(
      evaluateSuggestionAcceptance({ name: 'User mentioned', domain: 'locations' }).accept,
    ).toBe(false);
    expect(
      evaluateSuggestionAcceptance({ name: 'Catch One because I', domain: 'locations' }).accept,
    ).toBe(false);
  });

  it('allows an explicit visit as a Place projection without treating third-party school as a visit', () => {
    const visit = evaluateSuggestionAcceptance({
      name: 'USC',
      domain: 'locations',
      evidence: 'I went to USC yesterday.',
      qualityContext: { crossBook: orgCanon },
    });
    expect(visit.accept).toBe(true);
    expect(visit.placeRole).toBe('protagonist_visit');

    const third = evaluateSuggestionAcceptance({
      name: 'USC',
      domain: 'locations',
      evidence: 'Xingpeng graduated from USC.',
      qualityContext: { crossBook: orgCanon },
    });
    expect(third.accept).toBe(false);
    expect(third.placeRole).toBe('third_party');
  });

  it('rejects one-off behavior as a Skill and dedupes similar skill labels', () => {
    expect(
      evaluateSuggestionAcceptance({
        name: 'Socializing at Goth Clubs',
        domain: 'skills',
        evidence: 'I went to a goth club last night',
      }).accept,
    ).toBe(false);

    const python = evaluateSuggestionAcceptance({
      name: 'Python',
      domain: 'skills',
      evidence: 'I write Python at Vanguard Robotics',
    });
    expect(python.accept).toBe(true);

    const dup = evaluateSuggestionAcceptance({
      name: 'Socializing in Goth/Underground Scenes',
      domain: 'skills',
      evidence: 'I have been practicing socializing in goth/underground scenes',
      knownSkillNames: ['Socializing at Goth Clubs'],
    });
    expect(dup.decision).toBe('POSSIBLE_DUPLICATE');
    expect(dup.duplicateOf).toBe('Socializing at Goth Clubs');
  });

  it('rejects past actions and fragments as Quests, and accepts an explicit future goal', () => {
    expect(
      evaluateSuggestionAcceptance({
        name: 'Run yesterday',
        domain: 'quests',
        evidence: 'I ran yesterday.',
      }).accept,
    ).toBe(false);
    expect(
      evaluateSuggestionAcceptance({
        name: 'that was a',
        domain: 'quests',
        evidence: 'that was a failed',
      }).accept,
    ).toBe(false);
    expect(
      evaluateSuggestionAcceptance({
        name: 'you completely',
        domain: 'quests',
        evidence: 'you completely',
      }).accept,
    ).toBe(false);
    const resume = evaluateSuggestionAcceptance({
      name: 'Finish my resume',
      domain: 'quests',
      evidence: 'I need to finish my resume',
    });
    expect(resume.accept).toBe(true);
  });

  it('rejects a one-off event as a Project and allows a durable named project', () => {
    expect(
      evaluateSuggestionAcceptance({
        name: 'one interview',
        domain: 'projects',
        evidence: 'I had one interview today',
      }).accept,
    ).toBe(false);
    expect(
      evaluateSuggestionAcceptance({
        name: 'LoreBook',
        domain: 'projects',
        evidence: "I'm building LoreBook",
      }).accept,
    ).toBe(true);
  });

  it('does not infer romance from a club acquaintance, but does from explicit dating', () => {
    expect(hasRomanticSignals('I met Jamie at a club and got her Instagram')).toBe(false);
    expect(hasRomanticSignals("I'm dating Jamie")).toBe(true);
    expect(
      evaluateSuggestionAcceptance({
        name: 'Jamie',
        domain: 'relationships',
        evidence: 'I met Jamie at a club and got her Instagram',
      }).accept,
    ).toBe(false);
    expect(
      evaluateSuggestionAcceptance({
        name: 'Jamie',
        domain: 'relationships',
        evidence: "I'm dating Jamie",
      }).accept,
    ).toBe(true);
  });

  it('lowers confidence for ambiguous organization types and zeros obvious noise', () => {
    const noise = evaluateSuggestionAcceptance({ name: 'User mentioned', domain: 'locations' });
    expect(noise.confidenceAfter).toBe(0);
    expect(noise.decision).toBe('REJECTED_NOISE');

    const ambiguous = evaluateSuggestionAcceptance({
      name: 'Northwind Analytics',
      domain: 'organizations',
      evidence: 'I talked to someone at Northwind Analytics',
      confidence: 0.9,
    });
    expect(ambiguous.accept).toBe(true);
    expect(ambiguous.decision).toBe('AMBIGUOUS_TYPE');
    expect(ambiguous.confidenceAfter).toBeLessThanOrEqual(0.42);
  });

  it('suppresses an already-accepted canonical entity and acronym aliases', () => {
    const exact = evaluateSuggestionAcceptance({
      name: 'Vanguard Robotics',
      domain: 'organizations',
      evidence: 'I work at Vanguard Robotics',
      qualityContext: { knownInBook: new Set(['Vanguard Robotics']) },
    });
    expect(exact.accept).toBe(false);
    expect(exact.decision).toBe('POSSIBLE_DUPLICATE');
    expect(exact.attach?.decision).toBe('ATTACH_EXACT');
    expect(exact.attach?.suggestionSuppressed).toBe(true);

    const acronym = evaluateSuggestionAcceptance({
      name: 'USC',
      domain: 'organizations',
      evidence: 'Xingpeng graduated from USC',
      qualityContext: { knownInBook: new Set(['University of Southern California']) },
    });
    expect(acronym.accept).toBe(false);
    expect(acronym.decision).toBe('POSSIBLE_DUPLICATE');
    expect(acronym.duplicateOf).toBe('University of Southern California');
    expect(acronym.attach?.decision).toBe('ATTACH_ALIAS');
    expect(acronym.attach?.matchBasis).toBe('acronym_match');
  });

  it('classifies a mixed conversation without cross-book contamination', () => {
    const story = [
      'Maya and I talked after class.',
      'Xingpeng graduated from USC.',
      'I use Claude Code every day.',
      'Failure Analysis keeps slipping into the notes.',
      'I write Python at Vanguard Robotics.',
      'I ran yesterday.',
      'I need to finish my resume.',
      'I went out with her friend.',
    ].join(' ');

    expect(evaluateSuggestionAcceptance({ name: 'Maya', domain: 'characters', evidence: story }).accept).toBe(true);
    const usc = evaluateSuggestionAcceptance({ name: 'USC', domain: 'organizations', evidence: story });
    expect(usc.organizationType).toBe('university');
    expect(usc.canonicalType).not.toBe('employer');
    expect(evaluateSuggestionAcceptance({ name: 'USC', domain: 'locations', evidence: 'Xingpeng graduated from USC.' }).accept).toBe(
      false,
    );
    expect(evaluateSuggestionAcceptance({ name: 'Claude Code', domain: 'characters', evidence: story }).accept).toBe(false);
    expect(evaluateSuggestionAcceptance({ name: 'Claude Code', domain: 'organizations', evidence: story }).organizationType).toBe(
      'software',
    );
    expect(evaluateSuggestionAcceptance({ name: 'Failure Analysis', domain: 'organizations', evidence: story }).accept).toBe(
      false,
    );
    expect(
      evaluateSuggestionAcceptance({ name: 'Python', domain: 'skills', evidence: 'I write Python at Vanguard Robotics' }).accept,
    ).toBe(true);
    expect(evaluateSuggestionAcceptance({ name: 'Run yesterday', domain: 'quests', evidence: 'I ran yesterday.' }).accept).toBe(
      false,
    );
    expect(
      evaluateSuggestionAcceptance({
        name: 'Finish my resume',
        domain: 'quests',
        evidence: 'I need to finish my resume',
      }).accept,
    ).toBe(true);
    expect(evaluateSuggestionAcceptance({ name: 'her friend', domain: 'characters', evidence: story }).accept).toBe(false);
  });

  it('keeps tenant canon from leaking across users', () => {
    const userA = evaluateSuggestionAcceptance({
      name: 'Shyla',
      domain: 'locations',
      evidence: 'We met at the lounge',
      qualityContext: { userId: 'user-a', crossBook: createCrossBookIndex({ characters: ['Shyla'] }) },
    });
    const userB = evaluateSuggestionAcceptance({
      name: 'Harbor Pier',
      domain: 'locations',
      evidence: 'I went to Harbor Pier',
      qualityContext: { userId: 'user-b', crossBook: createCrossBookIndex({ characters: ['Shyla'] }) },
    });
    expect(userA.accept).toBe(false);
    expect(userB.accept).toBe(true);
    expect(userB.reason).not.toMatch(/person|dal_person|known_as_person/i);
  });
});
