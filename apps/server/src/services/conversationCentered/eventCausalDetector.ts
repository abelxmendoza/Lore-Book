// =====================================================
// EVENT CAUSAL DETECTOR
// Purpose: Detect causal, enabling, and triggering relationships between events
// Example: "abuelo got West Nile virus" → "tia Lourdes at post-acute center"
// =====================================================

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type CausalType =
  | 'causes'           // Event A directly causes Event B
  | 'enables'         // Event A makes Event B possible
  | 'prevents'        // Event A prevents Event B
  | 'triggers'        // Event A triggers Event B
  | 'follows_from'    // Event B follows from Event A
  | 'reaction_to'     // Event B is a reaction to Event A
  | 'mitigates'       // Event A reduces impact of Event B
  | 'amplifies'       // Event A increases impact of Event B
  | 'parallel_to'     // Events happen simultaneously/related
  | 'replaces';       // Event B replaces Event A

export type EventCausalLink = {
  causeEventId: string;
  effectEventId: string;
  causalType: CausalType;
  confidence: number;
  causalStrength?: number;
  timeLagDays?: number;
  evidence: string;
  evidenceSourceIds: string[];
};

export type EventSummary = {
  id: string;
  title: string;
  summary: string | null;
  start_time: string;
  people: string[];
  locations: string[];
};

export class EventCausalDetector {
  /**
   * Detect causal relationships for a newly assembled event
   * Compares against past events to find causes, triggers, etc.
   */
  async detectCausalRelationships(
    userId: string,
    newEvent: EventSummary,
    sourceMessages: Array<{ id: string; content: string }>,
    sourceJournalEntries: Array<{ id: string; content: string }>
  ): Promise<EventCausalLink[]> {
    try {
      // Get recent past events (last 90 days or last 50 events)
      const pastEvents = await this.getRecentPastEvents(userId, newEvent.start_time, 50);

      if (pastEvents.length === 0) {
        return [];
      }

      // Combine source text for context
      const sourceText = [
        ...sourceMessages.map(m => m.content),
        ...sourceJournalEntries.map(e => e.content),
      ].join('\n\n');

      // Use LLM to detect causal relationships
      const detectedLinks = await this.analyzeCausalRelationships(
        userId,
        newEvent,
        pastEvents,
        sourceText
      );

      // Save detected links
      const savedLinks: EventCausalLink[] = [];
      for (const link of detectedLinks) {
        try {
          await this.saveCausalLink(userId, link);
          savedLinks.push(link);
        } catch (error) {
          logger.debug({ error, link }, 'Failed to save causal link');
        }
      }

      return savedLinks;
    } catch (error) {
      logger.error({ error, userId, eventId: newEvent.id }, 'Failed to detect causal relationships');
      return [];
    }
  }

  /**
   * Get recent past events that might be causes
   */
  private async getRecentPastEvents(
    userId: string,
    beforeTime: string,
    limit: number = 50
  ): Promise<EventSummary[]> {
    try {
      const { data: events } = await supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, start_time, people, locations')
        .eq('user_id', userId)
        .lt('start_time', beforeTime)
        .order('start_time', { ascending: false })
        .limit(limit);

      if (!events) {
        return [];
      }

      return events.map(e => ({
        id: e.id,
        title: e.title,
        summary: e.summary,
        start_time: e.start_time,
        people: e.people || [],
        locations: e.locations || [],
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get past events');
      return [];
    }
  }

  /**
   * Analyze causal relationships using LLM
   */
  private async analyzeCausalRelationships(
    userId: string,
    newEvent: EventSummary,
    pastEvents: EventSummary[],
    sourceText: string
  ): Promise<EventCausalLink[]> {
    try {
      const pastEventsList = pastEvents
        .map(
          (e, idx) =>
            `${idx + 1}. "${e.title}" (${e.start_time})\n   ${e.summary || 'No summary'}`
        )
        .join('\n\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze if the new event was caused by, enabled by, or triggered by any past events.

**New Event:**
Title: "${newEvent.title}"
Summary: ${newEvent.summary || 'No summary'}
Time: ${newEvent.start_time}
People: ${newEvent.people.join(', ') || 'None'}
Locations: ${newEvent.locations.join(', ') || 'None'}

**Past Events:**
${pastEventsList}

**Source Context:**
${sourceText.substring(0, 2000)}

**Causal Relationship Types:**
- "causes": Past event directly causes new event (e.g., "got sick" → "went to hospital")
- "enables": Past event makes new event possible (e.g., "got job" → "moved to new city")
- "prevents": Past event prevents new event (e.g., "broke leg" → "couldn't attend party")
- "triggers": Past event triggers new event (e.g., "lost job" → "started job search")
- "follows_from": New event follows logically from past event (e.g., "graduated" → "started career")
- "reaction_to": New event is a reaction to past event (e.g., "got bad news" → "felt sad")
- "mitigates": Past event reduces impact of new event (e.g., "saved money" → "could handle emergency")
- "amplifies": Past event increases impact of new event (e.g., "was stressed" → "argument felt worse")
- "parallel_to": Events happen simultaneously/related (e.g., "worked on project" → "missed family dinner")
- "replaces": New event replaces past event (e.g., "old job ended" → "new job started")

Return JSON:
{
  "causal_links": [
    {
      "past_event_index": 1, // Index from past events list (1-based)
      "causal_type": "causes" | "enables" | "triggers" | etc.,
      "confidence": 0.0-1.0,
      "causal_strength": 0.0-1.0, // How strong the causal link is
      "time_lag_days": 5, // Days between events (if known)
      "evidence": "Brief explanation of why this is a causal link"
    }
  ]
}

Only include links with confidence >= 0.6. Be conservative. Focus on clear causal relationships.`,
          },
          {
            role: 'user',
            content: `Does the new event "${newEvent.title}" have any causal relationships with the past events?`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return [];
      }

      const parsed = JSON.parse(response);
      const links: EventCausalLink[] = [];

      for (const link of parsed.causal_links || []) {
        if (link.confidence >= 0.6 && link.past_event_index >= 1 && link.past_event_index <= pastEvents.length) {
          const pastEvent = pastEvents[link.past_event_index - 1];
          
          // Calculate time lag if both events have timestamps
          let timeLagDays: number | undefined;
          try {
            const newEventTime = new Date(newEvent.start_time);
            const pastEventTime = new Date(pastEvent.start_time);
            timeLagDays = Math.floor((newEventTime.getTime() - pastEventTime.getTime()) / (1000 * 60 * 60 * 24));
          } catch (e) {
            // Ignore time calculation errors
          }

          links.push({
            causeEventId: pastEvent.id,
            effectEventId: newEvent.id,
            causalType: link.causal_type as CausalType,
            confidence: link.confidence || 0.7,
            causalStrength: link.causal_strength,
            timeLagDays: timeLagDays || link.time_lag_days,
            evidence: link.evidence || '',
            evidenceSourceIds: [], // Will be populated from source messages/entries
          });
        }
      }

      return links;
    } catch (error) {
      logger.debug({ error }, 'LLM causal relationship detection failed');
      return [];
    }
  }

  /**
   * Save causal link to database
   */
  async saveCausalLink(userId: string, link: EventCausalLink): Promise<void> {
    try {
      // Check if link already exists
      const { data: existing } = await supabaseAdmin
        .from('event_causal_links')
        .select('*')
        .eq('user_id', userId)
        .eq('cause_event_id', link.causeEventId)
        .eq('effect_event_id', link.effectEventId)
        .eq('causal_type', link.causalType)
        .single();

      if (existing) {
        // Update existing link
        const existingSourceIds = existing.evidence_source_ids || [];
        const newSourceIds = [
          ...existingSourceIds,
          ...link.evidenceSourceIds.filter(id => !existingSourceIds.includes(id)),
        ];

        await supabaseAdmin
          .from('event_causal_links')
          .update({
            evidence_count: (existing.evidence_count || 1) + 1,
            confidence: Math.max(existing.confidence, link.confidence),
            causal_strength: link.causalStrength || existing.causal_strength,
            time_lag_days: link.timeLagDays || existing.time_lag_days,
            evidence_source_ids: newSourceIds,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(existing.metadata || {}),
              evidence: link.evidence,
              last_detected_at: new Date().toISOString(),
            },
          })
          .eq('id', existing.id);
      } else {
        // Insert new link
        await supabaseAdmin.from('event_causal_links').insert({
          user_id: userId,
          cause_event_id: link.causeEventId,
          effect_event_id: link.effectEventId,
          causal_type: link.causalType,
          confidence: link.confidence,
          causal_strength: link.causalStrength,
          time_lag_days: link.timeLagDays,
          evidence_count: 1,
          evidence_source_ids: link.evidenceSourceIds,
          metadata: {
            evidence: link.evidence,
            detected_at: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      // Ignore unique constraint violations (link already exists)
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
          return;
        }
      }
      logger.error({ error, link }, 'Failed to save causal link');
    }
  }

  /**
   * Get causal links for an event (both as cause and as effect)
   */
  async getEventCausalLinks(
    userId: string,
    eventId: string
  ): Promise<{
    causes: Array<EventCausalLink & { causeEvent: EventSummary }>;
    effects: Array<EventCausalLink & { effectEvent: EventSummary }>;
  }> {
    try {
      // Get events where this event is the effect (causes)
      const { data: causeLinks } = await supabaseAdmin
        .from('event_causal_links')
        .select('*')
        .eq('user_id', userId)
        .eq('effect_event_id', eventId);

      // Get events where this event is the cause (effects)
      const { data: effectLinks } = await supabaseAdmin
        .from('event_causal_links')
        .select('*')
        .eq('user_id', userId)
        .eq('cause_event_id', eventId);

      const causes: Array<EventCausalLink & { causeEvent: EventSummary }> = [];
      const effects: Array<EventCausalLink & { effectEvent: EventSummary }> = [];

      if (causeLinks) {
        // Fetch cause events
        const causeEventIds = [...new Set(causeLinks.map(link => link.cause_event_id))];
        const { data: causeEvents } = await supabaseAdmin
          .from('resolved_events')
          .select('id, title, summary, start_time, people, locations')
          .in('id', causeEventIds)
          .eq('user_id', userId);

        const causeEventsMap = new Map((causeEvents || []).map(e => [e.id, e]));

        for (const link of causeLinks) {
          const causeEvent = causeEventsMap.get(link.cause_event_id);
          if (causeEvent) {
            causes.push({
              causeEventId: link.cause_event_id,
              effectEventId: link.effect_event_id,
              causalType: link.causal_type as CausalType,
              confidence: link.confidence,
              causalStrength: link.causal_strength,
              timeLagDays: link.time_lag_days,
              evidence: link.metadata?.evidence || '',
              evidenceSourceIds: link.evidence_source_ids || [],
              causeEvent: {
                id: causeEvent.id,
                title: causeEvent.title,
                summary: causeEvent.summary,
                start_time: causeEvent.start_time,
                people: causeEvent.people || [],
                locations: causeEvent.locations || [],
              },
            });
          }
        }
      }

      if (effectLinks) {
        // Fetch effect events
        const effectEventIds = [...new Set(effectLinks.map(link => link.effect_event_id))];
        const { data: effectEvents } = await supabaseAdmin
          .from('resolved_events')
          .select('id, title, summary, start_time, people, locations')
          .in('id', effectEventIds)
          .eq('user_id', userId);

        const effectEventsMap = new Map((effectEvents || []).map(e => [e.id, e]));

        for (const link of effectLinks) {
          const effectEvent = effectEventsMap.get(link.effect_event_id);
          if (effectEvent) {
            effects.push({
              causeEventId: link.cause_event_id,
              effectEventId: link.effect_event_id,
              causalType: link.causal_type as CausalType,
              confidence: link.confidence,
              causalStrength: link.causal_strength,
              timeLagDays: link.time_lag_days,
              evidence: link.metadata?.evidence || '',
              evidenceSourceIds: link.evidence_source_ids || [],
              effectEvent: {
                id: effectEvent.id,
                title: effectEvent.title,
                summary: effectEvent.summary,
                start_time: effectEvent.start_time,
                people: effectEvent.people || [],
                locations: effectEvent.locations || [],
              },
            });
          }
        }
      }

      return { causes, effects };
    } catch (error) {
      logger.error({ error, userId, eventId }, 'Failed to get event causal links');
      return { causes: [], effects: [] };
    }
  }
}

export const eventCausalDetector = new EventCausalDetector();
