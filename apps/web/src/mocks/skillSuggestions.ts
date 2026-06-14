import type { SkillSuggestion } from '../api/skills';

export const MOCK_SKILL_BOOK_NAMES = [
  'Python Programming', 'Guitar Playing', 'Public Speaking', 'Cooking', 'Photography',
  'Running', 'Meditation', 'Writing', 'Drawing', 'Swimming',
];

export function getMockSkillSuggestions(): SkillSuggestion[] {
  return [
    {
      id: 'sug-react',
      skill_name: 'React',
      skill_category: 'technical',
      skill_type: 'technical',
      monetization: 'paid',
      proficiency: 72,
      confidence: 0.86,
      enjoyment: 78,
      usage_frequency: 'daily',
      trajectory: 'improving',
      description: 'Building LoreBook frontend in React and TypeScript',
      origin_story: 'Learned through CS coursework and side projects',
      related_projects: ['LoreBook'],
      evidence: ['I\'m building LoreBook in React and Supabase'],
      source: 'chat',
    },
    {
      id: 'sug-muay-thai',
      skill_name: 'Muay Thai',
      skill_category: 'physical',
      skill_type: 'physical',
      monetization: 'potentially_paid',
      proficiency: 68,
      confidence: 0.82,
      enjoyment: 90,
      usage_frequency: 'weekly',
      trajectory: 'improving',
      description: 'Combat sport training with competitive record',
      origin_story: 'Started training for discipline and fitness',
      evidence: ['I\'m 6-0 in Muay Thai'],
      source: 'chat',
    },
    {
      id: 'sug-cooking',
      skill_name: 'Line Cooking',
      skill_category: 'professional',
      skill_type: 'professional',
      monetization: 'paid',
      proficiency: 75,
      confidence: 0.8,
      enjoyment: 55,
      usage_frequency: 'rarely',
      trajectory: 'stagnant',
      description: 'Fast-paced kitchen operations from restaurant work',
      origin_story: 'Worked as a line cook at Chipotle and El Pollo Loco',
      related_jobs: ['Chipotle', 'El Pollo Loco'],
      evidence: ['I worked as a line cook at Chipotle'],
      source: 'journal',
    },
  ];
}
