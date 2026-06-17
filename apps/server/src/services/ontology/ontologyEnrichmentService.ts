/**
 * Ontology enrichment — persist lexical intelligence onto entity metadata during ingestion.
 * Dynamic subcategories resolve from the classifications table when available.
 */
import { enrichEntity, classifyQueryType } from '../ontology/lexicalIntelligence';
import type { RootType } from '../ontology/glossary';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import { entityClassToRootType } from '../ontology/canonical';
import type { EntityClass } from '../ontology/canonical';
import { isRootType } from '../ontology/canonical/rootType';
import { classificationService } from '../ontology/classificationService';
import { relationshipKnowledgeService } from '../ontology/relationshipKnowledgeService';

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

/** Async enrichment — resolves dynamic classifications from DB. */
export async function buildOntologyMetadataAsync(
  name: string,
  context = '',
  opts: { userId?: string; rootType?: RootType } = {}
): Promise<Record<string, unknown>> {
  const base = buildOntologyMetadata(name, context);
  const primaryRoot = opts.rootType ?? (base.domains as RootType[] | undefined)?.[0];
  if (!primaryRoot) return base;

  const subcategoryLabels = (base.subcategories as string[] | undefined) ?? [];
  const normalizedSubs = subcategoryLabels.map((s) => s.toLowerCase().replace(/_/g, ' '));

  const [entityClassification, subcategoryMatches] = await Promise.all([
    classificationService.resolveForEntityName(name, primaryRoot, opts.userId),
    classificationService.resolveSubcategoryLabels(primaryRoot, normalizedSubs, opts.userId),
  ]);

  const dynamicClassifications = [...subcategoryMatches];
  if (entityClassification && !dynamicClassifications.some((c) => c.label === entityClassification.label)) {
    dynamicClassifications.push(entityClassification);
  }

  if (dynamicClassifications.length === 0) return base;

  return {
    ...base,
    root_type: primaryRoot,
    dynamic_classifications: dynamicClassifications.map((c) => ({
      id: c.id,
      label: c.label,
      root_type: c.rootType,
      category: c.metadata.category,
      subcategory: c.metadata.subcategory,
    })),
    classification_ids: dynamicClassifications.map((c) => c.id).filter(Boolean),
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

export async function enrichFromLexicalAnalysisAsync(
  analysis: LexicalAnalysisResult,
  userId?: string
): Promise<Record<string, unknown>> {
  const base = enrichFromLexicalAnalysis(analysis);
  const relationshipMeta = relationshipKnowledgeService.buildEnrichmentMetadata(analysis);
  const primaryRoot = (base.domains as RootType[] | undefined)?.[0];

  let merged = { ...base, ...relationshipMeta };

  if (primaryRoot && userId) {
    const resolved = await buildOntologyMetadataAsync(
      analysis.rawText.slice(0, 200),
      analysis.rawText,
      { userId, rootType: primaryRoot }
    );
    const scopeClassifications = await relationshipKnowledgeService.resolveScopeClassifications(
      analysis.relationshipGroups ?? [],
      userId
    );
    merged = {
      ...merged,
      ...resolved,
      relationship_scope_classifications: scopeClassifications,
      source: 'lexical_analyzer',
    };
  }

  return merged;
}

/** Attach relationship + ontology knowledge from meaning resolution. */
export async function enrichFromMeaningResolutionAsync(
  meaning: import('../meaning/meaningResolutionTypes').MeaningResolutionResult,
  lexical: LexicalAnalysisResult,
  userId?: string
): Promise<Record<string, unknown>> {
  const base = enrichFromMeaningResolution(meaning);
  const relationshipMeta = relationshipKnowledgeService.buildEnrichmentMetadata(lexical, meaning);

  if (!userId) return { ...base, ...relationshipMeta };

  const scopeClassifications = await relationshipKnowledgeService.resolveScopeClassifications(
    relationshipMeta.relationship_groups as import('./canonical/relationshipKnowledge').RelationshipInputGroup[] ?? [],
    userId
  );

  return {
    ...base,
    ...relationshipMeta,
    relationship_scope_classifications: scopeClassifications,
    source: 'meaning_resolution',
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

export async function mergeOntologyIntoMetadataAsync(
  existing: Record<string, unknown> | null | undefined,
  name: string,
  context = '',
  opts: { userId?: string; rootType?: RootType | EntityClass } = {}
): Promise<Record<string, unknown>> {
  const rootType = opts.rootType
    ? (isRootType(opts.rootType) ? opts.rootType : entityClassToRootType(opts.rootType as EntityClass))
    : undefined;

  const enriched = await buildOntologyMetadataAsync(name, context, {
    userId: opts.userId,
    rootType,
  });

  return {
    ...(existing ?? {}),
    ...enriched,
  };
}

/** Attach dynamic classification to a classifier result. */
export async function enrichClassificationMetadata(
  name: string,
  rootType: RootType,
  userId?: string
): Promise<Record<string, unknown>> {
  const resolved = await classificationService.resolveForEntityName(name, rootType, userId);
  if (!resolved) return {};
  return {
    root_type: rootType,
    dynamic_label: resolved.label,
    classification_id: resolved.id,
    classification_metadata: resolved.metadata,
  };
}
