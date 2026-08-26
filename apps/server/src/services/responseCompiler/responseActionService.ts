import { logger } from '../../logger';
import { organizationService } from '../organizationService';
import { familyTreeService } from '../familyTreeService';
import { findFamilyMemberByName } from '../chat/familyWriteService';
import type { ResponseActionCandidate } from './responseCompilerTypes';

/**
 * Applies a Response Compiler action chip — the user-confirmation gate.
 *
 * The compiler treats the LLM as non-authoritative: it only ever *suggests*
 * chips ("Create School Band group", "Add Bryan as best friend"). Those
 * suggestions become canon ONLY when the user explicitly invokes them, which is
 * exactly what this service is — it runs on an authenticated, user-initiated
 * request, never automatically from the compile path. That satisfies the hard
 * rule: assistant output never creates canon without confirmation.
 *
 * Scope today: `create_group` is fully applied via organizationService (which
 * dedups by name), and `delete_family_member` via familyTreeService (which
 * re-resolves the name fresh against the tree rather than trusting a stale
 * id). Both act on an already-resolved existing entity, so neither needs the
 * resolve-before-write gate. `add_relationship`/`add_character` remain
 * deliberately deferred — creating a NEW identity must go through that gate
 * (entityResolutionCore / the /api/characters pipeline) to avoid spawning
 * duplicate identities, so we do NOT shortcut that here.
 */

export type ApplyActionStatus =
  | 'created'
  | 'deleted'
  | 'already_exists'
  | 'not_found'
  | 'not_yet_supported'
  | 'invalid';

export type ApplyActionResult = {
  applied: boolean;
  status: ApplyActionStatus;
  actionType: string;
  message: string;
  entity?: { kind: 'organization' | 'character'; id: string; name: string };
};

export type ApplyActionInput = Pick<ResponseActionCandidate, 'type' | 'label'> & {
  payload?: Record<string, unknown>;
};

export type ResponseActionDeps = {
  orgService?: Pick<typeof organizationService, 'findByName' | 'createOrganization'>;
};

/** "Create School Band" / "Create a School Band group" → "School Band". */
function deriveGroupName(label: string): string {
  return label.replace(/^\s*create\s+(a\s+|the\s+)?/i, '').trim();
}

export async function applyResponseAction(
  userId: string,
  action: ApplyActionInput,
  deps: ResponseActionDeps = {},
): Promise<ApplyActionResult> {
  const orgService = deps.orgService ?? organizationService;

  switch (action.type) {
    case 'create_group': {
      const name =
        String((action.payload?.groupName as string | undefined) ?? '').trim() ||
        deriveGroupName(action.label);

      if (!name) {
        return {
          applied: false,
          status: 'invalid',
          actionType: action.type,
          message: 'Could not determine a group name from the action.',
        };
      }

      const existing = await orgService.findByName(userId, name);
      if (existing) {
        return {
          applied: false,
          status: 'already_exists',
          actionType: action.type,
          message: `Group "${name}" already exists.`,
          entity: { kind: 'organization', id: existing.id, name: existing.name },
        };
      }

      const created = await orgService.createOrganization(userId, { name });
      logger.info(
        { userId, orgId: created.id, name },
        'responseAction: created group from user-confirmed action chip',
      );
      return {
        applied: true,
        status: 'created',
        actionType: action.type,
        message: `Created group "${name}".`,
        entity: { kind: 'organization', id: created.id, name: created.name },
      };
    }

    case 'delete_family_member': {
      const name = String((action.payload?.characterName as string | undefined) ?? '').trim();
      if (!name) {
        return {
          applied: false,
          status: 'invalid',
          actionType: action.type,
          message: 'Could not determine which family member to delete from the action.',
        };
      }

      // Re-resolve fresh at confirm time rather than trusting a stale id from
      // propose time — the tree can change in between, and this is the same
      // "don't trust a stale reference" pattern create_group already uses
      // via orgService.findByName.
      const lookup = await findFamilyMemberByName(userId, name);
      if (lookup.status === 'not_found') {
        return {
          applied: false,
          status: 'not_found',
          actionType: action.type,
          message: `Couldn't find "${name}" in your family tree anymore — nothing was deleted.`,
        };
      }
      if (lookup.status === 'ambiguous') {
        return {
          applied: false,
          status: 'not_found',
          actionType: action.type,
          message: `Found more than one match for "${name}" (${lookup.candidates.join(', ')}) — nothing was deleted.`,
        };
      }

      const ok = await familyTreeService.deleteMember(userId, lookup.id, 'Deleted via chat confirmation');
      if (!ok) {
        return {
          applied: false,
          status: 'invalid',
          actionType: action.type,
          message: `Couldn't delete ${lookup.name}.`,
        };
      }

      logger.info(
        { userId, characterId: lookup.id, name: lookup.name },
        'responseAction: deleted family member from user-confirmed action chip',
      );
      return {
        applied: true,
        status: 'deleted',
        actionType: action.type,
        message: `Deleted ${lookup.name}.`,
        entity: { kind: 'character', id: lookup.id, name: lookup.name },
      };
    }

    case 'add_relationship':
    case 'add_character':
    case 'confirm_fact':
      // Intentionally not auto-applied — see file header. Surfaced honestly so the
      // UI can fall back to the canonical character/relationship flows.
      return {
        applied: false,
        status: 'not_yet_supported',
        actionType: action.type,
        message: `"${action.type}" must go through the character resolve-before-write pipeline; not applied here.`,
      };

    default:
      return {
        applied: false,
        status: 'invalid',
        actionType: action.type,
        message: `Unknown action type "${action.type}".`,
      };
  }
}
