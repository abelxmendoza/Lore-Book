/**
 * Hydrate Organization / Character / Location Timeline feeds from resolved_events.
 *
 * Resolves the admin/owner account via ADMIN_USER_ID / OWNER_USER_ID / auth role.
 * Never hardcodes a UUID. Logs counts only — no names, emails, or event titles.
 *
 *   cd apps/server && npx tsx src/scripts/hydrateBookEntityTimelines.ts
 *   cd apps/server && npx tsx src/scripts/hydrateBookEntityTimelines.ts --apply
 */

import { config } from '../config';
import { hydrateAllBookEntityTimelinesForUser } from '../services/lorebook/suggestions/suggestionEntityTimeline';
import { supabaseAdmin } from '../services/supabaseClient';

function parseFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function parseArg(argv: string[], flag: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function resolveAdminUserId(explicit?: string): Promise<string> {
  if (explicit?.trim()) return explicit.trim();
  if (config.adminUserId?.trim()) return config.adminUserId.trim();
  if (config.ownerUserId?.trim()) return config.ownerUserId.trim();

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const matches = data.users.filter((u) => {
    const role = String(u.app_metadata?.role ?? '').toLowerCase();
    const email = u.email?.toLowerCase();
    return (
      role === 'admin' ||
      role === 'owner' ||
      (config.adminEmail && email === config.adminEmail) ||
      (config.ownerEmail && email === config.ownerEmail)
    );
  });
  if (matches.length === 0) {
    throw new Error('Could not resolve admin account. Set ADMIN_USER_ID or OWNER_USER_ID.');
  }
  if (matches.length === 1) return matches[0].id;
  const byAdminEmail = config.adminEmail
    ? matches.find((u) => u.email?.toLowerCase() === config.adminEmail)
    : undefined;
  if (byAdminEmail) return byAdminEmail.id;
  const byOwnerEmail = config.ownerEmail
    ? matches.find((u) => u.email?.toLowerCase() === config.ownerEmail)
    : undefined;
  if (byOwnerEmail) return byOwnerEmail.id;
  throw new Error(
    `Ambiguous admin accounts (${matches.length}). Set ADMIN_USER_ID.`,
  );
}

async function countRows(table: string, userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

type Coverage = {
  eventsWithOrgAttributions: number;
  orgsWithTimelineEvents: number;
  eventsWithPeople: number;
  peopleOnEvents: number;
  eventsWithPlaces: number;
  placesOnEvents: number;
  attributionRoles: Record<string, number>;
  attributionsAcceptedForTimeline: number;
  attributionsMissingOrgId: number;
};

function readAttributions(metadata: unknown): Array<{
  organizationId?: string | null;
  role?: string;
  acceptedForOrganizationTimeline?: boolean;
  unresolved?: boolean;
}> {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as Record<string, unknown>).organizationAttributions;
  return Array.isArray(raw) ? raw : [];
}

async function measureCoverage(userId: string): Promise<Coverage> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('people, locations, metadata')
    .eq('user_id', userId);
  if (error) throw error;

  const orgs = new Set<string>();
  const people = new Set<string>();
  const places = new Set<string>();
  const attributionRoles: Record<string, number> = {};
  let eventsWithOrgAttributions = 0;
  let eventsWithPeople = 0;
  let eventsWithPlaces = 0;
  let attributionsAcceptedForTimeline = 0;
  let attributionsMissingOrgId = 0;

  for (const row of data ?? []) {
    const attributions = readAttributions(row.metadata);
    if (attributions.length > 0) eventsWithOrgAttributions += 1;
    for (const attr of attributions) {
      const role = String(attr.role ?? 'unknown');
      attributionRoles[role] = (attributionRoles[role] ?? 0) + 1;
      if (!attr.organizationId) attributionsMissingOrgId += 1;
      if (attr.acceptedForOrganizationTimeline && attr.organizationId && !attr.unresolved) {
        attributionsAcceptedForTimeline += 1;
        orgs.add(attr.organizationId);
      }
    }
    const peopleIds = Array.isArray(row.people) ? row.people.filter(Boolean) : [];
    const placeIds = Array.isArray(row.locations) ? row.locations.filter(Boolean) : [];
    if (peopleIds.length > 0) {
      eventsWithPeople += 1;
      for (const id of peopleIds) people.add(id);
    }
    if (placeIds.length > 0) {
      eventsWithPlaces += 1;
      for (const id of placeIds) places.add(id);
    }
  }

  return {
    eventsWithOrgAttributions,
    orgsWithTimelineEvents: orgs.size,
    eventsWithPeople,
    peopleOnEvents: people.size,
    eventsWithPlaces,
    placesOnEvents: places.size,
    attributionRoles,
    attributionsAcceptedForTimeline,
    attributionsMissingOrgId,
  };
}

async function main(): Promise<void> {
  const apply = parseFlag(process.argv, '--apply');
  const userId = await resolveAdminUserId(parseArg(process.argv, '--user'));

  const inventory = {
    organizations: await countRows('organizations', userId),
    characters: await countRows('characters', userId),
    locations: await countRows('locations', userId),
    resolvedEvents: await countRows('resolved_events', userId),
  };

  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'} — admin book-timeline hydrate ` +
      `(orgs=${inventory.organizations}, people=${inventory.characters}, ` +
      `places=${inventory.locations}, events=${inventory.resolvedEvents})`,
  );

  const report = await hydrateAllBookEntityTimelinesForUser(userId, { dryRun: !apply });
  console.log(
    `journals: scanned=${report.journals.journalsScanned} ` +
      `${apply ? 'created' : 'wouldCreate'}=${report.journals.eventsCreated} ` +
      `skipped=${report.journals.skipped} foundationCreated=${report.foundationEventsCreated}`,
  );
  console.log(
    `organizations: catalog=${report.organizations.catalogSize} ` +
      `scanned=${report.organizations.eventsScanned} ` +
      `${apply ? 'updated' : 'wouldUpdate'}=${report.organizations.eventsUpdated} ` +
      `attributions=${report.organizations.attributionsAdded}`,
  );
  console.log(
    `people+places: scanned=${report.charactersAndLocations.eventsScanned} ` +
      `${apply ? 'updated' : 'wouldUpdate'}=${report.charactersAndLocations.eventsUpdated} ` +
      `people+${report.charactersAndLocations.peopleAdded} ` +
      `places+${report.charactersAndLocations.locationsAdded}`,
  );

  const coverage = await measureCoverage(userId);
  const eventsAfter = await countRows('resolved_events', userId);
  const roles = Object.entries(coverage.attributionRoles)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => `${role}:${n}`)
    .join(',') || 'none';
  console.log(
    `coverage: events=${eventsAfter} orgTimelineEvents=${coverage.eventsWithOrgAttributions} ` +
      `orgsWithFeed=${coverage.orgsWithTimelineEvents}/${inventory.organizations} ` +
      `timelineAccepted=${coverage.attributionsAcceptedForTimeline} ` +
      `missingOrgId=${coverage.attributionsMissingOrgId} roles=${roles} ` +
      `eventsWithPeople=${coverage.eventsWithPeople} peopleLinked=${coverage.peopleOnEvents}/${inventory.characters} ` +
      `eventsWithPlaces=${coverage.eventsWithPlaces} placesLinked=${coverage.placesOnEvents}/${inventory.locations}`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : 'hydrate failed');
    process.exit(1);
  },
);
