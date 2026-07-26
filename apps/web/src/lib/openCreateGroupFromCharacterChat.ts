import { FOCUSED_ENTITY_CHAT_PRESETS } from '../components/chat/focusedEntityChatPresets';
import { openChatWithFocus } from './openChatWithFocus';
import {
  inferGroupTypeFromContext,
  type InferGroupTypeResult,
} from './inferGroupTypeFromContext';
import { GROUP_TYPE_LABELS } from './groupTypes';
import type { GroupType } from '../components/organizations/OrganizationProfileCard';

export type CreateGroupFromCharacterInput = {
  groupName: string;
  details?: string;
  character: {
    id: string;
    name: string;
    role?: string | null;
    archetype?: string | null;
  };
  /** Membership role for the character once the group exists. */
  memberRole?: string;
  /** Optional explicit override of inferred classification. */
  groupTypeOverride?: GroupType | null;
  /** When true, the character is the self/"You" profile. */
  isSelf?: boolean;
};

export type CreateGroupFromCharacterPlan = {
  groupName: string;
  classification: InferGroupTypeResult;
  initialPrompt: string;
  pendingEntityId: string;
};

function pendingOrganizationId(name: string): string {
  return `pending:organization:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/**
 * Build the composer prompt used when creating a new group from a character modal.
 */
export function buildCreateGroupFromCharacterPrompt(
  input: CreateGroupFromCharacterInput,
  classification: InferGroupTypeResult,
): string {
  const groupName = input.groupName.trim();
  const details = input.details?.trim() ?? '';
  const memberRole = input.memberRole?.trim() || 'member';
  const who = input.isSelf ? 'me (the main character / You)' : input.character.name;
  const typeLabel = GROUP_TYPE_LABELS[classification.groupType] ?? classification.label;
  const reasonBit =
    classification.reasons.length > 0
      ? ` Classification cues: ${classification.reasons.join('; ')}.`
      : '';
  const detailsBit = details
    ? ` Here is what I know so far:\n${details}\n`
    : ' I will share more details in this chat.\n';
  const roleBit = input.character.role
    ? ` In my story, ${input.isSelf ? 'my' : `${input.character.name}'s`} role/context is “${input.character.role}”.`
    : '';

  return (
    `I want to create a new group/organization called ${groupName} and add ${who} to it` +
    (memberRole ? ` as ${memberRole}` : '') +
    `. ` +
    `Treat “${groupName}” as a Groups & Organizations book entity (not a person). ` +
    `Suggested classification: ${typeLabel} (\`${classification.groupType}\`)` +
    ` — confidence ${Math.round(classification.confidence * 100)}%.${reasonBit}` +
    ` Please classify it correctly from this chat, my story context, and the details below` +
    ` (company vs friend group vs family vs crew vs club, etc.), and correct the type if my suggestion is wrong.` +
    detailsBit +
    roleBit +
    ` Help me set up its entity knowledge base: what it is, aliases, how I’m connected,` +
    ` who else belongs, and membership for ${who}.` +
    ` Do not invent people, memberships, or biographical facts I have not shared;` +
    ` ask short clarifying questions when something is ambiguous.`
  );
}

export function planCreateGroupFromCharacter(
  input: CreateGroupFromCharacterInput,
): CreateGroupFromCharacterPlan {
  const groupName = input.groupName.trim();
  if (!groupName) {
    throw new Error('Group name is required');
  }

  const inferred = inferGroupTypeFromContext({
    groupName,
    details: input.details,
    characterRole: input.character.role,
    characterArchetype: input.character.archetype,
    memberRole: input.memberRole,
  });

  const classification: InferGroupTypeResult = input.groupTypeOverride
    ? {
        groupType: input.groupTypeOverride,
        label: GROUP_TYPE_LABELS[input.groupTypeOverride],
        confidence: 0.95,
        reasons: ['user-selected type'],
      }
    : inferred;

  return {
    groupName,
    classification,
    initialPrompt: buildCreateGroupFromCharacterPrompt(input, classification),
    pendingEntityId: pendingOrganizationId(groupName),
  };
}

/**
 * Close character modal context and open main chat ready to create the group entity.
 */
export function openCreateGroupFromCharacterChat(input: CreateGroupFromCharacterInput): CreateGroupFromCharacterPlan {
  const plan = planCreateGroupFromCharacter(input);
  const preset = FOCUSED_ENTITY_CHAT_PRESETS.organizations;

  openChatWithFocus({
    entityId: plan.pendingEntityId,
    entityName: plan.groupName,
    entityType: 'memory',
    sourceSurface: 'organizations',
    sourceLabel: preset.sourceLabel,
    knowledgeScope:
      'creating a Groups & Organizations entity, classifying it correctly, building its knowledge base, and linking membership',
    initialPrompt: plan.initialPrompt,
    arrivedAt: Date.now(),
  });

  return plan;
}
