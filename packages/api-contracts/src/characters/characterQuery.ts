/**
 * Character Query contract — sectioned read model for modals, cards, timelines, chat.
 */

export const CHARACTER_QUERY_SECTIONS = [
  'identity',
  'attributes',
  'lore',
  'knowledge',
  'organizations',
  'memories',
  'chatMentions',
  'provenance',
  'relationships',
  'family',
  'timelines',
  'media',
  'evidence',
  'dynamics',
] as const;

export type CharacterQuerySectionName = (typeof CHARACTER_QUERY_SECTIONS)[number];

export const CHARACTER_QUERY_CORE_SECTIONS: CharacterQuerySectionName[] = [
  'identity',
  'attributes',
  'lore',
  'knowledge',
  'organizations',
  'memories',
  'chatMentions',
  'provenance',
];

export type CharacterQueryChatMention = {
  messageId: string;
  sessionId: string;
  content: string;
  createdAt: string;
  sessionTitle?: string;
  matchedName?: string;
  role?: 'user' | 'assistant';
};

export type CharacterQueryHydratedMemory = {
  id: string;
  entry_id: string;
  date: string;
  summary?: string;
  title?: string | null;
  content?: string | null;
  tags?: string[];
  source?: string | null;
};

export type CharacterQueryResponse = {
  characterId: string;
  subject: 'self' | 'other';
  generatedAt: string;
  sections: Record<string, unknown>;
  partialErrors?: Record<string, string>;
};
