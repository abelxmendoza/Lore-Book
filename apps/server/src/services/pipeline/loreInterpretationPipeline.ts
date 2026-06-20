/**
 * LoreBook Interpretation Pipeline
 *
 *   1. Lexer      → lexicalAnalyzerService
 *   2. Parser     → meaningResolutionService
 *   3. Inference  → inferenceAssociationService
 *   4. Mapper     → ontologyEnrichmentService
 *   5. Planner    → buildActionsFromOntologyCandidates
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { lexicalAnalyzerService } from '../lexical/lexicalAnalyzerService';
import type { AnalyzeMessageInput, LexicalAnalysisResult } from '../lexical/lexicalTypes';
import { processLexicalMemoryCandidates } from '../lexical/lexicalMemoryBridge';
import { enrichFromLexicalAnalysisAsync, enrichFromMeaningResolutionAsync } from '../ontology/ontologyEnrichmentService';
import { meaningResolutionService } from '../meaning/meaningResolutionService';
import type { MeaningResolutionResult } from '../meaning/meaningResolutionTypes';
import { inferenceAssociationService } from '../inference/inferenceAssociationService';
import type { InferenceAssociationResult } from '../inference/inferenceAssociationTypes';
import {
  parseLexicalAnalysisResult,
  parseMeaningResolutionResult,
} from '../ontology/canonical';
import { relationshipPersistenceService } from '../ontology/relationshipPersistenceService';
import { buildMessageLexicalSignals } from '../ontology/messageLexicalMetadataService';
import { buildActionsFromOntologyCandidates } from '../ontology/actionPlanService';
import {
  applyPreviewCorrections,
  applyCorrectionsToLexical,
} from '../corrections/correctionApplicationService';
import type { CorrectedPreviewSpan } from '../corrections/correctionTypes';

export type LoreInterpretationResult = {
  lexical: LexicalAnalysisResult;
  meaning: MeaningResolutionResult;
  inference: InferenceAssociationResult;
};

export async function runLoreInterpretationPipeline(
  input: AnalyzeMessageInput,
  opts: { priorMentionedNames?: string[] } = {}
): Promise<LoreInterpretationResult> {
  let lexical = lexicalAnalyzerService.analyzeMessage(input);
  let correctionMeta: ReturnType<typeof applyPreviewCorrections> | undefined;

  if (input.previewCorrections?.length) {
    correctionMeta = await applyPreviewCorrections({
      userId: input.userId,
      messageId: input.messageId,
      threadId: input.threadId,
      text: input.text,
      corrections: input.previewCorrections,
    });
    lexical = applyCorrectionsToLexical(lexical, input.previewCorrections);
  }

  let lexicalResultId: string | undefined;

  try {
    lexicalResultId = await persistLexicalAnalysis(lexical);
  } catch (err) {
    logger.warn({ err, messageId: input.messageId }, 'Pipeline: lexical persist failed');
  }

  const meaning = await meaningResolutionService.resolveAndIntegrate({
    userId: input.userId,
    messageId: input.messageId,
    text: input.text,
    threadId: input.threadId,
    lexicalResult: lexical,
    timestamp: new Date().toISOString(),
    priorMentionedNames: opts.priorMentionedNames,
    lexicalResultId,
  });

  const inference = await inferenceAssociationService.inferAndQueueReview({
    userId: input.userId,
    messageId: input.messageId,
    threadId: input.threadId,
    rawText: input.text,
    lexicalResult: lexical,
    meaningResult: meaning,
    timestamp: new Date().toISOString(),
  });

  const ontologyMeta = {
    ...(await enrichFromLexicalAnalysisAsync(lexical, input.userId)),
    ...(await enrichFromMeaningResolutionAsync(meaning, lexical, input.userId)),
  };

  const ontologyActionPlan = buildActionsFromOntologyCandidates([
    ...meaning.ontologyActionCandidates,
    ...inference.actionCandidates,
  ]);

  await attachPipelineMetadata(
    input.messageId,
    input.userId,
    lexical,
    meaning,
    inference,
    ontologyMeta,
    ontologyActionPlan,
    correctionMeta
  );

  try {
    const persistResult = await relationshipPersistenceService.persistFromInterpretation(
      input.userId,
      input.messageId,
      lexical,
      meaning
    );
    if (persistResult.persisted > 0) {
      await attachRelationshipPersistStats(input.messageId, input.userId, persistResult);
    }
  } catch (err) {
    logger.warn({ err, messageId: input.messageId }, 'Pipeline: relationship persist failed');
  }

  // Keep existing lexical → MRQ path until planner fully owns memory candidates
  if (meaningResolutionService.allowsMemoryWrite(meaning)) {
    try {
      await processLexicalMemoryCandidates(input.userId, input.messageId, lexical);
    } catch (err) {
      logger.warn({ err, messageId: input.messageId }, 'Pipeline: lexical MRQ fallback failed');
    }
  }

  return {
    lexical: validateLexicalResult(lexical),
    meaning: validateMeaningResult(meaning),
    inference,
  };
}

export async function resolveMeaningForPlanner(
  input: AnalyzeMessageInput,
  opts: { priorMentionedNames?: string[] } = {}
): Promise<MeaningResolutionResult> {
  const lexical = lexicalAnalyzerService.analyzeMessage(input);
  return meaningResolutionService.resolve({
    userId: input.userId,
    messageId: input.messageId,
    text: input.text,
    threadId: input.threadId,
    lexicalResult: lexical,
    timestamp: new Date().toISOString(),
    priorMentionedNames: opts.priorMentionedNames,
  });
}

async function persistLexicalAnalysis(analysis: LexicalAnalysisResult): Promise<string | undefined> {
  const validated = validateLexicalResult(analysis);
  const { data, error } = await supabaseAdmin.from('lexical_analysis_results').insert({
    user_id: validated.userId,
    thread_id: validated.threadId ?? null,
    message_id: validated.messageId,
    raw_text: validated.rawText,
    normalized_text: validated.normalizedText,
    result_json: validated,
    confidence: validated.confidence,
  }).select('id').single();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === 'PGRST205' || code === '42P01') return undefined;
    throw error;
  }
  return data?.id;
}

async function attachPipelineMetadata(
  messageId: string,
  userId: string,
  lexical: LexicalAnalysisResult,
  meaning: MeaningResolutionResult,
  inference: InferenceAssociationResult,
  ontologyMeta: Record<string, unknown>,
  ontologyActionPlan: ReturnType<typeof buildActionsFromOntologyCandidates> = [],
  correctionMeta?: ReturnType<typeof applyPreviewCorrections>
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('chat_messages')
    .select('metadata')
    .eq('id', messageId)
    .eq('user_id', userId)
    .maybeSingle();

  const metadata = {
    ...(existing?.metadata as Record<string, unknown> ?? {}),
    interpretation_pipeline: {
      version: 3,
      phases: ['lexer', 'parser', 'inference', 'mapper', 'planner'],
      lexical_confidence: lexical.confidence,
      meaning_confidence: meaning.confidence,
      inference_confidence: inference.confidence,
      factuality: meaning.factuality,
      allows_memory_write: meaningResolutionService.allowsMemoryWrite(meaning),
    },
    lexical_analysis: {
      confidence: lexical.confidence,
      ambiguity_flags: lexical.ambiguityFlags,
      entity_count: lexical.entities.length,
      skill_count: lexical.skills.length,
    },
    meaning_resolution: {
      confidence: meaning.confidence,
      factuality: meaning.factuality,
      identity_collision_count: meaning.identityCollisions.length,
      contradiction_count: meaning.contradictions.length,
      ontology_action_count: meaning.ontologyActionCandidates.length,
      memory_review_count: meaning.memoryReviewCandidates.length,
      relationship_count: meaning.resolvedRelationships.length,
      relationship_group_count: (ontologyMeta.relationship_groups as unknown[] | undefined)?.length ?? 0,
    },
    inference_associations: {
      confidence: inference.confidence,
      people_count: inference.inferredPeople.length,
      groups_count: inference.inferredGroups.length,
      communities_count: inference.inferredCommunities.length,
      skills_count: inference.inferredSkills.length,
      hobbies_count: inference.inferredHobbies.length,
      relationships_count: inference.inferredRelationships.length,
      memory_review_count: inference.memoryReviewCandidates.length,
      action_count: inference.actionCandidates.length,
      all_inferred_not_confirmed: inferenceAssociationService.validateInferredNotConfirmed(inference),
    },
    ontology_enrichment: ontologyMeta,
    ontology_action_plan: {
      action_count: ontologyActionPlan.length,
      actions: ontologyActionPlan.map((a) => ({ id: a.id, label: a.label, kind: a.kind })),
    },
    ...(correctionMeta
      ? {
          preview_corrections: {
            audit_id: correctionMeta.auditId,
            corrected_span_count: correctionMeta.correctedSpans.length,
            glossary_candidate_count: correctionMeta.glossaryCandidates.length,
            alias_candidate_count: correctionMeta.ontologyAliasCandidates.length,
            requires_review: correctionMeta.requiresReview,
          },
        }
      : {}),
    lexical_signals: buildMessageLexicalSignals(lexical.rawText) ?? (existing?.metadata as Record<string, unknown> | undefined)?.lexical_signals,
  };

  await supabaseAdmin
    .from('chat_messages')
    .update({ metadata })
    .eq('id', messageId)
    .eq('user_id', userId);
}

async function attachRelationshipPersistStats(
  messageId: string,
  userId: string,
  stats: { persisted: number; skipped: number; characterEdges: number; entityEdges: number }
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('chat_messages')
    .select('metadata')
    .eq('id', messageId)
    .eq('user_id', userId)
    .maybeSingle();

  const metadata = {
    ...(existing?.metadata as Record<string, unknown> ?? {}),
    relationship_persistence: {
      ...stats,
      at: new Date().toISOString(),
    },
  };

  await supabaseAdmin
    .from('chat_messages')
    .update({ metadata })
    .eq('id', messageId)
    .eq('user_id', userId);
}

function validateLexicalResult(result: LexicalAnalysisResult): LexicalAnalysisResult {
  try {
    return parseLexicalAnalysisResult(result) as LexicalAnalysisResult;
  } catch (err) {
    logger.warn({ err, messageId: result.messageId }, 'Pipeline: lexical schema validation failed');
    return result;
  }
}

function validateMeaningResult(result: MeaningResolutionResult): MeaningResolutionResult {
  try {
    return parseMeaningResolutionResult(result) as MeaningResolutionResult;
  } catch (err) {
    logger.warn({ err, messageId: result.messageId }, 'Pipeline: meaning schema validation failed');
    return result;
  }
}
