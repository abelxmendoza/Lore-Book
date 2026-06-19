import type { ChatFocus } from '../types/chatFocus';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import type { CertifiedEntityType } from '../types/certifiedEntity';

export function focusToEntityContext(
  focus: ChatFocus
): { type: 'CHARACTER' | 'LOCATION' | 'ENTITY' | 'ROMANTIC_RELATIONSHIP'; id: string } | undefined {
  if (focus.relationshipId) {
    return { type: 'ROMANTIC_RELATIONSHIP', id: focus.relationshipId };
  }
  switch (focus.entityType) {
    case 'character':
      return { type: 'CHARACTER', id: focus.entityId };
    case 'location':
      return { type: 'LOCATION', id: focus.entityId };
    case 'organization':
    case 'project':
    case 'skill':
    case 'quest':
    case 'event':
    case 'memory':
    case 'relationship':
      return { type: 'ENTITY', id: focus.entityId };
    default:
      return undefined;
  }
}

export function focusToComposerEntities(focus: ChatFocus): CertifiedEntityMatch[] {
  const composerType: CertifiedEntityType =
    focus.entityType === 'organization'
      ? 'organization'
      : focus.entityType === 'location'
        ? 'location'
        : focus.entityType === 'skill'
          ? 'skill'
          : 'character';

  return [
    {
      id: focus.entityId,
      name: focus.entityName,
      type: composerType,
      status: 'confirmed',
      aliases: [],
      mentionKeys: [focus.entityName.toLowerCase()],
      matchedLabel: focus.entityName,
    },
  ];
}
