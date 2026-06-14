import { describe, it, expect } from 'vitest';
import { extractedToProfile, mergeSkillProfiles } from './skillProfile';

describe('skillProfile', () => {
  it('merges evidence and keeps higher proficiency', () => {
    const base = extractedToProfile({
      skill_name: 'React',
      skill_category: 'technical',
      skill_type: 'technical',
      monetization: 'paid',
      proficiency: 60,
      confidence: 0.7,
      enjoyment: 70,
      usage_frequency: 'weekly',
      trajectory: 'improving',
      evidence: ['Built a dashboard'],
    });

    const incoming = extractedToProfile({
      skill_name: 'React',
      skill_category: 'technical',
      skill_type: 'technical',
      monetization: 'paid',
      proficiency: 75,
      confidence: 0.85,
      enjoyment: 80,
      usage_frequency: 'daily',
      trajectory: 'improving',
      evidence: ['Building LoreBook in React'],
    }, 'msg-1');

    const merged = mergeSkillProfiles(base, incoming);
    expect(merged.proficiency).toBe(75);
    expect(merged.usage_frequency).toBe('daily');
    expect(merged.evidence?.length).toBe(2);
  });
});
