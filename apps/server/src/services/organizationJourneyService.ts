/**
 * Structured "journey" data for an organization — the transition log from
 * organizationRelationshipStateService, associated timeline events (reusing
 * subjectTimelineCompiler's already-built entity-timeline pipeline), and
 * people first connected through this org (via characterConnectionService's
 * connection_origins provenance).
 *
 * Deliberately a plain data object, not prose or a UI — a future
 * journey/dashboard feature would read this rather than recomputing it.
 */

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { organizationService } from './organizationService';
import { compileSubjectTimelineForUser } from './timeline/subjectTimelineCompiler';

export type OrganizationJourneyMilestone = {
  date: string;
  type: 'relationship_change' | 'event';
  label: string;
};

export type OrganizationJourneyKeyPerson = {
  characterId: string;
  name: string;
  firstSeenAt: string;
};

export type OrganizationJourney = {
  organizationId: string;
  organizationName: string;
  currentRelationship: string;
  milestones: OrganizationJourneyMilestone[];
  keyPeople: OrganizationJourneyKeyPerson[];
};

type ConnectionOriginEntry = { entityType: string; entityId: string; entityName: string; firstSeenAt: string };

async function findKeyPeopleForOrganization(
  userId: string,
  organizationId: string,
): Promise<OrganizationJourneyKeyPerson[]> {
  const { data: rows } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata')
    .eq('user_id', userId)
    .limit(1000);

  const people: OrganizationJourneyKeyPerson[] = [];
  for (const row of (rows ?? []) as Array<{ id: string; name: string; metadata: Record<string, unknown> | null }>) {
    const origins = (row.metadata?.connection_origins ?? {}) as Record<string, ConnectionOriginEntry>;
    for (const origin of Object.values(origins)) {
      if (origin?.entityId === organizationId) {
        people.push({ characterId: row.id, name: row.name, firstSeenAt: origin.firstSeenAt });
        break;
      }
    }
  }
  return people;
}

export async function buildOrganizationJourney(
  userId: string,
  organizationId: string,
): Promise<OrganizationJourney | null> {
  try {
    const org = await organizationService.getOrganization(userId, organizationId);
    if (!org) return null;

    const [{ data: historyRows }, timeline, keyPeople] = await Promise.all([
      supabaseAdmin
        .from('organization_relationship_history')
        .select('to_relationship, changed_at, evidence')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .order('changed_at', { ascending: true }),
      compileSubjectTimelineForUser({
        userId,
        query: org.name,
        subject: { entityId: organizationId, entityType: 'organization' },
      }).catch(() => null),
      findKeyPeopleForOrganization(userId, organizationId),
    ]);

    const relationshipMilestones: OrganizationJourneyMilestone[] = (
      (historyRows ?? []) as Array<{ to_relationship: string; changed_at: string }>
    ).map((row) => ({
      date: row.changed_at,
      type: 'relationship_change',
      label: `Became ${row.to_relationship.replace(/_/g, ' ')}`,
    }));

    const eventMilestones: OrganizationJourneyMilestone[] = (timeline?.events ?? [])
      .filter((e) => e.significance !== 'low')
      .slice(0, 20)
      .map((e) => ({ date: e.start_time, type: 'event' as const, label: e.title }));

    const milestones = [...relationshipMilestones, ...eventMilestones].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return {
      organizationId,
      organizationName: org.name,
      currentRelationship: org.user_relationship,
      milestones,
      keyPeople,
    };
  } catch (error) {
    logger.debug({ error, userId, organizationId }, 'Failed to build organization journey (non-fatal)');
    return null;
  }
}
