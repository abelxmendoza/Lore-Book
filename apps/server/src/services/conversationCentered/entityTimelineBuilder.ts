// =====================================================
// ENTITY TIMELINE BUILDER
// Purpose: Build shared-experience/lore timelines for organizations and
// locations — the org/location equivalent of characterTimelineBuilder.ts,
// which remains character-only (its "self" character lookup and
// character_role vocabulary have no clean organization/location analog).
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type EntityKind = 'organization' | 'location';
export type TimelineType = 'shared_experience' | 'lore' | 'mentioned_in';

export interface EntityTimelineEvent {
  id: string;
  eventId?: string;
  sourceThreadId?: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  timelineType: TimelineType;
  entityRole?: string;
  userWasPresent: boolean;
  confidence: number;
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
          eventTitle: row.event_title || 'Untitled',
          eventDate: row.event_date || row.created_at,
          eventSummary: row.event_summary,
          eventType: row.event_type,
          timelineType: row.timeline_type as TimelineType,
          entityRole: row.entity_role,
          userWasPresent: row.user_was_present,
          confidence: row.confidence,
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

  /** Resolve organization membership → the org's member character ids. */
  private async getOrganizationMemberCharacterIds(userId: string, organizationId: string): Promise<string[]> {
    const { data: members } = await supabaseAdmin
      .from('organization_members')
      .select('character_id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    return (members || [])
      .map((m) => m.character_id as string | null)
      .filter((id): id is string => Boolean(id));
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
      const entityRole: string = this.kind === 'location' ? 'visited' : userWasPresent ? 'participant' : 'subject';

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

  /** Rebuild an entity's full timeline from both resolved_events and its primary-linked threads. */
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
        const memberIds = await this.getOrganizationMemberCharacterIds(userId, entityId);
        if (memberIds.length > 0) {
          const { data } = await supabaseAdmin
            .from('resolved_events')
            .select('*')
            .eq('user_id', userId)
            .overlaps('people', memberIds);
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

      const { data: threads } = await supabaseAdmin
        .from('conversation_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('primary_entity_type', this.kind)
        .eq('primary_entity_id', entityId);

      for (const thread of threads || []) {
        await this.processThreadForEntity(userId, entityId, thread.id);
      }
    } catch (error) {
      logger.error({ error, userId, entityId, kind: this.kind }, 'Failed to rebuild timelines for entity');
    }
  }
}

export const organizationTimelineBuilder = new EntityTimelineBuilder('organization');
export const locationTimelineBuilder = new EntityTimelineBuilder('location');
