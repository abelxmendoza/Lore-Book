import { describe, expect, it } from 'vitest';
import type { Skill } from '../types/skill';
import { findRelatedBookSkills } from './skillRelated';

function skill(id: string, skill_name: string, extras: Partial<Skill> = {}): Skill {
  return {
    id,
    user_id: 'mock-user',
    skill_name,
    skill_category: 'technical',
    current_level: 3,
    total_xp: 100,
    xp_to_next_level: 50,
    practice_count: 4,
    auto_detected: true,
    confidence_score: 0.8,
    is_active: true,
    first_mentioned_at: '2026-01-01T00:00:00.000Z',
    last_practiced_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    description: '',
    metadata: {},
    ...extras,
  };
}

describe('findRelatedBookSkills', () => {
  it('pairs a shorter skill name with a more specific cousin', () => {
    const related = findRelatedBookSkills(skill('p', 'Prototyping'), [
      skill('hw', 'Hardware Prototyping'),
      skill('muay', 'Muay Thai', { skill_category: 'physical' }),
    ]);
    expect(related.map((row) => row.skill_name)).toEqual(['Hardware Prototyping']);
  });
});
