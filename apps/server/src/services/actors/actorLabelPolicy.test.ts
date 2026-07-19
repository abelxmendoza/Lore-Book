import { describe, expect, it } from 'vitest';

import {
  classifyActorLabel,
  isSelfActorLabel,
  isVagueActorLabel,
  isVagueOrIndefiniteActorPhrase,
  mayPromoteToCharacter,
} from './actorLabelPolicy';
import { enrichActorLabel } from './enrichActorLabel';

describe('actorLabelPolicy', () => {
  it('rejects indefinite person references', () => {
    for (const label of ['one girl', 'this guy', 'that woman', 'some person', 'a dude']) {
      expect(isVagueOrIndefiniteActorPhrase(label)).toBe(true);
      expect(classifyActorLabel(label).action).toBe('reject');
      expect(mayPromoteToCharacter(label)).toBe(false);
    }
  });

  it('rejects vague collectives without role context', () => {
    for (const label of [
      'other girls',
      'people in the scene',
      'people in',
      'friends',
      'coworkers',
      'popular egirls',
      'people',
    ]) {
      expect(isVagueActorLabel(label)).toBe(true);
      expect(classifyActorLabel(label).action).toBe('reject');
      expect(mayPromoteToCharacter(label)).toBe(false);
    }
  });

  it('rejects self / narrator labels', () => {
    expect(isSelfActorLabel('You')).toBe(true);
    expect(isSelfActorLabel('Also You')).toBe(true);
    expect(classifyActorLabel('Also You').reason).toBe('self');
  });

  it('keeps named people as PERSON', () => {
    expect(classifyActorLabel('Marcus')).toEqual(
      expect.objectContaining({ actorType: 'PERSON', action: 'person' }),
    );
    expect(mayPromoteToCharacter('Jamie')).toBe(true);
  });

  it('classifies contextual groups as GROUP', () => {
    const c = classifyActorLabel('Other girls who reposted allegations on Instagram');
    expect(c.action).toBe('group');
    expect(c.actorType).toBe('GROUP');
    expect(isVagueActorLabel('Other girls who reposted allegations on Instagram')).toBe(false);
  });

  it('classifies scene communities with discussion context', () => {
    const c = classifyActorLabel('Members of the LA ska scene discussing the incident');
    expect(c.action).toBe('group');
    expect(['GROUP', 'COMMUNITY']).toContain(c.actorType);
  });

  it('tags contextual anonymous individuals', () => {
    const c = classifyActorLabel('Anonymous woman at Northwind Depot');
    expect(c.action).toBe('anonymous');
    expect(c.actorType).toBe('ANONYMOUS_PERSON');
    expect(mayPromoteToCharacter('Anonymous woman at Northwind Depot')).toBe(false);
  });
});

describe('enrichActorLabel', () => {
  it('enriches vague group labels with action context', () => {
    const result = enrichActorLabel({
      raw: 'other girls',
      messageText: 'other girls who reposted allegations about the incident on Instagram',
      asGroup: true,
    });
    expect(result.enriched).toBe(true);
    expect(result.label.toLowerCase()).toMatch(/girl|women/);
    expect(result.label.length).toBeGreaterThan('other girls'.length);
  });

  it('leaves already-contextual labels alone', () => {
    const label = 'Friends who attended Anime Expo Afters';
    const result = enrichActorLabel({ raw: label, messageText: label });
    expect(result.enriched).toBe(false);
    expect(result.label).toBe(label);
  });
});
