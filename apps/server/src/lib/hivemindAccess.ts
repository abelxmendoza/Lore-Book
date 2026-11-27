/**
 * Hivemind access policy — the single place that decides whether an account
 * can use Hivemind (the cross-agent workspace: checkpoints, shared agent
 * memories, milestones; REST at /api/hivemind and hivemind_* MCP tools).
 *
 * Hivemind ships as a LoreBook feature on the same account system, available
 * to every signed-in account by default. It can be narrowed with one env var:
 *
 *   HIVEMIND_ACCESS=all         every signed-in account (default)
 *   HIVEMIND_ACCESS=privileged  owner + admin + developer
 *   HIVEMIND_ACCESS=founder     owner + admin
 *
 * Individual accounts (beta testers, a future paid plan) can be granted
 * access at any level with the server-set flag app_metadata.hivemind_access
 * = true. user_metadata is client-writable and is never consulted.
 */

import { config } from '../config';

import type { PlatformRole } from './accountAuthority';

export type HivemindAccessLevel = 'founder' | 'privileged' | 'all';

const ROLES_BY_LEVEL: Record<HivemindAccessLevel, ReadonlySet<PlatformRole> | 'all'> = {
  founder: new Set<PlatformRole>(['owner', 'admin']),
  privileged: new Set<PlatformRole>(['owner', 'admin', 'developer']),
  all: 'all',
};

export function hasHivemindGrant(appMetadata?: Record<string, unknown>): boolean {
  return appMetadata?.hivemind_access === true;
}

export function canUseHivemind(params: {
  role: PlatformRole;
  appMetadata?: Record<string, unknown>;
  level?: HivemindAccessLevel;
}): boolean {
  const level = params.level ?? config.hivemindAccess ?? 'all';
  if (hasHivemindGrant(params.appMetadata)) return true;
  const allowed = ROLES_BY_LEVEL[level] ?? ROLES_BY_LEVEL.founder;
  return allowed === 'all' ? true : allowed.has(params.role);
}
