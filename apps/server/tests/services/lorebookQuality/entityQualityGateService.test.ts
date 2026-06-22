import { describe, it, expect } from 'vitest';

import { evaluateEntityQuality, passesEntityQualityGate, resolveDisplayName } from '../../../src/services/lorebook/quality/entityQualityGateService';

describe('entityQualityGateService — acceptance corpus', () => {
  const rejectCases: Array<{ name: string; domain: Parameters<typeof evaluateEntityQuality>[0]['domain'] }> = [
    { name: 'Mr', domain: 'characters' },
    { name: 'Professor', domain: 'characters' },
    { name: 'project', domain: 'projects' },
    { name: 'and', domain: 'projects' },
    { name: 'house', domain: 'locations' },
    { name: 'school', domain: 'schools' },
    { name: 'friends', domain: 'groups' },
    { name: 'party', domain: 'events' },
    { name: 'show', domain: 'events' },
    { name: 'app', domain: 'projects' },
    { name: 'company', domain: 'organizations' },
    { name: 'soon', domain: 'timeline' },
    { name: 'fixing', domain: 'skills' },
    { name: 'friend', domain: 'relationships' },
    { name: 'Find My app', domain: 'projects' },
  ];

  it.each(rejectCases)('rejects bare garbage "$name" in $domain', ({ name, domain }) => {
    const verdict = evaluateEntityQuality({ name, domain, contextText: name });
    expect(verdict.gate).toBe('reject');
    expect(passesEntityQualityGate(verdict)).toBe(false);
  });

  const allowCases: Array<{
    name: string;
    domain: Parameters<typeof evaluateEntityQuality>[0]['domain'];
    contextText?: string;
  }> = [
    { name: 'Mr. Morten', domain: 'characters' },
    { name: 'Professor from Japanese Class', domain: 'characters', contextText: 'Professor from Japanese Class' },
    { name: "Tio Ralph's house", domain: 'locations' },
    { name: 'Friends from Football Team', domain: 'groups', contextText: 'Friends from Football Team' },
    { name: "Leslie's Graduation Party", domain: 'events' },
    { name: 'Potential Investor from Antler', domain: 'relationships', contextText: 'Potential Investor from Antler' },
    { name: 'LoreBook', domain: 'projects' },
    { name: 'Omega-1', domain: 'projects' },
    { name: 'bike repair', domain: 'skills' },
    { name: 'Vanguard Robotics', domain: 'organizations' },
    { name: 'CSUF', domain: 'schools' },
    { name: 'Walmart', domain: 'locations' },
  ];

  it.each(allowCases)('allows meaningful entity "$name" in $domain', ({ name, domain, contextText }) => {
    const verdict = evaluateEntityQuality({
      name,
      domain,
      contextText: contextText ?? name,
    });
    expect(passesEntityQualityGate(verdict)).toBe(true);
    expect(verdict.gate).not.toBe('reject');
  });

  it('contextualizes generic group label when context provides anchor', () => {
    const verdict = evaluateEntityQuality({
      name: 'friends',
      domain: 'groups',
      contextText: 'My friends from the football team were there.',
    });
    expect(['contextualize', 'allow']).toContain(verdict.gate);
    if (verdict.gate === 'contextualize') {
      expect(resolveDisplayName({ name: 'friends', domain: 'groups' }, verdict)).toMatch(/football/i);
    }
  });

  it('rejects duplicate when canon already knows the project', () => {
    const verdict = evaluateEntityQuality(
      { name: 'LoreBook', domain: 'projects', contextText: 'Working on LoreBook again.' },
      { knownInBook: new Set(['LoreBook']), knownInBookIds: new Map([['lorebook', 'p1']]) }
    );
    expect(verdict.gate).toBe('reject');
    expect(verdict.rejectionReason).toMatch(/duplicate/i);
  });

  it('routes private residence to review', () => {
    const verdict = evaluateEntityQuality({
      name: "Tio Ralph's house",
      domain: 'locations',
      contextText: "We stayed at Tio Ralph's house.",
    });
    expect(verdict.gate).toBe('review');
    expect(verdict.requiresReview).toBe(true);
  });
});
