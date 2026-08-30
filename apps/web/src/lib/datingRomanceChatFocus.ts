import { openChatWithFocus, type OpenChatWithFocusInput } from './openChatWithFocus';
import { CHAT_FOCUS_SOURCE_LABELS } from '../types/chatFocus';

export const DATING_ROMANCE_KNOWLEDGE_SCOPE =
  'romantic interest, shared history, feelings, and relationship context';

export function datingRomanceExistingPrompt(name: string): string {
  return (
    `I want to talk about ${name} as a romantic interest. ` +
    `Help me capture who they are, how we know each other, and what I am feeling. ` +
    `Please do not assume that they feel the same way or invent details I have not shared.`
  );
}

export function datingRomanceIntroducePrompt(name: string): string {
  return (
    `I want to tell you about ${name}, someone I'm romantically interested in. ` +
    `Their name is ${name} — let me know any aliases or nicknames I call them too, ` +
    `plus how we met and what I'm feeling, so you can get to know them.`
  );
}

type DatingRomanceChatInput = {
  entityId: string;
  entityName: string;
  relationshipId?: string;
  initialPrompt?: string;
  autoSubmit?: boolean;
  baseline?: OpenChatWithFocusInput['baseline'];
};

/**
 * Open main chat with Dating & Romance focus for a person already in that book.
 * Used from Character Book, the character card, and Dating & Romance itself so
 * the conversation always treats them as a romantic interest.
 */
export function openDatingRomanceCharacterChat(input: DatingRomanceChatInput): void {
  const trimmed = input.initialPrompt?.trim();
  openChatWithFocus({
    entityId: input.entityId,
    entityName: input.entityName,
    entityType: 'character',
    relationshipId: input.relationshipId,
    relationshipName: input.relationshipId ? input.entityName : undefined,
    sourceSurface: 'love',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.love,
    knowledgeScope: DATING_ROMANCE_KNOWLEDGE_SCOPE,
    initialPrompt: trimmed,
    autoSubmit: trimmed ? input.autoSubmit : undefined,
    arrivedAt: Date.now(),
    baseline: input.baseline,
  });
}
