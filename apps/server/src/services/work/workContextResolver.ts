/**
 * Work Context Resolver — builds the one focused WorkContext object that
 * work questions are answered from. Pure builder (testable) + DB loader.
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { inferTenure, resolveCurrentRole } from './currentRoleResolver';
import { resolveTeamRoster } from './teamRosterResolver';
import type { WorkContext, WorkContextInputs } from './workContextTypes';

export function buildWorkContext(inputs: WorkContextInputs): WorkContext {
  const role = resolveCurrentRole(inputs);
  const roster = resolveTeamRoster(inputs);

  return {
    ...role,
    managers: roster.managers,
    leads: roster.leads,
    coworkers: roster.coworkers,
    tools: (inputs.tools ?? []).map((t) => ({ ...t, evidenceIds: t.evidenceIds ?? [] })),
    currentTasks: (inputs.tasks ?? []).map((t) => ({ ...t, evidenceIds: t.evidenceIds ?? [] })),
    blockers: (inputs.blockers ?? []).map((b) => ({ ...b, evidenceIds: b.evidenceIds ?? [] })),
    tenure: inferTenure(inputs.tenureStatements),
    correctionsApplied: [],
    warnings: roster.warnings,
  };
}

const WORK_ORG_TYPE_RE = /\b(company|employer|workplace|team|department|work)\b/i;

/** Best-effort load of work evidence from live tables. */
export async function loadWorkContextInputs(userId: string): Promise<WorkContextInputs> {
  const inputs: WorkContextInputs = { organizations: [], workPeople: [] };

  try {
    const [{ data: bio }, { data: orgs }] = await Promise.all([
      supabaseAdmin
        .from('narrative_accounts')
        .select('metadata')
        .eq('user_id', userId)
        .eq('account_type', 'biography_snapshot')
        .maybeSingle(),
      supabaseAdmin
        .from('organizations')
        .select('id, name, org_type, metadata')
        .eq('user_id', userId),
    ]);

    const facts = (bio?.metadata as Record<string, unknown> | null)?.facts as
      | { identity?: { employment?: string } }
      | undefined;
    inputs.employmentPhrase = facts?.identity?.employment ?? null;

    const workOrgs = (orgs ?? []).filter((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      return (
        WORK_ORG_TYPE_RE.test(String(o.org_type ?? '')) ||
        meta.is_workplace === true ||
        (inputs.employmentPhrase ?? '').toLowerCase().includes(String(o.name).toLowerCase())
      );
    });

    inputs.organizations = workOrgs.map((o) => {
      const meta = (o.metadata ?? {}) as Record<string, unknown>;
      return {
        id: o.id as string,
        name: o.name as string,
        parentName: typeof meta.parent_organization === 'string' ? meta.parent_organization : null,
        orgType: (o.org_type as string) ?? null,
        isTeam: /team|squad|department|lab$/i.test(String(o.name)),
        userRole: typeof meta.user_role === 'string' ? meta.user_role : null,
      };
    });

    if (workOrgs.length > 0) {
      const { data: members } = await supabaseAdmin
        .from('organization_members')
        .select('organization_id, character_id, character_name, role, notes')
        .eq('user_id', userId)
        .in('organization_id', workOrgs.map((o) => o.id));

      inputs.workPeople = (members ?? [])
        .filter((m) => m.character_name)
        .map((m) => ({
          personId: (m.character_id as string) ?? undefined,
          name: m.character_name as string,
          roleEvidence: [m.role, m.notes].filter(Boolean).join('; ') || null,
          storedRelationshipType: null,
          evidenceIds: [],
        }));
    }
  } catch (err) {
    logger.warn({ err, userId }, 'loadWorkContextInputs failed — returning partial inputs');
  }

  return inputs;
}

export async function resolveWorkContext(userId: string): Promise<WorkContext> {
  return buildWorkContext(await loadWorkContextInputs(userId));
}
