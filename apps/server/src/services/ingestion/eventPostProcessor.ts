// =====================================================
// EVENT POST-PROCESSOR — Group B
// Purpose: Replace eventImpactDetector + eventCausalDetector (2 serial LLM calls
//          per assembled event) with a single merged call that returns both
//          impact and causal links simultaneously.
//
// This service is SHADOW-ONLY until Phase 1 A/B rollout is approved.
// =====================================================

import { openai } from '../openaiClient';
import { logger } from '../../logger';
import type {
  EventPostProcessingPayload,
  EventImpactResult,
  EventCausalLinkResult,
  EventImpactType,
  EmotionalImpact,
  CausalType,
} from './types/unifiedExtraction';

const EVENT_POST_PROCESSING_SCHEMA = {
  name: 'event_post_processing',
  strict: false,
  schema: {
    type: 'object',
    required: ['impact', 'causal_links'],
    properties: {
      impact: {
        type: 'object',
        required: ['impact_type', 'emotional_impact', 'impact_intensity', 'description', 'confidence'],
        properties: {
          impact_type: {
            type: 'string',
            enum: ['direct_participant', 'indirect_affected', 'related_person_affected', 'observer', 'ripple_effect'],
          },
          emotional_impact: { type: 'string', enum: ['positive', 'negative', 'neutral', 'mixed'] },
          impact_intensity: { type: 'number' },
          description: { type: 'string' },
          confidence: { type: 'number' },
          connection_character_name: { type: 'string' },
        },
      },
      causal_links: {
        type: 'array',
        items: {
          type: 'object',
          required: ['past_event_index', 'causal_type', 'confidence', 'causal_strength', 'evidence'],
          properties: {
            past_event_index: { type: 'number' },
            causal_type: {
              type: 'string',
              enum: ['causes','enables','prevents','triggers','follows_from','reaction_to','mitigates','amplifies','parallel_to','replaces'],
            },
            confidence: { type: 'number' },
            causal_strength: { type: 'number' },
            time_lag_days: { type: 'number' },
            evidence: { type: 'string' },
          },
        },
      },
    },
  },
};

export interface EventPostProcessorInput {
  userId: string;
  eventId: string;
  event: {
    title: string;
    summary?: string;
    start_time: string;
    people: string[];
    locations: string[];
  };
  userCharacterName?: string;
  sourceMessages: Array<{ id: string; content: string }>;
  pastEvents: Array<{
    id: string;
    title: string;
    summary?: string;
    start_time: string;
  }>;
}

export interface EventPostProcessorResult {
  payload: EventPostProcessingPayload | null;
  tokenCount: number;
  runtimeMs: number;
  error?: string;
}

function buildEventSystemPrompt(): string {
  return `You are LoreBook's event analysis engine. For a newly assembled event, determine:

1. IMPACT: How does this event affect the user, even if they weren't directly involved?
   - direct_participant: User was there
   - indirect_affected: User is affected but wasn't present (e.g., someone they care about was involved)
   - related_person_affected: Someone connected to the user was affected
   - observer: User witnessed or learned about it
   - ripple_effect: Downstream consequence affecting user

2. CAUSAL LINKS: Did any past event cause, enable, or trigger this new event?
   Only include links with confidence ≥ 0.6. Reference past events by their index (0-based).
   Only assert causal links when evidence strongly supports them.

Return empty causal_links array if no strong causal connections exist.`;
}

function buildEventUserPrompt(input: EventPostProcessorInput): string {
  const eventBlock = `NEW EVENT:
Title: "${input.event.title}"
${input.event.summary ? `Summary: ${input.event.summary}` : ''}
Time: ${input.event.start_time}
People involved: ${input.event.people.join(', ') || 'none mentioned'}
Locations: ${input.event.locations.join(', ') || 'none mentioned'}`;

  const messagesBlock = input.sourceMessages.length > 0
    ? `\nUSER'S MESSAGES ABOUT THIS EVENT:\n${input.sourceMessages.map(m => `- "${m.content.slice(0, 200)}"`).join('\n')}`
    : '';

  const pastEventsBlock = input.pastEvents.length > 0
    ? `\nPAST EVENTS (indexed 0 to ${input.pastEvents.length - 1}):\n${input.pastEvents.map((e, i) =>
        `[${i}] "${e.title}" (${e.start_time.split('T')[0]})${e.summary ? `: ${e.summary.slice(0, 150)}` : ''}`
      ).join('\n')}`
    : '\nPAST EVENTS: None available.';

  const userContext = input.userCharacterName
    ? `\nUser's character name: "${input.userCharacterName}" (use to determine direct participation)`
    : '';

  return `${eventBlock}${messagesBlock}${pastEventsBlock}${userContext}`;
}

function validateImpact(raw: unknown): EventImpactResult {
  const i = raw as any;
  const validImpactTypes: EventImpactType[] = [
    'direct_participant', 'indirect_affected', 'related_person_affected', 'observer', 'ripple_effect',
  ];
  const validEmotions: EmotionalImpact[] = ['positive', 'negative', 'neutral', 'mixed'];

  return {
    impact_type: validImpactTypes.includes(i?.impact_type) ? i.impact_type : 'observer',
    emotional_impact: validEmotions.includes(i?.emotional_impact) ? i.emotional_impact : 'neutral',
    impact_intensity: typeof i?.impact_intensity === 'number'
      ? Math.max(0, Math.min(1, i.impact_intensity)) : 0.5,
    description: typeof i?.description === 'string' ? i.description : '',
    confidence: typeof i?.confidence === 'number' ? Math.max(0, Math.min(1, i.confidence)) : 0.5,
    connection_character_name: typeof i?.connection_character_name === 'string'
      ? i.connection_character_name : undefined,
  };
}

function validateCausalLinks(raw: unknown, pastEventCount: number): EventCausalLinkResult[] {
  if (!Array.isArray(raw)) return [];
  const validCausalTypes: CausalType[] = [
    'causes','enables','prevents','triggers','follows_from',
    'reaction_to','mitigates','amplifies','parallel_to','replaces',
  ];

  return raw.flatMap(item => {
    try {
      const i = item as any;
      if (typeof i?.past_event_index !== 'number') return [];
      if (i.past_event_index < 0 || i.past_event_index >= pastEventCount) return [];
      if (typeof i?.confidence !== 'number' || i.confidence < 0.6) return [];
      if (!validCausalTypes.includes(i?.causal_type)) return [];
      return [{
        past_event_index: Math.round(i.past_event_index),
        causal_type: i.causal_type as CausalType,
        confidence: Math.max(0, Math.min(1, i.confidence)),
        causal_strength: typeof i.causal_strength === 'number'
          ? Math.max(0, Math.min(1, i.causal_strength)) : 0.5,
        time_lag_days: typeof i.time_lag_days === 'number' ? i.time_lag_days : undefined,
        evidence: typeof i.evidence === 'string' ? i.evidence : '',
      } as EventCausalLinkResult];
    } catch {
      return [];
    }
  });
}

class EventPostProcessor {
  async process(input: EventPostProcessorInput): Promise<EventPostProcessorResult> {
    const start = Date.now();

    // If the user is a direct participant (name in event.people), skip the LLM
    // for impact — it's always direct_participant with high confidence.
    const userInEvent = input.userCharacterName
      && input.event.people.some(p =>
          p.toLowerCase().includes(input.userCharacterName!.toLowerCase())
          || input.userCharacterName!.toLowerCase().includes(p.toLowerCase())
        );

    if (userInEvent && input.pastEvents.length === 0) {
      // Direct participant + no past events to check causality → zero LLM cost
      return {
        payload: {
          impact: {
            impact_type: 'direct_participant',
            emotional_impact: 'neutral',
            impact_intensity: 1.0,
            description: `${input.userCharacterName} was directly involved in "${input.event.title}".`,
            confidence: 0.9,
          },
          causal_links: [],
        },
        tokenCount: 0,
        runtimeMs: Date.now() - start,
      };
    }

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-5.4-mini',
        temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: EVENT_POST_PROCESSING_SCHEMA,
        } as any,
        messages: [
          { role: 'system', content: buildEventSystemPrompt() },
          { role: 'user', content: buildEventUserPrompt(input) },
        ],
        max_tokens: 1500,
      });

      const rawContent = completion.choices[0]?.message?.content;
      const tokenCount = completion.usage?.total_tokens ?? 0;

      if (!rawContent) {
        return { payload: null, tokenCount, runtimeMs: Date.now() - start, error: 'Empty response' };
      }

      let rawJson: Record<string, unknown>;
      try {
        rawJson = JSON.parse(rawContent);
      } catch {
        return { payload: null, tokenCount, runtimeMs: Date.now() - start, error: 'JSON parse failed' };
      }

      const impact = validateImpact(rawJson.impact);

      // Only keep impact if confidence meets threshold
      if (impact.confidence < 0.5) {
        logger.debug({ userId: input.userId, eventId: input.eventId }, 'EventPostProcessor: impact confidence too low, skipping');
        return { payload: null, tokenCount, runtimeMs: Date.now() - start };
      }

      const causal_links = validateCausalLinks(rawJson.causal_links, input.pastEvents.length);

      logger.debug({
        userId: input.userId,
        eventId: input.eventId,
        impactType: impact.impact_type,
        causalLinksFound: causal_links.length,
        tokenCount,
        runtimeMs: Date.now() - start,
      }, 'EventPostProcessor: processing complete');

      return {
        payload: { impact, causal_links },
        tokenCount,
        runtimeMs: Date.now() - start,
      };
    } catch (err) {
      const runtimeMs = Date.now() - start;
      logger.error({ err, userId: input.userId, eventId: input.eventId }, 'EventPostProcessor: failed');
      return {
        payload: null,
        tokenCount: 0,
        runtimeMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const eventPostProcessor = new EventPostProcessor();
