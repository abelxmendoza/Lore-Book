// =====================================================
// LIFE ARC SERVICE
// Purpose: Generate narrative, human-understandable
// summaries of recent life events
// =====================================================

import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

import { entityConfidenceService } from './entityConfidenceService';
import { metaControlService } from './metaControlService';
import { narrativeContinuityService } from './narrativeContinuityService';
import { stabilityDetectionService } from './stabilityDetectionService';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type Timeframe = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS';

interface Event {
  id: string;
  title: string;
  summary: string | null;
  start_time: string;
  end_time: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  activities: string[];
  type: string | null;
}

interface EventGroup {
  significant_events: Event[];
  recurring_patterns: Array<{
    label: string;
    event_ids: string[];
    frequency: number;
  }>;
  new_entities: Array<{
    type: 'PERSON' | 'LOCATION';
    id: string;
    name: string;
    first_seen: string;
  }>;
  unresolved_events: Event[];
}

interface ChangeSignals {
  first_time_people: Array<{ id: string; name: string; first_seen: string }>;
  first_time_locations: Array<{ id: string; name: string; first_seen: string }>;
  pattern_shifts: Array<{ description: string; evidence_event_ids: string[] }>;
  emotional_shifts: Array<{ description: string; evidence_event_ids: string[] }>;
}

interface NarrativeSummary {
  text: string;
  event_ids: string[];
  confidence: number;
}

interface LifeArcResult {
  timeframe: Timeframe;
  event_groups: EventGroup;
  narrative_summary: NarrativeSummary;
  change_signals: ChangeSignals;
}

export class LifeArcService {
  /**
   * Get recent life arc for a user
   */
  async getRecentLifeArc(userId: string, timeframe: Timeframe): Promise<LifeArcResult> {
    try {
      // Calculate date range
      const { startDate, endDate } = this.getTimeframeDates(timeframe);

      // Fetch events within timeframe
      let events = await this.fetchEventsInTimeframe(userId, startDate, endDate);

      // Filter out archived events and events marked as not important
      events = await this.filterOverriddenEvents(userId, events);

      // Check stability before processing
      const newEntities = await this.detectNewEntities(userId, events, startDate);
      const patternStrength = await this.calculatePatternStrength(events);
      
      const stabilityContext = {
        events: events.map(e => ({ confidence: e.confidence })),
        newEntities: newEntities,
        patternStrength: patternStrength,
      };

      const silenceResponse = stabilityDetectionService.gateResponse(stabilityContext);

      // If stability detected, return silence response
      if (silenceResponse) {
        return {
          timeframe,
          event_groups: {
            significant_events: [],
            recurring_patterns: [],
            new_entities: [],
            unresolved_events: [],
          },
          narrative_summary: {
            text: silenceResponse.message,
            event_ids: [],
            confidence: 1.0, // High confidence in silence
          },
          change_signals: {
            first_time_people: [],
            first_time_locations: [],
            pattern_shifts: false,
            emotional_shifts: false,
          },
          stability_state: silenceResponse.stability_state,
          is_silence: true,
        };
      }

      // Group events
      const eventGroups = await this.groupEvents(userId, events, startDate);

      // Detect change signals
      const changeSignals = await this.detectChangeSignals(userId, events, startDate);

      // Detect continuity (only if signal is present - already checked above)
      const pastEvents = await this.fetchEventsBeforeTimeframe(userId, startDate);
      const continuityLinks = await narrativeContinuityService.detectContinuity(
        userId,
        events,
        pastEvents
      );

      // Map continuity notes to events
      const eventsWithContinuity = events.map(event => {
        const eventLinks = continuityLinks.filter(l => l.current_event_id === event.id);
        return {
          ...event,
          continuity_notes: eventLinks.map(link =>
            narrativeContinuityService.generateContinuityLanguage(link)
          ),
        };
      });

      // Generate narrative summary
      const narrativeSummary = await this.generateNarrativeSummary(eventGroups);

      // NEW: Aggregate entity confidence for this arc
      const arcConfidences = await this.aggregateArcConfidence(userId, events);
      const avgArcConfidence = arcConfidences.length > 0
        ? arcConfidences.reduce((a, b) => a + b, 0) / arcConfidences.length
        : 0.5;

      // NEW: Add confidence metadata to narrative summary
      const narrativeSummaryWithConfidence: NarrativeSummary = {
        ...narrativeSummary,
        confidence: avgArcConfidence,
        uncertainty_note: avgArcConfidence < 0.5
          ? "This arc contains high ambiguity overall"
          : undefined,
      };

      return {
        timeframe,
        event_groups: eventGroups,
        narrative_summary: narrativeSummaryWithConfidence,
        change_signals: changeSignals,
        stability_state: 'SIGNAL_PRESENT' as const,
        is_silence: false,
        events_with_continuity: eventsWithContinuity,
        // NEW: Add confidence metadata
        confidence_metadata: {
          avg_confidence: avgArcConfidence,
          confidence_mode: avgArcConfidence < 0.5 ? 'UNCERTAIN' : 'NORMAL',
          entity_count: arcConfidences.length,
        },
      };
    } catch (error) {
      logger.error({ error, userId, timeframe }, 'Failed to get recent life arc');
      throw error;
    }
  }

  /**
   * Get date range for timeframe
   */
  private getTimeframeDates(timeframe: Timeframe): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    let days = 7;

    switch (timeframe) {
      case 'LAST_7_DAYS':
        days = 7;
        break;
      case 'LAST_30_DAYS':
        days = 30;
        break;
      case 'LAST_90_DAYS':
        days = 90;
        break;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return { startDate, endDate };
  }

  /**
   * Filter events based on meta overrides
   */
  private async filterOverriddenEvents(
    userId: string,
    events: Event[]
  ): Promise<Event[]> {
    const filtered: Event[] = [];

    for (const event of events) {
      // Check for ARCHIVE override
      const isArchived = await metaControlService.hasOverride(
        userId,
        event.id,
        'EVENT',
        'ARCHIVE'
      );
      if (isArchived) continue;

      // Check for NOT_IMPORTANT override
      const isNotImportant = await metaControlService.hasOverride(
        userId,
        event.id,
        'EVENT',
        'NOT_IMPORTANT'
      );
      if (isNotImportant) continue;

      filtered.push(event);
    }

    return filtered;
  }

  /**
   * Fetch events within timeframe
   */
  private async fetchEventsInTimeframe(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Event[]> {
    const { data: events, error } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: false });

    if (error) {
      throw error;
    }

    return (events || []).map(e => ({
      id: e.id,
      title: e.title,
      summary: e.summary,
      start_time: e.start_time,
      end_time: e.end_time,
      confidence: e.confidence || 0.5,
      people: e.people || [],
      locations: e.locations || [],
      activities: e.activities || [],
      type: e.type,
    }));
  }

  /**
   * Group events into meaningful categories
   */
  private async groupEvents(
    userId: string,
    events: Event[],
    timeframeStart: Date
  ): Promise<EventGroup> {
    // Significant events (high confidence)
    const significant_events = events.filter(e => e.confidence >= 0.7);

    // Unresolved events (low confidence)
    const unresolved_events = events.filter(e => e.confidence < 0.4);

      // Detect recurring patterns (filtered by overrides)
      const recurring_patterns = await this.detectRecurringPatterns(events, userId);

    // Detect new entities
    const new_entities = await this.detectNewEntities(userId, events, timeframeStart);

    return {
      significant_events,
      recurring_patterns,
      new_entities,
      unresolved_events,
    };
  }

  /**
   * Detect recurring patterns in events
   */
  private async detectRecurringPatterns(
    events: Event[]
  ): Promise<Array<{ label: string; event_ids: string[]; frequency: number }>> {
    // Group events by activity type or location
    const activityGroups = new Map<string, string[]>();
    const locationGroups = new Map<string, string[]>();

    events.forEach(event => {
      // Group by activities
      if (event.activities && event.activities.length > 0) {
        event.activities.forEach(activity => {
          if (!activityGroups.has(activity)) {
            activityGroups.set(activity, []);
          }
          activityGroups.get(activity)!.push(event.id);
        });
      }

      // Group by locations
      if (event.locations && event.locations.length > 0) {
        event.locations.forEach(locationId => {
          if (!locationGroups.has(locationId)) {
            locationGroups.set(locationId, []);
          }
          locationGroups.get(locationId)!.push(event.id);
        });
      }
    });

    const patterns: Array<{ label: string; event_ids: string[]; frequency: number }> = [];

    // Add activity patterns (2+ occurrences)
    activityGroups.forEach((eventIds, activity) => {
      if (eventIds.length >= 2) {
        patterns.push({
          label: activity,
          event_ids: eventIds,
          frequency: eventIds.length,
        });
      }
    });

    // Add location patterns (2+ occurrences)
    locationGroups.forEach((eventIds, locationId) => {
      if (eventIds.length >= 2) {
        // Try to get location name
        patterns.push({
          label: `Location: ${locationId.substring(0, 8)}...`,
          event_ids: eventIds,
          frequency: eventIds.length,
        });
      }
    });

    return patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 5);
  }

  /**
   * Detect new entities (people/locations) that appeared in timeframe
   */
  private async detectNewEntities(
    userId: string,
    events: Event[],
    timeframeStart: Date
  ): Promise<Array<{ type: 'PERSON' | 'LOCATION'; id: string; name: string; first_seen: string }>> {
    const newEntities: Array<{ type: 'PERSON' | 'LOCATION'; id: string; name: string; first_seen: string }> = [];

    // Get all entity IDs from events
    const allPersonIds = new Set<string>();
    const allLocationIds = new Set<string>();

    events.forEach(event => {
      event.people.forEach(id => allPersonIds.add(id));
      event.locations.forEach(id => allLocationIds.add(id));
    });

    // Check if entities existed before timeframe
    for (const personId of allPersonIds) {
      const { data: earlierEvents } = await supabaseAdmin
        .from('resolved_events')
        .select('id, start_time')
        .eq('user_id', userId)
        .contains('people', [personId])
        .lt('start_time', timeframeStart.toISOString())
        .limit(1);

      if (!earlierEvents || earlierEvents.length === 0) {
        // This is a new person
        const firstEvent = events.find(e => e.people.includes(personId));
        if (firstEvent) {
          newEntities.push({
            type: 'PERSON',
            id: personId,
            name: personId.substring(0, 8) + '...', // Placeholder - could fetch actual name
            first_seen: firstEvent.start_time,
          });
        }
      }
    }

    for (const locationId of allLocationIds) {
      const { data: earlierEvents } = await supabaseAdmin
        .from('resolved_events')
        .select('id, start_time')
        .eq('user_id', userId)
        .contains('locations', [locationId])
        .lt('start_time', timeframeStart.toISOString())
        .limit(1);

      if (!earlierEvents || earlierEvents.length === 0) {
        // This is a new location
        const firstEvent = events.find(e => e.locations.includes(locationId));
        if (firstEvent) {
          newEntities.push({
            type: 'LOCATION',
            id: locationId,
            name: locationId.substring(0, 8) + '...', // Placeholder - could fetch actual name
            first_seen: firstEvent.start_time,
          });
        }
      }
    }

    return newEntities;
  }

  /**
   * Detect change signals
   */
  private async detectChangeSignals(
    userId: string,
    events: Event[],
    timeframeStart: Date
  ): Promise<ChangeSignals> {
    // Get new entities
    const newEntities = await this.detectNewEntities(userId, events, timeframeStart);

    const first_time_people = newEntities
      .filter(e => e.type === 'PERSON')
      .map(e => ({ id: e.id, name: e.name, first_seen: e.first_seen }));

    const first_time_locations = newEntities
      .filter(e => e.type === 'LOCATION')
      .map(e => ({ id: e.id, name: e.name, first_seen: e.first_seen }));

    // Detect pattern shifts (simplified - could be enhanced with ML)
    const pattern_shifts: Array<{ description: string; evidence_event_ids: string[] }> = [];
    // TODO: Implement pattern shift detection

    // Detect emotional shifts (simplified - could analyze event summaries)
    const emotional_shifts: Array<{ description: string; evidence_event_ids: string[] }> = [];
    // TODO: Implement emotional shift detection

    return {
      first_time_people,
      first_time_locations,
      pattern_shifts,
      emotional_shifts,
    };
  }

  /**
   * Generate narrative summary using LLM
   */
  private async generateNarrativeSummary(eventGroups: EventGroup): Promise<NarrativeSummary> {
    try {
      const significantEvents = eventGroups.significant_events.slice(0, 10);
      const recurringPatterns = eventGroups.recurring_patterns.slice(0, 5);
      const newEntities = eventGroups.new_entities.slice(0, 5);
      const unresolvedEvents = eventGroups.unresolved_events.slice(0, 5);

      const eventSummaries = significantEvents.map(e => ({
        title: e.title,
        summary: e.summary || '',
        when: e.start_time,
      }));

      const prompt = `You are an observer summarizing recent life events. Your role is to observe, not judge or advise.

Rules:
- Do not judge
- Do not advise
- Do not invent facts
- Cite events by title when relevant
- Focus on changes, continuity, and notable moments
- This is an observation, not advice
- Be concise (2-3 sentences)

Recent significant events:
${eventSummaries.map(e => `- ${e.title}${e.summary ? `: ${e.summary}` : ''}`).join('\n')}

${recurringPatterns.length > 0 ? `Recurring patterns: ${recurringPatterns.map(p => p.label).join(', ')}\n` : ''}
${newEntities.length > 0 ? `New people/locations appeared: ${newEntities.length}\n` : ''}
${unresolvedEvents.length > 0 ? `Unclear moments: ${unresolvedEvents.length}\n` : ''}

Provide a brief, observational summary of what stands out from these recent events.`;

      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are an objective observer summarizing life events. You observe patterns and changes without judgment or advice.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      const summaryText = completion.choices[0]?.message?.content || 'No summary available.';

      return {
        text: summaryText,
        event_ids: significantEvents.map(e => e.id),
        confidence: 0.8, // LLM-generated summaries have moderate confidence
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to generate narrative summary, using fallback');
      return {
        text: 'Recent events have been recorded. Review them to see what stands out.',
        event_ids: eventGroups.significant_events.map(e => e.id),
        confidence: 0.5,
      };
    }
  }
}

export const lifeArcService = new LifeArcService();

