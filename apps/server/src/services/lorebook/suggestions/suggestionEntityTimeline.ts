/**
 * After a suggestion becomes a book card, attach historical resolved events
 * so the entity modal Timeline (Swimlanes + List) has a feed.
 *
 * Projections stay on-read; this only writes canonical event↔entity links.
 */

import { logger } from '../../../logger';
import { resolvedEventEntityBackfillService } from '../../chronologyV2/resolvedEventEntityBackfill';
import {
  backfillOrganizationAttributionsForEntity,
  backfillOrganizationAttributionsForUser,
  type UserOrganizationAttributionReport,
} from '../../organizations/organizationEventAttributionService';
import { timelineFoundationService } from '../../timelineFoundationService';
import {
  promoteDatedJournalsToResolvedEvents,
  type JournalResolvedEventReport,
} from './journalEntityResolvedEvents';

export type SuggestionTimelineEntity = {
  kind: 'organization' | 'location' | 'character';
  id: string;
};

export async function hydrateEntityTimelineAfterSuggestionAccept(
  userId: string,
  entity: SuggestionTimelineEntity,
): Promise<void> {
  try {
    if (entity.kind === 'organization') {
      await backfillOrganizationAttributionsForEntity(userId, entity.id);
      return;
    }
    await resolvedEventEntityBackfillService.backfillForEntity(userId, entity);
  } catch (error) {
    logger.warn({ error, userId, entity }, 'suggestion timeline hydrate failed');
  }
}

export type BookEntityTimelineHydrateReport = {
  foundationEventsCreated: number;
  journals: JournalResolvedEventReport;
  organizations: UserOrganizationAttributionReport;
  charactersAndLocations: {
    eventsScanned: number;
    eventsUpdated: number;
    peopleAdded: number;
    locationsAdded: number;
  };
};

/**
 * One-shot hydrate for every existing group, person, and place on a tenant.
 * Promotes dated journal mentions into resolved_events, then attaches
 * canonical event↔entity links. Additive. Dry-run by default.
 */
export async function hydrateAllBookEntityTimelinesForUser(
  userId: string,
  opts?: { dryRun?: boolean },
): Promise<BookEntityTimelineHydrateReport> {
  const dryRun = opts?.dryRun ?? true;
  let foundationEventsCreated = 0;
  if (!dryRun) {
    const foundation = await timelineFoundationService.generateTimelines(userId);
    foundationEventsCreated = foundation.resolvedEventsCreated;
  }
  const journals = await promoteDatedJournalsToResolvedEvents(userId, { dryRun });
  const organizations = await backfillOrganizationAttributionsForUser(userId, { dryRun });
  const peoplePlaces = await resolvedEventEntityBackfillService.backfillForUser(userId, dryRun);
  return {
    foundationEventsCreated,
    journals,
    organizations,
    charactersAndLocations: {
      eventsScanned: peoplePlaces.eventsScanned,
      eventsUpdated: peoplePlaces.eventsUpdated,
      peopleAdded: peoplePlaces.peopleAdded,
      locationsAdded: peoplePlaces.locationsAdded,
    },
  };
}
