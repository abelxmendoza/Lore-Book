/**
 * Zod schemas for pipeline boundary validation.
 */
import { z } from 'zod';

import { CANONICAL_ROOT_TYPES } from './rootType';

const rootTypeSchema = z.enum(CANONICAL_ROOT_TYPES as unknown as [string, ...string[]]);

export const lexicalEntitySchema = z.object({
  surface: z.string(),
  normalized: z.string(),
  type: z.string(),
  subcategory: z.string().optional(),
  startOffset: z.number().optional(),
  endOffset: z.number().optional(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
});

export const lexicalAnalysisResultSchema = z.object({
  messageId: z.string(),
  userId: z.string(),
  threadId: z.string().optional(),
  rawText: z.string(),
  normalizedText: z.string(),
  entities: z.array(lexicalEntitySchema),
  intents: z.array(z.object({
    kind: z.string(),
    cue: z.string(),
    label: z.string(),
    confidence: z.number(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })),
  emotions: z.array(z.object({
    label: z.string(),
    valence: z.enum(['positive', 'negative', 'mixed', 'neutral']),
    intensity: z.enum(['low', 'medium', 'high']),
    cue: z.string(),
    confidence: z.number(),
  })),
  relationships: z.array(z.object({
    role: z.string(),
    target: z.string().optional(),
    cue: z.string(),
    sentiment: z.enum(['positive', 'negative', 'neutral', 'estranged']).optional(),
    confidence: z.number(),
  })),
  skills: z.array(z.object({
    name: z.string(),
    category: z.string(),
    hobby_or_paid: z.enum(['hobby', 'paid', 'both', 'unknown']),
    proficiency_hint: z.string(),
    usage_frequency_hint: z.string(),
    enjoyment_hint: z.string(),
    lore_context: z.string(),
    confidence: z.number(),
  })),
  places: z.array(z.object({
    name: z.string(),
    category: z.string(),
    cue: z.string(),
    confidence: z.number(),
  })),
  events: z.array(z.object({
    kind: z.string(),
    subject: z.string().optional(),
    cue: z.string(),
    confidence: z.number(),
  })),
  ontologyCandidates: z.array(z.object({
    predicate: z.string(),
    object: z.string(),
    objectType: z.string().optional(),
    confidence: z.number(),
    source: z.string(),
  })),
  memoryCandidates: z.array(z.object({
    claim: z.string(),
    category: z.enum(['skill', 'relationship', 'preference', 'identity', 'event', 'place', 'general']),
    confidence: z.number(),
    requiresConfirmation: z.boolean(),
    source: z.string(),
  })),
  glossaryMatches: z.array(z.object({
    keyword: z.string(),
    alias: z.string(),
    domain: z.string(),
    category: z.string(),
    subcategory: z.string().optional(),
    relationshipHint: z.string().optional(),
    queryHint: z.string().optional(),
    actionHint: z.string().optional(),
    surfaceTarget: z.string().optional(),
    confidence: z.number(),
  })),
  confidence: z.number().min(0).max(1),
  ambiguityFlags: z.array(z.string()),
  needsClarification: z.boolean(),
  createdAt: z.string(),
});

export const meaningResolutionResultSchema = z.object({
  userId: z.string(),
  messageId: z.string(),
  threadId: z.string().optional(),
  rawText: z.string(),
  resolvedEntities: z.array(z.object({
    surface: z.string(),
    normalized: z.string(),
    kind: z.string(),
    confidence: z.number(),
    resolutionReason: z.string(),
    requiresConfirmation: z.boolean(),
    entityId: z.string().optional(),
    isSelf: z.boolean().optional(),
    isUnresolved: z.boolean().optional(),
    temporalStatus: z.string().optional(),
  })),
  resolvedRelationships: z.array(z.object({
    role: z.string(),
    cue: z.string(),
    confidence: z.number(),
    resolutionReason: z.string(),
    requiresConfirmation: z.boolean(),
    targetName: z.string().optional(),
    targetEntityId: z.string().optional(),
    sentiment: z.enum(['positive', 'negative', 'neutral', 'estranged']).optional(),
  })),
  resolvedSkills: z.array(z.object({
    name: z.string(),
    category: z.string(),
    hobbyOrPaid: z.string(),
    currentOrFormer: z.string(),
    proficiencyHint: z.string(),
    usageFrequencyHint: z.string(),
    enjoymentHint: z.string(),
    loreContext: z.string(),
    confidence: z.number(),
    resolutionReason: z.string(),
    requiresConfirmation: z.boolean(),
  })),
  resolvedPlaces: z.array(z.object({
    name: z.string(),
    category: z.string(),
    cue: z.string(),
    confidence: z.number(),
    resolutionReason: z.string(),
    requiresConfirmation: z.boolean(),
  })),
  resolvedEvents: z.array(z.object({
    kind: z.string(),
    cue: z.string(),
    confidence: z.number(),
    resolutionReason: z.string(),
    requiresConfirmation: z.boolean(),
    subject: z.string().optional(),
    temporalStatus: z.string().optional(),
  })),
  references: z.array(z.object({
    reference: z.string(),
    antecedent: z.string(),
    antecedentKind: z.string(),
    confidence: z.number(),
    resolutionReason: z.string(),
    relation: z.string().optional(),
  })),
  identityCollisions: z.array(z.object({
    name: z.string(),
    claims: z.array(z.enum(['self', 'relationship'])),
    confidence: z.number(),
    mustNotAutoMerge: z.literal(true),
    requiresConfirmation: z.literal(true),
    relationshipRole: z.string().optional(),
    characterId: z.string().optional(),
  })),
  contradictions: z.array(z.object({
    field: z.string(),
    existingFact: z.string(),
    newClaim: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    needsReview: z.literal(true),
  })),
  ambiguities: z.array(z.object({
    code: z.string(),
    description: z.string(),
    candidates: z.array(z.string()),
    confidence: z.number(),
  })),
  temporalContext: z.object({
    defaultStatus: z.string(),
    statements: z.array(z.object({
      subject: z.string(),
      predicate: z.string(),
      object: z.string(),
      status: z.string(),
      cue: z.string(),
    })),
  }),
  factuality: z.enum(['fact', 'opinion', 'hypothetical', 'desire', 'uncertain', 'question']),
  confidence: z.number().min(0).max(1),
  ontologyActionCandidates: z.array(z.object({
    kind: z.string(),
    label: z.string(),
    confidence: z.number(),
    requiresConfirmation: z.literal(true),
    payload: z.record(z.string(), z.unknown()),
  })),
  memoryReviewCandidates: z.array(z.object({
    claim: z.string(),
    category: z.string(),
    confidence: z.number(),
    requiresConfirmation: z.boolean(),
    source: z.string(),
  })),
  createdAt: z.string(),
});

export const ontologyEnrichmentMetadataSchema = z.object({
  ontology_tags: z.array(z.string()).optional(),
  domains: z.array(rootTypeSchema).optional(),
  categories: z.array(z.string()).optional(),
  subcategories: z.array(z.string()).optional(),
  ontology_keywords: z.array(z.string()).optional(),
  ontology_aliases: z.array(z.string()).optional(),
  relationship_hints: z.array(z.string()).optional(),
  query_hints: z.array(z.string()).optional(),
  ontology_enriched_at: z.string().optional(),
  source: z.string().optional(),
}).passthrough();

export function parseLexicalAnalysisResult(data: unknown) {
  return lexicalAnalysisResultSchema.parse(data);
}

export function parseMeaningResolutionResult(data: unknown) {
  return meaningResolutionResultSchema.parse(data);
}

export function safeParseLexicalAnalysisResult(data: unknown) {
  return lexicalAnalysisResultSchema.safeParse(data);
}

export function safeParseMeaningResolutionResult(data: unknown) {
  return meaningResolutionResultSchema.safeParse(data);
}
