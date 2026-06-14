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
      description: 'Building the fictional Atlas Notes app in React and TypeScript',
      origin_story: 'Learned through CS coursework and side projects',
      related_projects: ['Atlas Notes'],
      evidence: ['Working on the Atlas Notes frontend in React'],
      source: 'chat',
    },
    {
      id: 'sug-kickboxing',
      skill_name: 'Kickboxing',
      skill_category: 'physical',
      skill_type: 'physical',
      monetization: 'potentially_paid',
      proficiency: 68,
      confidence: 0.82,
      enjoyment: 90,
      usage_frequency: 'weekly',
      trajectory: 'improving',
      description: 'Combat sport training for fitness and competition',
      origin_story: 'Started training for discipline and conditioning',
      evidence: ['Training kickboxing twice a week at the demo gym'],
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
      origin_story: 'Worked as a line cook at River Café and Golden Spoon',
      related_jobs: ['River Café', 'Golden Spoon'],
      evidence: ['Line cook shifts at River Café during college'],
      source: 'journal',
    },
  ];
}
