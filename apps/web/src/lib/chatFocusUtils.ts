import type { CertifiedEntityType } from '../types/certifiedEntity';
import type { ChatFocus } from '../types/chatFocus';

import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { isBookQueryFocus } from './openBookQueryChat';

export function focusToEntityContext(
  focus: ChatFocus
): { type: 'CHARACTER' | 'LOCATION' | 'ENTITY' | 'ROMANTIC_RELATIONSHIP'; id: string } | undefined {
  if (isBookQueryFocus(focus)) return undefined;
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
    case 'memory':
    case 'relationship':
      return { type: 'ENTITY', id: focus.entityId };
    case 'perception':
      // Perceptions are evidence-scoped beliefs, not canonical entities.
      return undefined;
    case 'event':
      // Events are pipeline targets, not generic ENTITY records (which are
      // currently interpreted as organizations by server-side analytics).
      // The durable chat row carries this focus into eventContext ingestion.
      return undefined;
    default:
      return undefined;
  }
}

export function focusToComposerEntities(focus: ChatFocus): CertifiedEntityMatch[] {
  // A perception focus is conversational context only. Never turn the belief
  // itself into a character or another canonical entity chip.
  if (focus.entityType === 'perception') return [];
  // Whole-book asks are chat focus only — do not mint a fake entity chip.
  if (isBookQueryFocus(focus)) return [];

  const composerType: CertifiedEntityType =
    focus.entityType === 'organization'
      ? 'organization'
      : focus.entityType === 'location'
        ? 'location'
        : focus.entityType === 'skill'
          ? 'skill'
          : focus.entityType === 'event'
            ? 'event'
            : focus.entityType === 'project'
              ? 'project'
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
