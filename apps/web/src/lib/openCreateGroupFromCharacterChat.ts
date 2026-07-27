import { FOCUSED_ENTITY_CHAT_PRESETS } from '../components/chat/focusedEntityChatPresets';
import { openChatWithFocus } from './openChatWithFocus';

export type CreateGroupFromCharacterInput = {
  character: {
    id: string;
    name: string;
    role?: string | null;
    archetype?: string | null;
  };
  /** When true, the character is the self/"You" profile. */
  isSelf?: boolean;
};

export type CreateGroupFromCharacterPlan = {
  initialPrompt: string;
  entityId: string;
  entityName: string;
};

/**
 * Composer prompt: talk in main chat; LoreBook creates the group entity,
 * classifies it, links membership, and routes related lore to other books.
 */
export function buildCreateGroupFromCharacterPrompt(
  input: CreateGroupFromCharacterInput,
): string {
  const who = input.isSelf ? 'me (the main character / You)' : input.character.name;
  const roleBit = input.character.role
    ? ` In my story, ${input.isSelf ? 'my' : `${input.character.name}'s`} role/context is “${input.character.role}”.`
    : '';

  return (
    `I want to create a new group or organization that ${who} is part of. ` +
    `I'll describe it here in chat — please create the Groups & Organizations entity from what I share, ` +
    `classify what kind of group it is (company, friend group, family, crew, club, etc.), ` +
    `link ${who} with the right membership role in that group (their seat there — not how I know them personally), ` +
    `and split any other lore I mention into the right books (people, places, events, and so on).` +
    roleBit +
    ` Do not invent people, memberships, or biographical facts I have not shared; ` +
    `ask short clarifying questions when something is ambiguous.`
  );
}

export function planCreateGroupFromCharacter(
  input: CreateGroupFromCharacterInput,
): CreateGroupFromCharacterPlan {
  const name = input.character.name.trim();
  if (!name && !input.isSelf) {
    throw new Error('Character name is required');
  }

  return {
    initialPrompt: buildCreateGroupFromCharacterPrompt(input),
    entityId: input.character.id,
    entityName: input.isSelf ? name || 'You' : name,
  };
}

/**
 * Close character modal context and open main chat focused on this person,
 * ready to create a group through conversation (composer chip + lore routing).
 */
export function openCreateGroupFromCharacterChat(
  input: CreateGroupFromCharacterInput,
): CreateGroupFromCharacterPlan {
  const plan = planCreateGroupFromCharacter(input);
  const preset = FOCUSED_ENTITY_CHAT_PRESETS.organizations;

  openChatWithFocus({
    entityId: plan.entityId,
    entityName: plan.entityName,
    entityType: 'character',
    sourceSurface: 'organizations',
    sourceLabel: preset.sourceLabel,
    knowledgeScope:
      'creating a Groups & Organizations entity from chat, classifying it, linking membership, and distributing related lore to the right books',
    initialPrompt: plan.initialPrompt,
    arrivedAt: Date.now(),
  });

  return plan;
}
