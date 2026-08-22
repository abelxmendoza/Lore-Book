import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  applyOrganizationAttributionCorrection,
  attributeOrganizationsInEvent,
  mergeOrganizationAttributionMetadata,
  readOrganizationAttributions,
  type OrganizationAttribution,
  type OrganizationCatalogEntry,
  type OrganizationEventRole,
} from './organizationEventAttribution';

const CATALOG_COLS = 'id, name, aliases, parent_group_id, group_type';

export async function loadOrganizationCatalog(userId: string): Promise<OrganizationCatalogEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select(CATALOG_COLS)
    .eq('user_id', userId)
    .limit(500);
  if (error) {
    logger.warn({ error, userId }, 'organization attribution: catalog load failed');
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    parentGroupId: (row.parent_group_id as string | null) ?? null,
    groupType: (row.group_type as string | null) ?? null,
  }));
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
