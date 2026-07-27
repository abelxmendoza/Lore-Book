export type CharacterChatMention = {
  messageId: string;
  sessionId: string;
  content: string;
  createdAt: string;
  sessionTitle?: string;
  matchedName?: string;
  role?: 'user' | 'assistant';
};
