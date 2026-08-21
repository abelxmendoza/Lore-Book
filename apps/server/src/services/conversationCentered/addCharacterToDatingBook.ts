/**
 * Owner/admin-only: add an existing Character Book person to Dating & Romance.
 *
 * Writes are always scoped to the authenticated user_id. Never accepts a
 * target user id from the client. Demo and other accounts cannot use this.
 */

import { resolveAccountAuthority, canManuallyAddToDatingBook } from '../../lib/accountAuthority';
import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { evaluateDatingEligibility, hasFamilySignal } from './datingEligibilityService';

export const MANUAL_DATING_ADD_TYPES = [
  'crush',
  'dating',
  'talking',
  'situationship',
  'girlfriend',
  'boyfriend',
  'lover',
  'infatuation',
  'complicated',
] as const;

export const MANUAL_DATING_ADD_STATUSES = [
  'unrequited',
  'active',
  'complicated',
  'paused',
] as const;

export type ManualDatingAddType = (typeof MANUAL_DATING_ADD_TYPES)[number];
export type ManualDatingAddStatus = (typeof MANUAL_DATING_ADD_STATUSES)[number];

export class DatingBookAddError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DatingBookAddError';
  }
}

export type AddCharacterToDatingBookInput = {
  userId: string;
  characterId: string;
  relationshipType?: ManualDatingAddType;
  status?: ManualDatingAddStatus;
};

export type AddCharacterToDatingBookResult = {
  created: boolean;
  relationship: Record<string, unknown>;
};

function isManualType(value: string | undefined): value is ManualDatingAddType {
  return !!value && (MANUAL_DATING_ADD_TYPES as readonly string[]).includes(value);
}

function isManualStatus(value: string | undefined): value is ManualDatingAddStatus {
  return !!value && (MANUAL_DATING_ADD_STATUSES as readonly string[]).includes(value);
}

export async function addCharacterToDatingBook(
  input: AddCharacterToDatingBookInput,
): Promise<AddCharacterToDatingBookResult> {
  const authority = await resolveAccountAuthority(input.userId);
  if (!canManuallyAddToDatingBook(authority)) {
    throw new DatingBookAddError(
      'Manual Dating & Romance adds are limited to the admin account.',
      403,
      'dating_add_forbidden',
    );
  }

  const relationshipType: ManualDatingAddType = isManualType(input.relationshipType)
    ? input.relationshipType
    : 'crush';
  const status: ManualDatingAddStatus = isManualStatus(input.status) ? input.status : 'unrequited';

  const { data: character, error: characterError } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, role, archetype, metadata')
    .eq('id', input.characterId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (characterError) {
    logger.warn({ error: characterError, userId: input.userId }, 'dating book add: character lookup failed');
    throw new DatingBookAddError('Could not load that Character Book card.', 500, 'dating_add_lookup_failed');
  }

  if (!character) {
    throw new DatingBookAddError(
      'That character is not in your Character Book.',
      404,
      'dating_add_character_not_found',
    );
  }

  const aliases = Array.isArray(character.alias) ? character.alias.filter((a): a is string => typeof a === 'string') : [];
  const relationLabels = [character.role, character.archetype, (character.metadata as { relationship_to_user?: string } | null)?.relationship_to_user]
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0);

  if (hasFamilySignal(character.name, relationLabels, aliases)) {
    throw new DatingBookAddError(
      'Family members cannot be added to Dating & Romance.',
      400,
      'dating_add_family_blocked',
    );
  }

  let orgLabels: string[] = [];
  try {
    const { organizationService } = await import('../organizationService');
    orgLabels = await organizationService.listOrganizationLabels(input.userId);
  } catch {
    orgLabels = [];
  }
  const orgSet = new Set(orgLabels.map((label) => label.trim().toLowerCase()));

  const eligibility = evaluateDatingEligibility({
    entityId: character.id,
    name: character.name,
    canonicalType: 'person',
    isKnownOrganization: orgSet.has(String(character.name ?? '').trim().toLowerCase()),
    relationLabels,
    aliases,
    evidenceSnippets: [],
    userConfirmedRomantic: true,
  });

  if (!eligibility.visibleInDatingBook) {
    throw new DatingBookAddError(
      eligibility.eligibilityReason === 'ineligible_non_person'
        ? 'Only individual people can be added to Dating & Romance.'
        : 'This character cannot be added to Dating & Romance.',
      400,
      'dating_add_ineligible',
    );
  }

  const { data: existing } = await supabaseAdmin
    .from('romantic_relationships')
    .select('*')
    .eq('user_id', input.userId)
    .eq('person_id', character.id)
    .eq('person_type', 'character')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const nextMetadata = {
      ...((existing.metadata as Record<string, unknown> | null) ?? {}),
      user_confirmed_romantic: true,
      correction_source: 'user',
    };
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('romantic_relationships')
      .update({
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('user_id', input.userId)
      .select('*')
      .single();

    if (updateError) {
      throw new DatingBookAddError('Could not update the existing Dating & Romance row.', 500, 'dating_add_update_failed');
    }

    return { created: false, relationship: updated ?? existing };
  }

  const now = new Date().toISOString();
  const insertRow = {
    user_id: input.userId,
    person_id: character.id,
    person_type: 'character' as const,
    relationship_type: relationshipType,
    status,
    is_current: status === 'unrequited' || status === 'active' || status === 'complicated' || status === 'paused',
    is_situationship: relationshipType === 'situationship',
    exclusivity_status: 'unknown',
    metadata: {
      user_confirmed_romantic: true,
      correction_source: 'user',
      added_via: 'manual_character_add',
      added_at: now,
      reciprocity: status === 'unrequited' ? 'user_interest_only' : 'unknown',
      evidence: [`User added ${character.name} to Dating & Romance.`],
    },
  };

  const { data: created, error: insertError } = await supabaseAdmin
    .from('romantic_relationships')
    .insert(insertRow)
    .select('*')
    .single();

  if (insertError || !created) {
    logger.warn({ error: insertError, userId: input.userId }, 'dating book add: insert failed');
    throw new DatingBookAddError('Could not add that character to Dating & Romance.', 500, 'dating_add_insert_failed');
  }

  return { created: true, relationship: created };
}
