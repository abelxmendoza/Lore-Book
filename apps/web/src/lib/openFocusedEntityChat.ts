import { openChatWithFocus } from './openChatWithFocus';
import type { FocusedEntityOption } from '../components/chat/FocusedEntityChatLauncher';
import type { FocusedEntityChatPreset } from '../components/chat/focusedEntityChatPresets';
import { decomposePersonIntro } from './personIntroDecomposition';

function pendingEntityId(prefix: string, name: string): string {
  return `${prefix}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/**
 * Open main chat focused on an existing book entity, or a pending introduce flow
 * so extraction can create the entity from conversation.
 */
export function openFocusedEntityChat(
  preset: FocusedEntityChatPreset,
  selection: { name: string; entity?: FocusedEntityOption },
): void {
  const { name, entity } = selection;
  if (entity) {
    openChatWithFocus({
      entityId: entity.id,
      entityName: entity.name,
      entityType: preset.entityType,
      sourceSurface: preset.sourceSurface,
      sourceLabel: preset.sourceLabel,
      knowledgeScope: preset.knowledgeScope,
      initialPrompt: preset.existingPrompt(entity.name),
      arrivedAt: Date.now(),
    });
    return;
  }

  // Characters: strip role contamination ("Jamie, Marcus's Social Worker" → Jamie).
  const decomp =
    preset.kind === 'characters' ? decomposePersonIntro(name) : null;
  const displayName =
    decomp?.canonicalName?.trim() || name.trim();
  const introMeta =
    decomp && (decomp.rolePhrase || decomp.supportsAnchor)
      ? { rolePhrase: decomp.rolePhrase, supportsAnchor: decomp.supportsAnchor }
      : undefined;

  openChatWithFocus({
    entityId: pendingEntityId(preset.pendingIdPrefix, displayName),
    entityName: displayName,
    entityType: 'memory',
    sourceSurface: preset.sourceSurface,
    sourceLabel: preset.sourceLabel,
    knowledgeScope: preset.knowledgeScope,
    initialPrompt: preset.introducePrompt(displayName, introMeta),
    arrivedAt: Date.now(),
  });
}
