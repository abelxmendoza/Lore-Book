import { describe, expect, it } from 'vitest';

import { resolveSkillCanonical } from './skillCanonicalResolver';
import {
  classifySkillBookMatch,
  clusterRelatedBookSkills,
  clusterSkillSuggestionsByCanonical,
  findSimilarExistingSkill,
  matchDetectedSkillToBook,
} from './skillSimilarityResolver';

const book = [
  { id: 'skill-ai', name: 'AI-Assisted Coding' },
  { id: 'skill-frontend', name: 'Front-End Development' },
  { id: 'skill-debug', name: 'Software Debugging' },
  { id: 'skill-social', name: 'Socializing' },
  { id: 'skill-dance', name: 'Club Dancing' },
  { id: 'skill-product', name: 'Software Product Development' },
  { id: 'skill-interview', name: 'Interviewing' },
];

describe('skill suggestion book matching', () => {
  it('treats AI coding tool names as the existing AI-Assisted Coding skill', () => {
    const match = classifySkillBookMatch('AI Coding Tools', book);
    expect(match.status).toBe('existing');
    expect(match.matchedName).toBe('AI-Assisted Coding');
  });

  it('treats AI-Assisted Development as the same capability as AI-Assisted Coding', () => {
    expect(classifySkillBookMatch('AI-Assisted Development', book).status).toBe('existing');
  });

  it('hides Dance when Club Dancing is already in the book', () => {
    const match = classifySkillBookMatch('Dance', book);
    expect(match.status).toBe('existing');
    expect(match.matchedName).toBe('Club Dancing');
  });

  it('hides Frontend Development when Front-End Development is already in the book', () => {
    expect(classifySkillBookMatch('Frontend Development', book).status).toBe('existing');
  });

  it('hides Debugging when Software Debugging is already in the book', () => {
    expect(classifySkillBookMatch('Debugging', book).status).toBe('existing');
  });

  it('hides LoreBook app development when software product development is already in the book', () => {
    expect(classifySkillBookMatch('LoreBook App Development', book).matchedName).toBe(
      'Software Product Development',
    );
    expect(classifySkillBookMatch('LoreBook App Development', book).status).toBe('existing');
  });

  it('collapses goth-scene socializing variants into Socializing already in the book', () => {
    expect(resolveSkillCanonical('Socializing at Goth Clubs').canonicalTitle).toBe('Social Interaction');
    expect(classifySkillBookMatch('Socializing at Goth Clubs', book).status).toBe('existing');
    expect(classifySkillBookMatch('Socializing in Goth/Underground Scenes', book).status).toBe('existing');
  });

  it('clusters duplicate pending suggestions onto one canonical skill', () => {
    const clustered = clusterSkillSuggestionsByCanonical([
      { skill_name: 'Family Care Coordination', confidence: 0.9 },
      { skill_name: 'Family Caregiving / Errand Running', confidence: 0.88 },
      { skill_name: 'Networking', confidence: 0.82 },
    ]);
    expect(clustered.map((row) => row.skill_name)).toEqual([
      'Family Care Coordination',
      'Networking',
    ]);
  });

  it('does not treat Networking as already in the book', () => {
    expect(classifySkillBookMatch('Networking', book).status).toBe('new');
  });

  it('marks Job Search / Interviewing as similar to Interviewing via name overlap', () => {
    expect(classifySkillBookMatch('Job Search / Interviewing', book).status).toBe('similar');
    const match = matchDetectedSkillToBook('Job Search / Interviewing', book);
    expect(match.match_status).toBe('similar');
    expect(match.matched_book_name).toBe('Interviewing');
  });

  it('still finds a similar book skill via token overlap when aliases miss', () => {
    const similar = findSimilarExistingSkill('Raspberry Pi Programming Workshop', [
      { name: 'Raspberry Pi Programming' },
    ]);
    expect(similar.method).toBe('fuzzy');
    expect(similar.match?.name).toBe('Raspberry Pi Programming');
    expect(classifySkillBookMatch('Raspberry Pi Programming Workshop', [
      { id: 'skill-rpi', name: 'Raspberry Pi Programming' },
    ]).status).toBe('similar');
  });

  it('treats Web UI Development as the existing Front-End Development skill', () => {
    expect(classifySkillBookMatch('Web UI Development', book).status).toBe('existing');
    expect(classifySkillBookMatch('Web UI Development', book).matchedName).toBe('Front-End Development');
  });

  it('treats Prototyping as the same capability as Hardware Prototyping', () => {
    const hardwareBook = [{ id: 'skill-hw', name: 'Hardware Prototyping' }];
    expect(classifySkillBookMatch('Prototyping', hardwareBook).status).toBe('existing');
  });

  it('clusters related book cards so the user can query merge candidates', () => {
    const clusters = clusterRelatedBookSkills([
      { id: 'a', name: 'Front-End Development' },
      { id: 'b', name: 'Web UI Development' },
      { id: 'c', name: 'Muay Thai' },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members.map((row) => row.name)).toEqual([
      'Front-End Development',
      'Web UI Development',
    ]);
  });
});
