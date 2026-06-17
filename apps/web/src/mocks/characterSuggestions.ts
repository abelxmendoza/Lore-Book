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
    id: 'demo-omega-iris',
    name: 'Iris Vance',
    mentionCount: 6,
    confidence: 0.88,
    source: 'omega_entity',
    omegaEntityId: 'demo-omega-iris',
    archetype: 'performer',
    context: 'Indie theater performer — mentioned around the Velvet Room venue',
  },
  {
    id: 'sug:character:dj cassian',
    name: 'DJ Cassian',
    mentionCount: 4,
    confidence: 0.84,
    source: 'chat_extract',
    role: 'DJ / collaborator',
    context: 'Opened for Iris Vance at a fictional anniversary showcase',
  },
  {
    id: 'demo-question-theo',
    name: 'Uncle Theo',
    mentionCount: 3,
    confidence: 0.79,
    source: 'entity_question',
    questionId: 'demo-question-theo',
    context: 'Family mention from sample demo threads — confirm who you mean',
  },
  {
    id: 'sug:character:morgan hale',
    name: 'Morgan Hale',
    mentionCount: 2,
    confidence: 0.74,
    source: 'chat_extract',
    role: 'Manager',
    context: 'Helios Aerospace manager referenced in a fictional work story',
  },
];

/** Individual romantic interests not yet in the demo book or relationship cards. */
const DEMO_ROMANTIC: CharacterSuggestion[] = [
  {
    id: 'sug:character:priya',
    name: 'Priya',
    mentionCount: 4,
    confidence: 0.84,
    source: 'chat_extract',
    archetype: 'romantic',
    relationship: 'romantic',
    context: 'Ch.4 lore — glossary cue "went on a date". Coffee with Priya turned into a four-hour talk.',
  },
  {
    id: 'sug:character:daniel',
    name: 'Daniel',
    mentionCount: 3,
    confidence: 0.79,
    source: 'chat_extract',
    archetype: 'romantic',
    relationship: 'romantic',
    context: 'Ch.4 lore — talking stage with Sam\'s party circle. Lexical cue: "talking stage".',
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
