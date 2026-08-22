/**
 * Retarget a leftover Character Book pin when this turn is clearly about
 * someone else — a capture prompt, a named who-is, or a pronoun follow-up
 * whose subject was named earlier in the thread.
 */
import {
  isFocusEntityRelevant,
  parseNamedChatSubject,
  parseNamedWhoIsSubject,
  parseTalkAboutSubject,
  subjectNamesMatch,
} from '@lorebook/api-contracts';

export type ThreadEntityLike = { id: string; name: string; type: string };

export type ChatFocusLike = {
  entityId: string;
  entityName: string;
  entityType: string;
};

export type ChatSubjectRetarget = {
  dropStaleFocus: boolean;
  subjectName: string | null;
  entityContext?: { type: 'CHARACTER'; id: string };
  chatFocusPatch?: { entityId: string; entityName: string; entityType: 'character' };
};

function isCharacterEntity(entity: ThreadEntityLike): boolean {
  const type = entity.type.toLowerCase();
  return type === 'character' || type === 'person';
}

export function findThreadCharacterByName(
  entities: ThreadEntityLike[] | undefined,
  name: string,
): ThreadEntityLike | undefined {
  return (entities ?? []).find((entity) => isCharacterEntity(entity) && subjectNamesMatch(entity.name, name));
}

export function talkAboutSubjectFromHistory(
  history: Array<{ role: string; content: string }> | undefined,
): string | null {
  if (!history?.length) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.role !== 'user' || !entry.content.trim()) continue;
    const named = parseTalkAboutSubject(entry.content) || parseNamedWhoIsSubject(entry.content);
    if (named) return named;
  }
  return null;
}

function characterPatch(entity: ThreadEntityLike): ChatSubjectRetarget['chatFocusPatch'] {
  return { entityId: entity.id, entityName: entity.name, entityType: 'character' };
}

/**
 * Choose the person this turn should load/update, even when a stale pin is
 * still sitting in the composer.
 */
export function resolveChatSubjectRetarget(input: {
  message: string;
  chatFocus?: ChatFocusLike | null;
  threadEntities?: ThreadEntityLike[];
  conversationHistory?: Array<{ role: string; content: string }>;
}): ChatSubjectRetarget {
  const namedNow = parseNamedChatSubject(input.message);
  const historySubject = talkAboutSubjectFromHistory([
    { role: 'user', content: input.message },
    ...(input.conversationHistory ?? []),
  ]);
  const named = namedNow || historySubject;
  const focusName = input.chatFocus?.entityName?.trim() || '';
  const pinRelevant = Boolean(focusName) && isFocusEntityRelevant(input.message, focusName);

  if (!named) {
    return { dropStaleFocus: false, subjectName: focusName || null };
  }

  const match = findThreadCharacterByName(input.threadEntities, named);
  const focusMatches = Boolean(focusName) && subjectNamesMatch(named, focusName);
  const dropStaleFocus = Boolean(focusName) && !focusMatches && !pinRelevant;

  if (match) {
    return {
      dropStaleFocus: dropStaleFocus || (!focusMatches && Boolean(focusName)),
      subjectName: match.name,
      entityContext: { type: 'CHARACTER', id: match.id },
      chatFocusPatch: characterPatch(match),
    };
  }

  if (focusMatches && input.chatFocus) {
    return {
      dropStaleFocus: false,
      subjectName: named,
      entityContext: { type: 'CHARACTER', id: input.chatFocus.entityId },
      chatFocusPatch: {
        entityId: input.chatFocus.entityId,
        entityName: input.chatFocus.entityName,
        entityType: 'character',
      },
    };
  }

  return {
    dropStaleFocus,
    subjectName: named,
  };
}
