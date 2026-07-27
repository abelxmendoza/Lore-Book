import type { CharacterKnowledgeBase } from '../characterKnowledgeBaseService';
import type { CharacterLoreProfile } from './characterLoreProfileService';

export type CharacterChatMention = {
  messageId: string;
  sessionId: string;
  content: string;
  createdAt: string;
  sessionTitle?: string;
  matchedName?: string;
  role?: 'user' | 'assistant';
};

export type CharacterProfileBundle = {
  characterId: string;
  detail: Record<string, unknown>;
  knowledgeBase: CharacterKnowledgeBase;
  loreProfile: CharacterLoreProfile;
  chatMentions: CharacterChatMention[];
  generatedAt: string;
};
