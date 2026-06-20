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
    {
      id: 'sug-typescript',
      skill_name: 'TypeScript',
      skill_category: 'technical',
      skill_type: 'technical',
      monetization: 'paid',
      proficiency: 70,
      confidence: 0.84,
      enjoyment: 74,
      usage_frequency: 'daily',
      trajectory: 'improving',
      description: 'Typed JavaScript for LoreBook and Atlas Notes',
      origin_story: 'Adopted after shipping a few untyped React prototypes',
      related_projects: ['LoreBook', 'Atlas Notes'],
      evidence: ['Refactoring the composer and entity indexer in TypeScript'],
      source: 'chat',
    },
    {
      id: 'sug-ux-research',
      skill_name: 'UX Research',
      skill_category: 'intellectual',
      skill_type: 'professional',
      monetization: 'potentially_paid',
      proficiency: 62,
      confidence: 0.77,
      enjoyment: 68,
      usage_frequency: 'monthly',
      trajectory: 'improving',
      description: 'Interviewing users and mapping lorebook workflows',
      origin_story: 'Picked up while validating onboarding flows',
      evidence: ['Ran three demo interviews about timeline navigation'],
      source: 'journal',
    },
    {
      id: 'sug-weightlifting',
      skill_name: 'Weightlifting',
      skill_category: 'physical',
      skill_type: 'physical',
      monetization: 'hobby_only',
      proficiency: 58,
      confidence: 0.79,
      enjoyment: 82,
      usage_frequency: 'weekly',
      trajectory: 'improving',
      description: 'Compound lifts for strength and recovery',
      origin_story: 'Started after kickboxing to balance conditioning',
      evidence: ['Tracking squat and deadlift progress in the journal'],
      source: 'chat',
    },
  ];
}

/** Demo pool minus skills already in the book (by name). */
export function getAvailableMockSkillSuggestions(existingNames: string[]): SkillSuggestion[] {
  const inBook = new Set(existingNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const pool = getMockSkillSuggestions();
  const available = pool.filter((s) => !inBook.has(s.skill_name.trim().toLowerCase()));
  return available.length > 0 ? available : pool;
}
