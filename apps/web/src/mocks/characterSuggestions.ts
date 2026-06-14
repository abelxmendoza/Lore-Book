import type { CharacterSuggestion } from '../api/entitySuggestions';

/** Names already in the demo Character Book — hide matching suggestions. */
export const MOCK_CHARACTER_BOOK_NAMES: string[] = [
  'You',
  'Sarah Chen',
  'Marcus Johnson',
  'Alex Rivera',
  'Alex',
  'Jordan Kim',
  'Dr. Amara Wells',
  'David Martinez',
  'Sophia Anderson',
  'Emma Thompson',
  'Michael Chen',
  'Lisa Park',
  'James Wilson',
  'Rachel Green',
  'Chris Taylor',
  'Maya Patel',
  'Noah Brooks',
  'Olivia Hayes',
  'Ethan Reed',
  'Ava Mitchell',
];

/** Names already tracked in demo Love & Relationships cards. */
export const MOCK_ROMANTIC_RELATIONSHIP_NAMES: string[] = [
  'Alex',
  'Jordan',
  'Riley',
  'Sam',
  'Taylor',
  'Morgan',
  'Casey',
  'Nova',
  'Elena',
];

const DEMO_GENERAL: CharacterSuggestion[] = [
  {
    name: 'Dana (Onboarding)',
    mentionCount: 4,
    confidence: 0.82,
    source: 'chat_extract',
    role: 'Recruiter contact',
    context: 'Handling your KForce onboarding paperwork',
  },
  {
    name: 'Reese',
    mentionCount: 3,
    confidence: 0.76,
    source: 'entity_question',
    archetype: 'colleague',
    context: 'Staffing agency contact from recent threads',
  },
];

/** Individual romantic interests not yet in the demo book or relationship cards. */
const DEMO_ROMANTIC: CharacterSuggestion[] = [
  {
    name: 'Priya',
    mentionCount: 4,
    confidence: 0.84,
    source: 'chat_extract',
    archetype: 'romantic',
    relationship: 'romantic',
    context: 'You went on two dates recently — add her to track the connection',
  },
  {
    name: 'Daniel',
    mentionCount: 3,
    confidence: 0.79,
    source: 'chat_extract',
    archetype: 'romantic',
    relationship: 'romantic',
    context: 'Mentioned as a situationship in your recent chats',
  },
];

export function getMockCharacterSuggestions(
  context: 'general' | 'romantic' = 'general'
): CharacterSuggestion[] {
  return context === 'romantic' ? [...DEMO_ROMANTIC] : [...DEMO_GENERAL];
}

export function getMockCharacterSuggestionBookNames(context: 'general' | 'romantic'): string[] {
  const base = MOCK_CHARACTER_BOOK_NAMES;
  if (context === 'romantic') {
    return [...base, ...MOCK_ROMANTIC_RELATIONSHIP_NAMES];
  }
  return base;
}
