export type ComposerEntityRef = { id: string; name: string; type: string };

export type CharacterChatFocus = {
  characterId: string;
  characterName?: string;
  source: 'entity_context' | 'chat_focus' | 'composer';
};

/** Resolve the character a focused chat message should update. */
export function resolveFocusedCharacter(
  entityContext?: { type: string; id: string },
  chatFocus?: { entityType?: string; entityId?: string; entityName?: string },
  composerEntities?: ComposerEntityRef[],
): CharacterChatFocus | null {
  if (entityContext?.type === 'CHARACTER' && entityContext.id) {
    return { characterId: entityContext.id, source: 'entity_context' };
  }
  if (chatFocus?.entityType === 'character' && chatFocus.entityId) {
    return {
      characterId: chatFocus.entityId,
      characterName: chatFocus.entityName,
      source: 'chat_focus',
    };
  }
  const characters = (composerEntities ?? []).filter((e) => e.type === 'character');
  if (characters.length === 1) {
    return {
      characterId: characters[0].id,
      characterName: characters[0].name,
      source: 'composer',
    };
  }
  return null;
}

/** When no explicit entity context exists, promote a lone composer character chip. */
export function resolveEntityContextFromComposer(
  entityContext: { type: string; id: string } | undefined,
  composerEntities?: ComposerEntityRef[],
): { type: 'CHARACTER'; id: string } | undefined {
  if (entityContext) return entityContext as { type: 'CHARACTER'; id: string };
  const characters = (composerEntities ?? []).filter((e) => e.type === 'character');
  if (characters.length === 1) {
    return { type: 'CHARACTER', id: characters[0].id };
  }
  return undefined;
}
