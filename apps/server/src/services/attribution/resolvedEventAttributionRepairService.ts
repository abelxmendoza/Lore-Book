import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { planResolvedEventAttributionRepair, type AttributionRepairPlan } from './eventAttributionRepair';

export type AttributionRepairOptions = {
  dryRun?: boolean;
  limit?: number;
};

export type AttributionRepairReport = {
  userId: string;
  dryRun: boolean;
  eventsScanned: number;
  eventsChanged: number;
  peopleRemoved: number;
  locationsRemoved: number;
  peopleAdded: number;
  locationsAdded: number;
  samples: Array<{
    eventId: string;
    title: string;
    peopleRemoved: string[];
    locationsRemoved: string[];
  }>;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function loadUnitTextByEventId(
  userId: string,
  eventIds: string[],
): Promise<Map<string, string>> {
  const byEvent = new Map<string, string>();
  if (eventIds.length === 0) return byEvent;

  const { data: links, error: linkError } = await supabaseAdmin
    .from('event_unit_links')
    .select('event_id, unit_id')
    .in('event_id', eventIds);
  if (linkError) throw linkError;
  const unitIds = [...new Set((links ?? []).map((row) => row.unit_id as string).filter(Boolean))];
  if (unitIds.length === 0) return byEvent;

  const { data: units, error: unitError } = await supabaseAdmin
    .from('extracted_units')
    .select('id, content')
    .eq('user_id', userId)
    .in('id', unitIds);
  if (unitError) throw unitError;
  const contentById = new Map((units ?? []).map((row) => [row.id as string, String(row.content ?? '')]));
  for (const link of links ?? []) {
    const extra = contentById.get(link.unit_id as string);
    if (!extra) continue;
    const prior = byEvent.get(link.event_id as string) ?? '';
    byEvent.set(link.event_id as string, prior ? `${prior}\n${extra}` : extra);
  }
  return byEvent;
}

/**
 * Tenant-scoped historical repair. Dry-run by default. Never creates a new
 * canonical event; only rewrites people/locations + entityAttributions.
 */
export async function repairResolvedEventAttributionForUser(
  userId: string,
  opts: AttributionRepairOptions = {},
): Promise<AttributionRepairReport> {
  const dryRun = opts.dryRun !== false;
  const report: AttributionRepairReport = {
    userId,
    dryRun,
    eventsScanned: 0,
    eventsChanged: 0,
    peopleRemoved: 0,
    locationsRemoved: 0,
    peopleAdded: 0,
    locationsAdded: 0,
    samples: [],
  };

  const [charactersRes, locationsRes, eventsRes] = await Promise.all([
    supabaseAdmin.from('characters').select('id, name, alias').eq('user_id', userId),
    supabaseAdmin.from('locations').select('id, name, aliases').eq('user_id', userId),
    supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, people, locations, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(opts.limit ?? 5000),
  ]);
  if (charactersRes.error) throw charactersRes.error;
  if (locationsRes.error) throw locationsRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const characterRefs = (charactersRes.data ?? []).map((row) => ({
    id: row.id as string,
    names: [row.name as string, ...asStringArray(row.alias)],
  }));
  const locationRefs = (locationsRes.data ?? []).map((row) => ({
    id: row.id as string,
    names: [row.name as string, ...asStringArray(row.aliases)],
  }));
  const events = eventsRes.data ?? [];
  const unitText = await loadUnitTextByEventId(userId, events.map((row) => row.id as string));

  for (const event of events) {
    report.eventsScanned++;
    const plan: AttributionRepairPlan = planResolvedEventAttributionRepair(
      {
        id: event.id as string,
        title: event.title as string | null,
        summary: event.summary as string | null,
        people: asStringArray(event.people),
        locations: asStringArray(event.locations),
        metadata: (event.metadata as Record<string, unknown> | null) ?? {},
      },
      characterRefs,
      locationRefs,
      unitText.get(event.id as string) ?? '',
    );
    if (!plan.changed) continue;

    report.eventsChanged++;
    report.peopleRemoved += plan.peopleRemoved.length;
    report.locationsRemoved += plan.locationsRemoved.length;
    report.peopleAdded += plan.peopleAdded.length;
    report.locationsAdded += plan.locationsAdded.length;
    if (report.samples.length < 25) {
      report.samples.push({
        eventId: plan.eventId,
        title: (event.title as string) ?? '',
        peopleRemoved: plan.peopleRemoved,
        locationsRemoved: plan.locationsRemoved,
      });
    }

    if (dryRun) continue;

    const metadata = {
      ...((event.metadata as Record<string, unknown> | null) ?? {}),
      entityAttributions: plan.attributions,
      attributionRepair: {
        at: new Date().toISOString(),
        people_removed: plan.peopleRemoved.length,
        locations_removed: plan.locationsRemoved.length,
        people_added: plan.peopleAdded.length,
        locations_added: plan.locationsAdded.length,
      },
    };
    const { error } = await supabaseAdmin
      .from('resolved_events')
      .update({
        people: plan.people,
        locations: plan.locations,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('id', plan.eventId);
    if (error) {
      logger.error({ error, userId, eventId: plan.eventId }, 'attribution_repair: update failed');
      throw error;
    }
  }

  logger.info({ ...report, samples: undefined }, 'attribution_repair: completed');
  return report;
}
