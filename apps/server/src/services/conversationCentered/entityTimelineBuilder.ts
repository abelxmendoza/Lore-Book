// =====================================================
// ENTITY TIMELINE BUILDER
// Purpose: Build shared-experience/lore timelines for organizations and
// locations — the org/location equivalent of characterTimelineBuilder.ts,
// which remains character-only (its "self" character lookup and
// character_role vocabulary have no clean organization/location analog).
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { organizationService, type GroupEventAudience } from '../organizationService';
import { listUserPostedEventsForOrganization, type UserPostedEventRow } from '../events/userPostedEventService';

export type EntityKind = 'organization' | 'location';
export type TimelineType = 'shared_experience' | 'lore' | 'mentioned_in';

export interface EntityTimelineEvent {
  id: string;
  eventId?: string;
  sourceThreadId?: string;
  sourceEpisodeId?: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  timelineType: TimelineType;
  entityRole?: string;
  userWasPresent: boolean;
  confidence: number;
  /** Organization only. */
  involvedNames?: string[];
  audience?: GroupEventAudience;
  source?: 'conversation' | 'user_posted';
  subgroupNames?: string[];
}

/** Find the user's own "self" character row (same convention as characterTimelineBuilder). */
async function findSelfCharacterId(userId: string): Promise<string | null> {
  const { data: userCharacter } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'You')
    .or('name.ilike.%you%')
    .limit(1)
    .single();
  return userCharacter?.id ?? null;
}

/** Reverse lookup: which organizations (if any) does each of these characters belong to? */
export async function getOrganizationIdsForCharacters(
  userId: string,
  characterIds: string[]
): Promise<string[]> {
  if (characterIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .in('character_id', characterIds)
    .eq('status', 'active');

  return [...new Set((data || []).map((r) => r.organization_id as string))];
}

export class EntityTimelineBuilder {
  constructor(private readonly kind: EntityKind) {}

  async buildTimelines(
    userId: string,
    entityId: string
  ): Promise<{ sharedExperiences: EntityTimelineEvent[]; lore: EntityTimelineEvent[] }> {
    try {
      const { data: rows, error } = await supabaseAdmin
        .from('entity_timeline_events')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_type', this.kind)
        .eq('entity_id', entityId)
        .order('event_date', { ascending: true });

      if (error) throw error;

      const sharedExperiences: EntityTimelineEvent[] = [];
      const lore: EntityTimelineEvent[] = [];

      for (const row of rows || []) {
        const entry: EntityTimelineEvent = {
          id: row.id,
          eventId: row.event_id ?? undefined,
          sourceThreadId: row.source_thread_id ?? undefined,
          sourceEpisodeId: row.source_episode_id ?? undefined,
          eventTitle: row.event_title || 'Untitled',
          eventDate: row.event_date || '',
          eventSummary: row.event_summary,
          eventType: row.event_type,
          timelineType: row.timeline_type as TimelineType,
          entityRole: row.entity_role,
          userWasPresent: row.user_was_present,
          confidence: row.confidence,
          involvedNames: row.involved_names ?? undefined,
          audience: row.audience ?? undefined,
          source: row.source ?? undefined,
          subgroupNames: row.subgroup_names ?? undefined,
        };

        if (row.timeline_type === 'shared_experience') {
          sharedExperiences.push(entry);
        } else {
          lore.push(entry);
        }
      }

      return { sharedExperiences, lore };
    } catch (error) {
      logger.error({ error, userId, entityId, kind: this.kind }, 'Failed to build entity timelines');
      return { sharedExperiences: [], lore: [] };
    }
  }

  /** Resolve organization membership → the org's member character id→name map. */
  private async getOrganizationMembersMap(userId: string, organizationId: string): Promise<Map<string, string>> {
    const { data: members } = await supabaseAdmin
      .from('organization_members')
      .select('character_id, character_name')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    const map = new Map<string, string>();
    for (const m of members || []) {
      if (m.character_id) map.set(m.character_id, m.character_name);
    }
    return map;
  }

  /** Which of the org's subgroups (if any) does this set of involved character ids touch? */
  private async resolveSubgroupNames(
    userId: string,
    organizationId: string,
    involvedIds: string[]
  ): Promise<string[] | undefined> {
    if (involvedIds.length === 0) return undefined;
    const hierarchy = await organizationService.getGroupHierarchy(userId, organizationId);
    if (hierarchy.subgroups.length === 0) return undefined;

    const names = new Set<string>();
    for (const sg of hierarchy.subgroups) {
      const sgMembers = await organizationService.getMembers(sg.id);
      const sgIds = new Set(sgMembers.map((m) => m.character_id).filter(Boolean));
      if (involvedIds.some((id) => sgIds.has(id))) names.add(sg.name);
    }
    return names.size > 0 ? [...names] : undefined;
  }

  /**
   * Process a resolved_events row that involves this entity (org via member
   * overlap, location via direct containment) into a timeline entry.
   */
  async processEventForEntity(
    userId: string,
    entityId: string,
    eventId: string,
    event: {
      title: string;
      summary?: string;
      type?: string;
      start_time: string;
      people: string[];
    }
  ): Promise<void> {
    try {
      const selfCharacterId = await findSelfCharacterId(userId);
      const userWasPresent = Boolean(selfCharacterId && event.people.includes(selfCharacterId));

      const timelineType: TimelineType = userWasPresent ? 'shared_experience' : 'lore';
      let entityRole: string = this.kind === 'location' ? 'visited' : userWasPresent ? 'participant' : 'subject';

      let involvedNames: string[] | undefined;
      let audience: GroupEventAudience | undefined;
      let subgroupNames: string[] | undefined;
      let source: 'conversation' | 'user_posted' | undefined;

      if (this.kind === 'organization') {
        const memberMap = await this.getOrganizationMembersMap(userId, entityId);
        const involvedIds = event.people.filter((id) => memberMap.has(id));
        involvedNames = involvedIds.map((id) => memberMap.get(id)!);

        audience = organizationService.classifyGroupEventAudience({
          user_was_present: userWasPresent,
          involved: involvedNames,
          type: event.type ?? '',
          title: event.title,
          summary: event.summary,
        });
        subgroupNames = await this.resolveSubgroupNames(userId, entityId, involvedIds);
        source = 'conversation';
        entityRole = userWasPresent ? 'participant' : 'subject';
      }

      const { error } = await supabaseAdmin.from('entity_timeline_events').upsert(
        {
          user_id: userId,
          entity_type: this.kind,
          entity_id: entityId,
          event_id: eventId,
          source_thread_id: null,
          timeline_type: timelineType,
          user_was_present: userWasPresent,
          entity_role: entityRole,
          event_title: event.title,
          event_date: event.start_time,
          event_summary: event.summary,
          event_type: event.type,
          confidence: 0.7,
          involved_names: involvedNames ?? null,
          audience: audience ?? null,
          source: source ?? null,
          subgroup_names: subgroupNames ?? null,
          metadata: { processed_at: new Date().toISOString() },
        },
        { onConflict: 'user_id,entity_type,entity_id,event_id,timeline_type' }
      );

      if (error) {
        logger.warn({ error, userId, entityId, eventId, kind: this.kind }, 'Failed to upsert entity timeline event');
      }
    } catch (error) {
      logger.error({ error, userId, entityId, eventId, kind: this.kind }, 'Failed to process event for entity timeline');
    }
  }

  /**
   * Fold an explicit user-posted Life Log event into an organization's
   * timeline. Mirrors how the derived-context route tags these events —
   * always with_user/shared_experience, since the user logged it themselves.
   */
  private async processPostedEventForOrganization(
    userId: string,
    organizationId: string,
    postedEvent: UserPostedEventRow
  ): Promise<void> {
    try {
      const memberMap = await this.getOrganizationMembersMap(userId, organizationId);
      const involvedIds = (postedEvent.people ?? []).filter((id) => memberMap.has(id));
      const involvedNames = involvedIds.map((id) => memberMap.get(id)!);

      const { error } = await supabaseAdmin.from('entity_timeline_events').upsert(
        {
          user_id: userId,
          entity_type: 'organization',
          entity_id: organizationId,
          event_id: postedEvent.id,
          source_thread_id: null,
          timeline_type: 'shared_experience',
          user_was_present: true,
          entity_role: 'participant',
          event_title: postedEvent.title,
          event_date: postedEvent.start_time ?? new Date().toISOString(),
          event_summary: postedEvent.summary,
          event_type: postedEvent.type,
          confidence: 0.7,
          involved_names: involvedNames,
          audience: 'with_user' satisfies GroupEventAudience,
          source: 'user_posted',
          subgroup_names: null,
          metadata: { processed_at: new Date().toISOString() },
        },
        { onConflict: 'user_id,entity_type,entity_id,event_id,timeline_type' }
      );

      if (error) {
        logger.warn({ error, userId, organizationId, eventId: postedEvent.id }, 'Failed to upsert posted event timeline entry');
      }
    } catch (error) {
      logger.error({ error, userId, organizationId, eventId: postedEvent.id }, 'Failed to process posted event for organization timeline');
    }
  }

  /** Fold a conversation thread opened about this entity into its timeline as a lore entry. */
  private async processThreadForEntity(userId: string, entityId: string, sessionId: string): Promise<void> {
    try {
      const { data: session } = await supabaseAdmin
        .from('conversation_sessions')
        .select('title, updated_at, metadata')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!session) return;

      const threadMeta = (session.metadata as Record<string, unknown> | null)?.threadMeta as
        | { summary_short?: string | null; summary_medium?: string | null }
        | undefined;
      const summary = threadMeta?.summary_short || threadMeta?.summary_medium || undefined;

      const { error } = await supabaseAdmin.from('entity_timeline_events').upsert(
        {
          user_id: userId,
          entity_type: this.kind,
          entity_id: entityId,
          event_id: null,
          source_thread_id: sessionId,
          timeline_type: 'lore',
          user_was_present: true,
          entity_role: this.kind === 'location' ? 'referenced' : 'mentioned',
          event_title: session.title || 'Conversation',
          event_date: session.updated_at,
          event_summary: summary,
          event_type: 'conversation',
          confidence: 0.6,
          source: this.kind === 'organization' ? 'conversation' : null,
          metadata: { processed_at: new Date().toISOString() },
        },
        { onConflict: 'user_id,entity_type,entity_id,source_thread_id,timeline_type' }
      );

      if (error) {
        logger.warn({ error, userId, entityId, sessionId, kind: this.kind }, 'Failed to upsert thread-sourced timeline event');
      }
    } catch (error) {
      logger.error({ error, userId, entityId, sessionId, kind: this.kind }, 'Failed to process thread for entity timeline');
    }
  }

  /**
   * Fold a segmented episode where this location was the primary entity into
   * its timeline as a lore entry. Location kind only — organizations have no
   * per-episode data and stay on the whole-thread processThreadForEntity path.
   * Keyed to source_episode_id rather than source_thread_id so a thread with
   * several episodes for the same location gets one row per episode instead
   * of colliding into one on upsert.
   */
  async processEpisodeForEntity(
    userId: string,
    entityId: string,
    episode: { id: string; title: string; start_at: string }
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from('entity_timeline_events').upsert(
        {
          user_id: userId,
          entity_type: this.kind,
          entity_id: entityId,
          event_id: null,
          source_thread_id: null,
          source_episode_id: episode.id,
          timeline_type: 'lore',
          user_was_present: true,
          entity_role: 'referenced',
          event_title: episode.title || 'Conversation',
          event_date: episode.start_at,
          event_type: 'conversation',
          confidence: 0.6,
          source: null,
          metadata: { processed_at: new Date().toISOString() },
        },
        { onConflict: 'user_id,entity_type,entity_id,source_episode_id,timeline_type' }
      );

      if (error) {
        logger.warn(
          { error, userId, entityId, episodeId: episode.id, kind: this.kind },
          'Failed to upsert episode-sourced timeline event'
        );
      }
    } catch (error) {
      logger.error({ error, userId, entityId, episodeId: episode.id, kind: this.kind }, 'Failed to process episode for entity timeline');
    }
  }

  /** Rebuild an entity's full timeline from resolved_events, posted events (orgs), and its primary-linked threads. */
  async rebuildTimelinesForEntity(userId: string, entityId: string): Promise<void> {
    try {
      let events: Array<{ id: string; title: string; summary?: string; type?: string; start_time: string; people: string[] }> = [];

      if (this.kind === 'location') {
        const { data } = await supabaseAdmin
          .from('resolved_events')
          .select('*')
          .eq('user_id', userId)
          .contains('locations', [entityId]);
        events = data || [];
      } else {
        const memberMap = await this.getOrganizationMembersMap(userId, entityId);
        if (memberMap.size > 0) {
          const { data } = await supabaseAdmin
            .from('resolved_events')
            .select('*')
            .eq('user_id', userId)
            .overlaps('people', [...memberMap.keys()]);
          events = data || [];
        }
      }

      for (const event of events) {
        await this.processEventForEntity(userId, entityId, event.id, {
          title: event.title,
          summary: event.summary,
          type: event.type,
          start_time: event.start_time,
          people: event.people || [],
        });
      }

      if (this.kind === 'organization') {
        const posted = await listUserPostedEventsForOrganization(userId, entityId);
        for (const postedEvent of posted) {
          await this.processPostedEventForOrganization(userId, entityId, postedEvent);
        }

        const { data: threads } = await supabaseAdmin
          .from('conversation_sessions')
          .select('id')
          .eq('user_id', userId)
          .eq('primary_entity_type', this.kind)
          .eq('primary_entity_id', entityId);

        for (const thread of threads || []) {
          await this.processThreadForEntity(userId, entityId, thread.id);
        }
      } else {
        const { data: episodes } = await supabaseAdmin
          .from('episodes')
          .select('id, title, start_at')
          .eq('user_id', userId)
          .eq('primary_entity_type', 'location')
          .eq('primary_entity_id', entityId);

        for (const episode of episodes || []) {
          await this.processEpisodeForEntity(userId, entityId, episode);
        }
      }
    } catch (error) {
      logger.error({ error, userId, entityId, kind: this.kind }, 'Failed to rebuild timelines for entity');
    }
  }
}

export const organizationTimelineBuilder = new EntityTimelineBuilder('organization');
export const locationTimelineBuilder = new EntityTimelineBuilder('location');
