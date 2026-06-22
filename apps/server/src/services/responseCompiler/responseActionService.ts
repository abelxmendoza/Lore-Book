import { logger } from '../../logger';
import { organizationService } from '../organizationService';
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
 * dedups by name). Character/relationship actions are deliberately deferred —
 * creating people must go through the character resolve-before-write gate
 * (entityResolutionCore / the /api/characters pipeline) to avoid spawning
 * duplicate identities, so we do NOT shortcut that here.
 */

export type ApplyActionStatus =
  | 'created'
  | 'already_exists'
  | 'not_yet_supported'
  | 'invalid';

export type ApplyActionResult = {
  applied: boolean;
  status: ApplyActionStatus;
  actionType: string;
  message: string;
  entity?: { kind: 'organization'; id: string; name: string };
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
