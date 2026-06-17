/**
 * Ontology enrichment — persist lexical intelligence onto entity metadata during ingestion.
 */
import { enrichEntity, classifyQueryType } from '../ontology/lexicalIntelligence';
import type { RootType } from '../ontology/glossary';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';

export function buildOntologyMetadata(name: string, context = ''): Record<string, unknown> {
  const enriched = enrichEntity(name, context);
  const query = classifyQueryType(`${name} ${context}`);
  const categories = [...new Set(
    enriched.ontologyTags.map((t) => t.split('/')[1]).filter(Boolean)
  )];
  const subcategories = [...new Set(
    enriched.ontologyTags.map((t) => t.split('/')[2]).filter(Boolean)
  )];
  return {
    ontology_tags: enriched.ontologyTags,
    domains: enriched.domainTags as RootType[],
    categories,
    subcategories,
    ontology_keywords: enriched.keywords,
    ontology_aliases: enriched.aliases,
    relationship_hints: enriched.relationshipHints,
    query_hints: query.queryHint ? [query.queryHint] : [],
    ontology_enriched_at: new Date().toISOString(),
  };
}

/** Map lexical analysis ontology candidates into message-level enrichment metadata. */
export function enrichFromLexicalAnalysis(analysis: LexicalAnalysisResult): Record<string, unknown> {
  const base = buildOntologyMetadata(analysis.rawText.slice(0, 200), analysis.rawText);
  return {
    ...base,
    lexical_ontology_candidates: analysis.ontologyCandidates,
    lexical_glossary_matches: analysis.glossaryMatches.slice(0, 50),
    lexical_entity_types: [...new Set(analysis.entities.map((e) => e.type))],
    lexical_confidence: analysis.confidence,
    ontology_enriched_at: new Date().toISOString(),
    source: 'lexical_analyzer',
  };
}

/** Map meaning resolution into ontology metadata — planner consumes resolved meaning only. */
export function enrichFromMeaningResolution(meaning: import('../meaning/meaningResolutionTypes').MeaningResolutionResult): Record<string, unknown> {
  return {
    resolved_entities: meaning.resolvedEntities,
    resolved_relationships: meaning.resolvedRelationships,
    resolved_skills: meaning.resolvedSkills,
    resolved_places: meaning.resolvedPlaces,
    resolved_events: meaning.resolvedEvents,
    resolved_references: meaning.references,
    identity_collisions: meaning.identityCollisions,
    contradictions: meaning.contradictions,
    temporal_context: meaning.temporalContext,
    factuality: meaning.factuality,
    ontology_action_candidates: meaning.ontologyActionCandidates,
    memory_review_candidates: meaning.memoryReviewCandidates,
    meaning_confidence: meaning.confidence,
    meaning_enriched_at: new Date().toISOString(),
    source: 'meaning_resolution',
  };
}

export function mergeOntologyIntoMetadata(
  existing: Record<string, unknown> | null | undefined,
  name: string,
  context = ''
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    ...buildOntologyMetadata(name, context),
  };
}
