import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  applyOrganizationAttributionCorrection,
  attributeOrganizationsInEvent,
  mergeOrganizationAttributionMetadata,
  planOrganizationAttributionBackfill,
  planUserOrganizationAttributionBackfill,
  readOrganizationAttributions,
  type OrganizationAttribution,
  type OrganizationCatalogEntry,
  type OrganizationEventRole,
} from './organizationEventAttribution';

const CATALOG_COLS = 'id, name, aliases, parent_group_id, group_type';
const CATALOG_PAGE = 500;
const EVENT_PAGE = 1000;
const USER_WIDE_EVENT_CAP = 10_000;
const SUGGESTION_TIMELINE_EVENT_CAP = 1500;

type ResolvedEventAttributionRow = {
  id: string;
  title: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
};

function mapCatalogRow(row: {
  id: string;
  name: string;
  aliases?: unknown;
  parent_group_id?: string | null;
  group_type?: string | null;
}): OrganizationCatalogEntry {
  return {
    id: row.id,
    name: row.name,
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    parentGroupId: row.parent_group_id ?? null,
    groupType: row.group_type ?? null,
  };
}

export async function loadOrganizationCatalog(userId: string): Promise<OrganizationCatalogEntry[]> {
  const catalog: OrganizationCatalogEntry[] = [];
  for (let offset = 0; offset < 5_000; offset += CATALOG_PAGE) {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select(CATALOG_COLS)
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(offset, offset + CATALOG_PAGE - 1);
    if (error) {
      logger.warn({ error, userId }, 'organization attribution: catalog load failed');
      return catalog;
    }
    const rows = data ?? [];
    catalog.push(...rows.map(mapCatalogRow));
    if (rows.length < CATALOG_PAGE) break;
  }
  return catalog;
}

async function loadResolvedEventsPage(
  userId: string,
  offset: number,
  pageSize: number,
): Promise<ResolvedEventAttributionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;
  return (data ?? []) as ResolvedEventAttributionRow[];
}

async function writeOrganizationAttributionMetadata(
  userId: string,
  eventId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('resolved_events')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', eventId);
  if (error) {
    logger.warn({ error, userId, eventId }, 'organization attribution: backfill write failed');
    return false;
  }
  return true;
}

export async function backfillOrganizationAttributionsForEntity(
  userId: string,
  organizationId: string,
): Promise<{ eventsScanned: number; eventsUpdated: number }> {
  const report = { eventsScanned: 0, eventsUpdated: 0 };
  const catalog = await loadOrganizationCatalog(userId);
  if (!catalog.some((org) => org.id === organizationId)) return report;

  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(SUGGESTION_TIMELINE_EVENT_CAP);
  if (error) {
    logger.warn({ error, userId, organizationId }, 'organization attribution: suggestion backfill load failed');
    return report;
  }

  for (const event of data ?? []) {
    report.eventsScanned += 1;
    const text = `${event.title ?? ''} ${event.summary ?? ''}`;
    const nextMetadata = planOrganizationAttributionBackfill({
      text,
      existingMetadata: (event.metadata ?? {}) as Record<string, unknown>,
      catalog,
      organizationId,
    });
    if (!nextMetadata) continue;

    const { error: updateError } = await supabaseAdmin
      .from('resolved_events')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', event.id);
    if (updateError) {
      logger.warn({ error: updateError, userId, organizationId, eventId: event.id }, 'organization attribution: suggestion backfill write failed');
      continue;
    }
    report.eventsUpdated += 1;
  }

  if (report.eventsUpdated > 0) {
    logger.info({ userId, organizationId, ...report }, 'organization attribution: suggestion backfill completed');
  }
  return report;
}

export type UserOrganizationAttributionReport = {
  catalogSize: number;
  eventsScanned: number;
  eventsUpdated: number;
  attributionsAdded: number;
};

/**
 * Full-catalog pass: attach every org the event text newly supports.
 * Additive — does not drop prior attributions or user corrections.
 */
export async function backfillOrganizationAttributionsForUser(
  userId: string,
  opts?: { dryRun?: boolean; eventCap?: number },
): Promise<UserOrganizationAttributionReport> {
  const dryRun = opts?.dryRun ?? true;
  const eventCap = opts?.eventCap ?? USER_WIDE_EVENT_CAP;
  const report: UserOrganizationAttributionReport = {
    catalogSize: 0,
    eventsScanned: 0,
    eventsUpdated: 0,
    attributionsAdded: 0,
  };
  const catalog = await loadOrganizationCatalog(userId);
  report.catalogSize = catalog.length;
  if (catalog.length === 0) return report;

  try {
    for (let offset = 0; offset < eventCap; offset += EVENT_PAGE) {
      const events = await loadResolvedEventsPage(userId, offset, EVENT_PAGE);
      for (const event of events) {
        report.eventsScanned += 1;
        const existing = readOrganizationAttributions((event.metadata ?? {}) as Record<string, unknown>);
        const nextMetadata = planUserOrganizationAttributionBackfill({
          text: `${event.title ?? ''} ${event.summary ?? ''}`,
          existingMetadata: (event.metadata ?? {}) as Record<string, unknown>,
          catalog,
        });
        if (!nextMetadata) continue;
        const added =
          readOrganizationAttributions(nextMetadata).length - existing.length;
        report.eventsUpdated += 1;
        report.attributionsAdded += Math.max(0, added);
        if (dryRun) continue;
        const wrote = await writeOrganizationAttributionMetadata(userId, event.id, nextMetadata);
        if (!wrote) {
          report.eventsUpdated -= 1;
          report.attributionsAdded -= Math.max(0, added);
        }
      }
      if (events.length < EVENT_PAGE) break;
    }
  } catch (error) {
    logger.warn({ error, userId }, 'organization attribution: user-wide backfill load failed');
  }

  logger.info(
    { dryRun, catalogSize: report.catalogSize, eventsScanned: report.eventsScanned, eventsUpdated: report.eventsUpdated, attributionsAdded: report.attributionsAdded },
    'organization attribution: user-wide backfill completed',
  );
  return report;
}

export async function attributeOrganizationsForEventText(input: {
  userId: string;
  text: string;
  explicitOrganizationId?: string | null;
  existingMetadata?: Record<string, unknown> | null;
}): Promise<Record<string, unknown>> {
  try {
    const catalog = await loadOrganizationCatalog(input.userId);
    const existing = readOrganizationAttributions(input.existingMetadata);
    const next = attributeOrganizationsInEvent({
      text: input.text,
      organizations: catalog,
      explicitOrganizationId: input.explicitOrganizationId,
    });
    const merged = existing.length === 0
      ? next
      : mergePreservingCorrections(existing, next);
    return mergeOrganizationAttributionMetadata(input.existingMetadata, merged);
  } catch (error) {
    logger.warn({ error, userId: input.userId }, 'organization attribution: attach failed');
    return input.existingMetadata ?? {};
  }
}

function mergePreservingCorrections(
  existing: OrganizationAttribution[],
  incoming: OrganizationAttribution[],
): OrganizationAttribution[] {
  const byOrg = new Map(incoming.map((row) => [row.organizationId, row]));
  for (const row of existing) {
    if (!row.organizationId) continue;
    if (row.correctionHistory?.length) {
      byOrg.set(row.organizationId, row);
      continue;
    }
    if (row.rejected) byOrg.set(row.organizationId, row);
  }
  return [...byOrg.values()];
}

export async function persistOrganizationAttributionCorrection(input: {
  userId: string;
  eventId: string;
  fromOrganizationId?: string | null;
  toOrganizationId?: string | null;
  toOrganizationName?: string;
  retractOrganizationId?: string | null;
  retractRole?: OrganizationEventRole;
}): Promise<{ eventId: string; attributions: OrganizationAttribution[] } | null> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, metadata')
    .eq('user_id', input.userId)
    .eq('id', input.eventId)
    .maybeSingle();
  if (error || !data) {
    logger.warn({ error, ...input }, 'organization attribution: correction load failed');
    return null;
  }
  const current = (data.metadata ?? {}) as Record<string, unknown>;
  const attributions = applyOrganizationAttributionCorrection(
    readOrganizationAttributions(current),
    input,
  );
  const metadata = mergeOrganizationAttributionMetadata(current, attributions);
  const { error: updateError } = await supabaseAdmin
    .from('resolved_events')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('user_id', input.userId)
    .eq('id', input.eventId);
  if (updateError) {
    logger.warn({ error: updateError, ...input }, 'organization attribution: correction write failed');
    return null;
  }
  return { eventId: input.eventId, attributions };
}
