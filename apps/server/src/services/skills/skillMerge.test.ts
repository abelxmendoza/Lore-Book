import { describe, expect, it } from 'vitest';

import { foldSkillSurvivor, isMatchableBookSkill, readSkillAliases, uniqSkillNames } from './skillMerge';
import type { Skill } from './skillService';

function skill(partial: Partial<Skill> & Pick<Skill, 'id' | 'skill_name'>): Skill {
  return {
    user_id: 'user-1',
    skill_category: 'technical',
    current_level: 1,
    total_xp: 0,
    xp_to_next_level: 100,
    description: null,
    first_mentioned_at: '2026-06-01T00:00:00.000Z',
    last_practiced_at: null,
    practice_count: 0,
    auto_detected: true,
    confidence_score: 0.5,
    is_active: true,
    metadata: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

describe('skill merge helpers', () => {
  it('folds a related skill into aliases, XP, and profile evidence', () => {
    const target = skill({
      id: 'keep',
      skill_name: 'AI-Assisted Coding',
      total_xp: 40,
      practice_count: 2,
      description: 'Using AI tools to ship features.',
      metadata: {
        aliases: ['AI coding'],
        skill_profile: {
          skill_type: 'technical',
          monetization: 'potentially_paid',
          proficiency: 68,
          enjoyment: 74,
          usage_frequency: 'daily',
          trajectory: 'improving',
          related_projects: ['MemoVault'],
          evidence: [],
        },
      },
    });
    const source = skill({
      id: 'drop',
      skill_name: 'AI-Assisted Development',
      total_xp: 10,
      practice_count: 1,
      last_practiced_at: '2026-08-12T22:02:47.000Z',
      description: 'Building with AI pair programming.',
      metadata: {
        skill_profile: {
          skill_type: 'technical',
          monetization: 'potentially_paid',
          proficiency: 57,
          enjoyment: 68,
          usage_frequency: 'weekly',
          trajectory: 'improving',
          related_jobs: ['Vanguard Robotics'],
          evidence: [{ text: 'Used AI tools while prototyping MemoVault' }],
        },
      },
    });

    const folded = foldSkillSurvivor(target, source);
    expect(folded.aliases).toEqual(expect.arrayContaining(['AI coding', 'AI-Assisted Development']));
    expect(folded.aliases).not.toContain('AI-Assisted Coding');
    expect(folded.total_xp).toBe(50);
    expect(folded.practice_count).toBe(3);
    expect(folded.skill_profile.related_projects).toContain('MemoVault');
    expect(folded.skill_profile.related_jobs).toContain('Vanguard Robotics');
    expect(folded.description).toContain('Using AI tools');
    expect(folded.description).toContain('pair programming');
  });

  it('skips archived skills when matching suggestions to the book', () => {
    expect(isMatchableBookSkill({ is_active: true, metadata: {} })).toBe(true);
    expect(isMatchableBookSkill({ is_active: false, metadata: {} })).toBe(false);
    expect(isMatchableBookSkill({ is_active: true, metadata: { archived: true } })).toBe(false);
  });

  it('dedupes alias names by normalized key', () => {
    expect(uniqSkillNames(['Front-End Development'], 'front-end development')).toEqual([
      'Front-End Development',
    ]);
    expect(readSkillAliases({ aliases: ['Club Dancing', '', 12] })).toEqual(['Club Dancing']);
  });
});
