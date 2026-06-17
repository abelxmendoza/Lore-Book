/**
 * Rewrite resolved_events.people UUIDs to canonical characters.id.
 */

import { logger } from '../logger';

import { characterAuthorityService } from './characterAuthorityService';
import { supabaseAdmin } from './supabaseClient';

export type ResolvedEventsPeopleBackfillReport = {
  eventsScanned: number;
  eventsUpdated: number;
  idsRewritten: number;
  idsUnmapped: number;
};

class ResolvedEventPeopleService {
  async backfillForUser(userId: string, dryRun = false): Promise<ResolvedEventsPeopleBackfillReport> {
    const report: ResolvedEventsPeopleBackfillReport = {
      eventsScanned: 0,
      eventsUpdated: 0,
      idsRewritten: 0,
      idsUnmapped: 0,
    };

    const { data: events, error } = await supabaseAdmin
      .from('resolved_events')
      .select('id, people, metadata')
      .eq('user_id', userId);
    if (error) throw error;

    for (const event of events ?? []) {
      report.eventsScanned++;
      const people = (event.people ?? []) as string[];
      if (people.length === 0) continue;

      const canonical: string[] = [];
      const unmapped: string[] = [];

      for (const refId of people) {
        const characterId = await characterAuthorityService.resolvePersonReferenceId(userId, refId);
        if (characterId) {
          if (characterId !== refId) report.idsRewritten++;
          if (!canonical.includes(characterId)) canonical.push(characterId);
        } else {
          unmapped.push(refId);
          report.idsUnmapped++;
        }
      }

      const deduped = [...new Set(canonical)];
      const changed =
        deduped.length !== people.length ||
        deduped.some((id, i) => id !== people[i]) ||
        unmapped.length > 0;

      if (!changed) continue;

      if (!dryRun) {
        const metadata = {
          ...((event.metadata ?? {}) as Record<string, unknown>),
          people_canonicalized_at: new Date().toISOString(),
          ...(unmapped.length > 0 ? { people_unmapped_refs: unmapped } : {}),
        };
        await supabaseAdmin
          .from('resolved_events')
          .update({ people: deduped, metadata, updated_at: new Date().toISOString() })
          .eq('id', event.id)
          .eq('user_id', userId);
      }
      report.eventsUpdated++;
    }

    logger.info({ userId, report, dryRun }, 'Resolved events people backfill complete');
    return report;
  }
}

export const resolvedEventPeopleService = new ResolvedEventPeopleService();
