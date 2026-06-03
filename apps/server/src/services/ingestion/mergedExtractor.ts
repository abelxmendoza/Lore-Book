// =====================================================
// MERGED EXTRACTOR — Group A
// Purpose: Replace 10 individual detector LLM calls with a single structured
//          extraction. Covers: semantic units, entities, entity relationships,
//          entity attributes, romantic signals, interests, health, skills,
//          groups, quest signals, emotional metadata, and recurrence hints.
//
// This service is SHADOW-ONLY until Phase 1 A/B rollout is approved.
// It runs in parallel with the existing pipeline and writes only to
// shadow_extraction_log. No production DB tables are touched here.
// =====================================================

import { openai } from '../openaiClient';
import { logger } from '../../logger';
import type {
  UnifiedExtractionPayload,
  UnifiedSemanticUnit,
  UnifiedEntity,
  UnifiedEntityRelationship,
  UnifiedRomanticSignal,
  UnifiedInterest,
  UnifiedHealthSignals,
  UnifiedSkill,
  UnifiedGroup,
  UnifiedQuestSignal,
  UnifiedLocation,
  UnifiedEmotionalMetadata,
  UnifiedRecurrenceHint,
  UnifiedExtractionMetadata,
} from './types/unifiedExtraction';
import { CANONICAL_RELATIONSHIP_TYPES } from './types/unifiedExtraction';

const SCHEMA_VERSION = '1.1' as const;

// Minimum confidence thresholds — mirrors existing detector thresholds exactly
const THRESHOLDS = {
  semantic_unit: 0.4,
  entity: 0.5,
  entity_relationship: 0.5,
  romantic_signal: 0.7,  // matches romanticRelationshipDetector
  interest: 0.5,          // matches interestDetector
  skill: 0.5,
  group: 0.5,
  quest_signal: 0.55,
  location: 0.5,
} as const;

// Fields expected in a complete extraction (used to detect partial results)
const EXPECTED_TOP_LEVEL_KEYS: Array<keyof UnifiedExtractionPayload> = [
  'semantic_units', 'entities', 'entity_relationships', 'romantic_signals',
  'interests', 'health', 'skills', 'groups', 'quest_signals', 'locations',
  'emotional_metadata', 'recurrence_hints', 'extraction_metadata',
];

// JSON Schema for the response_format — strict mode enforces all enum values
// and prevents the LLM from hallucinating field names.
const RESPONSE_JSON_SCHEMA = {
  name: 'unified_extraction',
  strict: false, // strict=true breaks on additionalProperties in nested objects
  schema: {
    type: 'object',
    properties: {
      semantic_units: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'content', 'confidence'],
          properties: {
            type: { type: 'string', enum: ['EXPERIENCE','FEELING','THOUGHT','PERCEPTION','CLAIM','DECISION','CORRECTION'] },
            content: { type: 'string' },
            confidence: { type: 'number' },
            temporal_scope: { type: 'string', enum: ['PAST','PRESENT','FUTURE','ONGOING'] },
            temporal_context: { type: 'object' },
            themes: { type: 'array', items: { type: 'string' } },
            emotions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      entities: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'type', 'mention_count', 'confidence', 'is_self', 'attributes'],
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['PERSON','PLACE','ORGANIZATION','CONCEPT','ANIMAL','OBJECT'] },
            mention_count: { type: 'number' },
            confidence: { type: 'number' },
            is_self: { type: 'boolean' },
            attributes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['attribute', 'value', 'confidence'],
                properties: {
                  attribute: { type: 'string' },
                  value: { type: 'string' },
                  confidence: { type: 'number' },
                },
              },
            },
            role_in_message: { type: 'string' },
          },
        },
      },
      entity_relationships: {
        type: 'array',
        items: {
          type: 'object',
          required: ['from_entity_name', 'to_entity_name', 'relationship_type', 'scope', 'strength', 'confidence', 'evidence'],
          properties: {
            from_entity_name: { type: 'string' },
            to_entity_name: { type: 'string' },
            // Constrained to the canonical ER vocabulary — never free text.
            relationship_type: { type: 'string', enum: CANONICAL_RELATIONSHIP_TYPES as string[] },
            scope: { type: 'string', enum: ['FAMILY','ROMANTIC','PROFESSIONAL','SOCIAL','ADVERSARIAL','CIRCUMSTANTIAL','SELF'] },
            strength: { type: 'number' },
            confidence: { type: 'number' },
            evidence: { type: 'string' },
          },
        },
      },
      romantic_signals: {
        type: 'array',
        items: {
          type: 'object',
          required: ['person_name', 'signal_type', 'status', 'exclusivity', 'is_situationship', 'confidence', 'evidence'],
          properties: {
            person_name: { type: 'string' },
            signal_type: { type: 'string' },
            status: { type: 'string', enum: ['active','on_break','ended','complicated'] },
            exclusivity: { type: 'string', enum: ['exclusive','non_exclusive','unknown','complicated'] },
            is_situationship: { type: 'boolean' },
            confidence: { type: 'number' },
            evidence: { type: 'string' },
            start_date: { type: 'string' },
            date_event: { type: 'object' },
          },
        },
      },
      interests: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'category', 'confidence', 'emotional_intensity', 'sentiment', 'evidence'],
          properties: {
            name: { type: 'string' },
            category: { type: 'string' },
            confidence: { type: 'number' },
            emotional_intensity: { type: 'number' },
            sentiment: { type: 'number' },
            evidence: { type: 'string' },
            action_taken: { type: 'boolean' },
            action_type: { type: 'string' },
            knowledge_depth: { type: 'string' },
            time_investment_minutes: { type: 'number' },
          },
        },
      },
      health: {
        type: 'object',
        properties: {
          workout: { type: 'object' },
          biometrics: { type: 'object' },
        },
      },
      skills: {
        type: 'array',
        items: {
          type: 'object',
          required: ['skill_name', 'entity_name', 'evidence', 'confidence'],
          properties: {
            skill_name: { type: 'string' },
            entity_name: { type: 'string' },
            proficiency: { type: 'string' },
            evidence: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
      groups: {
        type: 'array',
        items: {
          type: 'object',
          required: ['group_name', 'group_type', 'members', 'evidence', 'confidence'],
          properties: {
            group_name: { type: 'string' },
            group_type: { type: 'string' },
            members: { type: 'array', items: { type: 'string' } },
            user_role: { type: 'string' },
            evidence: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
      quest_signals: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'title', 'urgency', 'evidence', 'confidence'],
          properties: {
            type: { type: 'string', enum: ['GOAL','TASK','CHALLENGE','PROJECT','HABIT'] },
            title: { type: 'string' },
            description: { type: 'string' },
            deadline: { type: 'string' },
            urgency: { type: 'string', enum: ['low','medium','high'] },
            evidence: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
      locations: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'type', 'confidence', 'is_named', 'recurring_signal', 'entities_present', 'evidence'],
          properties: {
            name:             { type: 'string' },
            type:             { type: 'string', enum: ['HOME','WORK','SCHOOL','GYM','SOCIAL_VENUE','TRANSIT','HEALTHCARE','OUTDOORS','CITY','COUNTRY','OTHER'] },
            confidence:       { type: 'number' },
            is_named:         { type: 'boolean' },
            recurring_signal: { type: 'boolean' },
            entities_present: { type: 'array', items: { type: 'string' } },
            evidence:         { type: 'string' },
          },
        },
      },
      emotional_metadata: {
        type: 'object',
        required: ['emotion_vector', 'overall_valence', 'arousal', 'narrative_tone'],
        properties: {
          dominant_emotion: { type: 'string' },
          emotion_vector: {
            type: 'array',
            items: {
              type: 'object',
              required: ['emotion', 'intensity'],
              properties: {
                emotion: { type: 'string' },
                intensity: { type: 'number' },
              },
            },
          },
          overall_valence: { type: 'number' },
          arousal: { type: 'number' },
          narrative_tone: { type: 'string', enum: ['reflective','distressed','hopeful','neutral','excited','conflicted','resolved'] },
        },
      },
      recurrence_hints: {
        type: 'array',
        items: {
          type: 'object',
          required: ['pattern_description', 'entity_names', 'frequency_signal', 'evidence', 'confidence'],
          properties: {
            pattern_description: { type: 'string' },
            entity_names: { type: 'array', items: { type: 'string' } },
            frequency_signal: { type: 'string', enum: ['daily','weekly','monthly','recurring','occasional'] },
            evidence: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
      extraction_metadata: {
        type: 'object',
        required: ['overall_confidence', 'message_complexity', 'primary_domain', 'partial_extraction'],
        properties: {
          overall_confidence: { type: 'number' },
          message_complexity: { type: 'string', enum: ['simple','moderate','complex'] },
          primary_domain: { type: 'string', enum: ['personal','relationship','professional','health','social','mixed'] },
          partial_extraction: { type: 'boolean' },
          skipped_fields: { type: 'array', items: { type: 'string' } },
          // schema_version is injected by the service, not the LLM
        },
      },
    },
    required: EXPECTED_TOP_LEVEL_KEYS as string[],
  },
};

function buildSystemPrompt(today: string, knownEntityNames: string[]): string {
  const entityContext = knownEntityNames.length > 0
    ? `\nKnown entities for this user (use for coreference resolution): ${knownEntityNames.slice(0, 25).join(', ')}`
    : '';

  return `You are LoreBook's intelligence extraction engine. Extract structured knowledge from a single user message.

Extract ONLY what is explicitly stated or strongly implied. Never invent details not present in the text. Use empty arrays [] for sections with nothing to extract.

EXTRACTION RULES:
- semantic_units: Every distinct claim, experience, feeling, thought, or decision. Split compound messages into separate units. Include confidence 0–1.
- entities: Named entities only. "my friend" → skip. "Sarah" → include. Attach attributes (age, profession, location, trait) when stated.
- entity_relationships: Relationships between named entities or between the user ("self") and named entities. relationship_type MUST be one of the canonical types: ${CANONICAL_RELATIONSHIP_TYPES.join(', ')}. Do NOT invent free-text types.
- romantic_signals: Only include if confidence ≥ 0.7. Be conservative — explicit language or very strong implication only. person_name must appear in this message.
- interests: Topics the user shows genuine interest in. Confidence ≥ 0.5. Passing mentions are low confidence.
- health.workout: Only if workout is explicitly described. List exercises with sets/reps/weight if given.
- health.biometrics: Only if measurements are explicitly stated (weight, body fat, BMI, etc.).
- skills: Named entity performing a specific skill. Only if explicitly mentioned.
- groups: Named social groups (family, team, friend circle). Only if named or described.
- quest_signals: Explicit goals, plans, tasks, or challenges. Not vague aspirations.
- locations: Any physical place mentioned — home, work, gym, city, restaurant, hospital, etc. Set is_named=true for proper nouns ("Equinox"), false for generic ("the gym"). Set recurring_signal=true if the user implies this place is a regular part of their life. List entity names who were present.
- emotional_metadata: Single reading of the overall emotional register of the whole message.
- recurrence_hints: Only if the user explicitly mentions something happening repeatedly or on a schedule.
- extraction_metadata.partial_extraction: Set true if message is too ambiguous or short to fill multiple sections.

Today's date: ${today}${entityContext}`;
}

// Guard against hallucinated entity names: entity must appear (approximately)
// in the source message text.
function guardEntityHallucinations(
  entities: UnifiedEntity[],
  sourceMessage: string,
): UnifiedEntity[] {
  const lower = sourceMessage.toLowerCase();
  return entities.filter(entity => {
    const name = entity.name.toLowerCase();
    if (lower.includes(name)) return true;
    // Allow partial matches for names with spaces (first name only match)
    const parts = name.split(/\s+/);
    return parts.length > 1 && parts.some(part => part.length > 2 && lower.includes(part));
  });
}

// Validate and sanitize each top-level field independently.
// A malformed romantic_signals array never invalidates semantic_units.
function validateAndSanitize(
  raw: Record<string, unknown>,
  sourceMessage: string,
): UnifiedExtractionPayload {
  const safe = <T>(key: string, validator: (v: unknown) => T | null, fallback: T): T => {
    try {
      const result = validator(raw[key]);
      return result ?? fallback;
    } catch {
      return fallback;
    }
  };

  const asArray = <T>(val: unknown, itemValidator: (item: unknown) => T | null): T[] => {
    if (!Array.isArray(val)) return [];
    return val.flatMap(item => {
      try { const r = itemValidator(item); return r !== null ? [r] : []; } catch { return []; }
    });
  };

  const semantic_units = safe('semantic_units', v =>
    asArray<UnifiedSemanticUnit>(v, item => {
      const i = item as any;
      if (!i?.type || !i?.content || typeof i?.confidence !== 'number') return null;
      if (i.confidence < THRESHOLDS.semantic_unit) return null;
      return i as UnifiedSemanticUnit;
    }), []);

  const rawEntities = safe('entities', v =>
    asArray<UnifiedEntity>(v, item => {
      const i = item as any;
      if (!i?.name || !i?.type || typeof i?.confidence !== 'number') return null;
      if (i.confidence < THRESHOLDS.entity) return null;
      return { ...i, attributes: Array.isArray(i.attributes) ? i.attributes : [] } as UnifiedEntity;
    }), []);
  const entities = guardEntityHallucinations(rawEntities, sourceMessage);

  const entity_relationships = safe('entity_relationships', v =>
    asArray<UnifiedEntityRelationship>(v, item => {
      const i = item as any;
      if (!i?.from_entity_name || !i?.to_entity_name || !i?.relationship_type) return null;
      if (typeof i?.confidence === 'number' && i.confidence < THRESHOLDS.entity_relationship) return null;
      return i as UnifiedEntityRelationship;
    }), []);

  // Romantic signals: confidence gate + person_name must appear in source text
  // (same hallucination guard as entity names — romantic data is user-sensitive).
  const lowerSource = sourceMessage.toLowerCase();
  const romantic_signals = safe('romantic_signals', v =>
    asArray<UnifiedRomanticSignal>(v, item => {
      const i = item as any;
      if (!i?.person_name || !i?.signal_type) return null;
      if (typeof i?.confidence !== 'number' || i.confidence < THRESHOLDS.romantic_signal) return null;
      // Hallucination guard: person_name must appear (approximately) in the message
      const pName = (i.person_name as string).toLowerCase();
      const nameParts = pName.split(/\s+/);
      const namePresent = lowerSource.includes(pName)
        || (nameParts.length > 1 && nameParts.some(p => p.length > 2 && lowerSource.includes(p)));
      if (!namePresent) return null;
      return i as UnifiedRomanticSignal;
    }), []);

  const interests = safe('interests', v =>
    asArray<UnifiedInterest>(v, item => {
      const i = item as any;
      if (!i?.name || !i?.category) return null;
      if (typeof i?.confidence !== 'number' || i.confidence < THRESHOLDS.interest) return null;
      return i as UnifiedInterest;
    }), []);

  const health = safe<UnifiedHealthSignals>('health', v => {
    if (typeof v !== 'object' || v === null) return {};
    return v as UnifiedHealthSignals;
  }, {});

  const skills = safe('skills', v =>
    asArray<UnifiedSkill>(v, item => {
      const i = item as any;
      if (!i?.skill_name || !i?.entity_name) return null;
      if (typeof i?.confidence === 'number' && i.confidence < THRESHOLDS.skill) return null;
      return i as UnifiedSkill;
    }), []);

  const groups = safe('groups', v =>
    asArray<UnifiedGroup>(v, item => {
      const i = item as any;
      if (!i?.group_name || !i?.group_type) return null;
      if (typeof i?.confidence === 'number' && i.confidence < THRESHOLDS.group) return null;
      return { ...i, members: Array.isArray(i.members) ? i.members : [] } as UnifiedGroup;
    }), []);

  const quest_signals = safe('quest_signals', v =>
    asArray<UnifiedQuestSignal>(v, item => {
      const i = item as any;
      if (!i?.type || !i?.title || !i?.urgency) return null;
      if (typeof i?.confidence === 'number' && i.confidence < THRESHOLDS.quest_signal) return null;
      return i as UnifiedQuestSignal;
    }), []);

  const locations = safe('locations', v =>
    asArray<UnifiedLocation>(v, item => {
      const i = item as any;
      if (!i?.name || !i?.type) return null;
      if (typeof i?.confidence === 'number' && i.confidence < THRESHOLDS.location) return null;
      return {
        name: i.name,
        type: i.type,
        confidence: typeof i.confidence === 'number' ? i.confidence : 0.5,
        is_named: i.is_named === true,
        recurring_signal: i.recurring_signal === true,
        entities_present: Array.isArray(i.entities_present) ? i.entities_present : [],
        evidence: typeof i.evidence === 'string' ? i.evidence : '',
      } as UnifiedLocation;
    }), []);

  const emotional_metadata = safe<UnifiedEmotionalMetadata>('emotional_metadata', v => {
    const i = v as any;
    if (!i?.narrative_tone) return null;
    return {
      dominant_emotion: i.dominant_emotion,
      emotion_vector: Array.isArray(i.emotion_vector) ? i.emotion_vector : [],
      overall_valence: typeof i.overall_valence === 'number' ? i.overall_valence : 0,
      arousal: typeof i.arousal === 'number' ? i.arousal : 0.5,
      narrative_tone: i.narrative_tone,
    };
  }, { emotion_vector: [], overall_valence: 0, arousal: 0.5, narrative_tone: 'neutral' });

  const recurrence_hints = safe('recurrence_hints', v =>
    asArray<UnifiedRecurrenceHint>(v, item => {
      const i = item as any;
      if (!i?.pattern_description || !i?.frequency_signal) return null;
      return i as UnifiedRecurrenceHint;
    }), []);

  const populatedKeys = [
    semantic_units.length > 0,
    entities.length > 0,
    entity_relationships.length > 0,
    romantic_signals.length > 0,
    interests.length > 0,
    skills.length > 0,
    groups.length > 0,
    quest_signals.length > 0,
    locations.length > 0,
  ].filter(Boolean).length;

  const extraction_metadata = safe<UnifiedExtractionMetadata>('extraction_metadata', v => {
    const i = v as any;
    if (!i) return null;
    return {
      schema_version: SCHEMA_VERSION,
      overall_confidence: typeof i.overall_confidence === 'number' ? i.overall_confidence : 0.5,
      message_complexity: i.message_complexity ?? 'moderate',
      primary_domain: i.primary_domain ?? 'personal',
      partial_extraction: i.partial_extraction === true || populatedKeys < 2,
      skipped_fields: Array.isArray(i.skipped_fields) ? i.skipped_fields : [],
    };
  }, {
    schema_version: SCHEMA_VERSION,
    overall_confidence: 0.5,
    message_complexity: 'moderate',
    primary_domain: 'personal',
    partial_extraction: populatedKeys < 2,
  });

  // Vocabulary enforcement: drop relationships whose type isn't in the canonical enum.
  // The JSON schema constraint prevents most violations; this is the safety net.
  const validatedRelationships = entity_relationships.filter(r =>
    (CANONICAL_RELATIONSHIP_TYPES as string[]).includes(r.relationship_type)
  );

  return {
    semantic_units,
    entities,
    entity_relationships: validatedRelationships,
    romantic_signals,
    interests,
    health,
    skills,
    groups,
    quest_signals,
    locations,
    emotional_metadata,
    recurrence_hints,
    extraction_metadata,
  };
}

export interface MergedExtractorInput {
  userId: string;
  rawText: string;
  sender: 'USER' | 'AI';
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  knownEntityNames?: string[];
  today?: string;
}

export interface MergedExtractorResult {
  payload: UnifiedExtractionPayload | null;
  tokenCount: number;
  runtimeMs: number;
  error?: string;
}

class MergedExtractor {
  async extract(input: MergedExtractorInput): Promise<MergedExtractorResult> {
    const start = Date.now();

    // AI messages get minimal extraction — they rarely contain first-person facts
    if (input.sender === 'AI') {
      return { payload: null, tokenCount: 0, runtimeMs: 0 };
    }

    // Skip very short messages — no useful extraction possible
    if (input.rawText.trim().length < 8) {
      return { payload: null, tokenCount: 0, runtimeMs: 0 };
    }

    try {
      const today = input.today ?? new Date().toISOString().split('T')[0];
      const systemPrompt = buildSystemPrompt(today, input.knownEntityNames ?? []);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_JSON_SCHEMA,
        } as any,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input.rawText },
        ],
        max_tokens: 4096,
      });

      const rawContent = completion.choices[0]?.message?.content;
      const tokenCount = completion.usage?.total_tokens ?? 0;

      if (!rawContent) {
        return {
          payload: null,
          tokenCount,
          runtimeMs: Date.now() - start,
          error: 'Empty response from LLM',
        };
      }

      let rawJson: Record<string, unknown>;
      try {
        rawJson = JSON.parse(rawContent);
      } catch (parseErr) {
        logger.warn({ userId: input.userId, rawContent: rawContent.slice(0, 200) }, 'MergedExtractor: JSON parse failed');
        return {
          payload: null,
          tokenCount,
          runtimeMs: Date.now() - start,
          error: 'JSON parse failed',
        };
      }

      const payload = validateAndSanitize(rawJson, input.rawText);

      logger.debug({
        userId: input.userId,
        tokenCount,
        schemaVersion: payload.extraction_metadata.schema_version,
        semanticUnits: payload.semantic_units.length,
        entities: payload.entities.length,
        relationships: payload.entity_relationships.length,
        romanticSignals: payload.romantic_signals.length,
        interests: payload.interests.length,
        locations: payload.locations.length,
        partialExtraction: payload.extraction_metadata.partial_extraction,
        runtimeMs: Date.now() - start,
      }, 'MergedExtractor: extraction complete');

      return {
        payload,
        tokenCount,
        runtimeMs: Date.now() - start,
      };
    } catch (err) {
      const runtimeMs = Date.now() - start;
      logger.error({ err, userId: input.userId }, 'MergedExtractor: extraction failed');
      return {
        payload: null,
        tokenCount: 0,
        runtimeMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const mergedExtractor = new MergedExtractor();
