/**
 * LoreBook Interpretation Pipeline
 *
 *   1. Lexer   → lexicalAnalyzerService
 *   2. Parser  → meaningResolutionService
 *   3. Mapper  → ontologyEnrichmentService
 *   4. Planner → buildActionsFromMeaning (resolved meaning only)
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { lexicalAnalyzerService } from '../lexical/lexicalAnalyzerService';
import type { AnalyzeMessageInput, LexicalAnalysisResult } from '../lexical/lexicalTypes';
import { processLexicalMemoryCandidates } from '../lexical/lexicalMemoryBridge';
import { enrichFromLexicalAnalysisAsync, enrichFromMeaningResolutionAsync } from '../ontology/ontologyEnrichmentService';
import { meaningResolutionService } from '../meaning/meaningResolutionService';
import type { MeaningResolutionResult } from '../meaning/meaningResolutionTypes';
import {
  parseLexicalAnalysisResult,
  parseMeaningResolutionResult,
} from '../ontology/canonical';
import { relationshipPersistenceService } from '../ontology/relationshipPersistenceService';
import { buildMessageLexicalSignals } from '../ontology/messageLexicalMetadataService';

export type LoreInterpretationResult = {
  lexical: LexicalAnalysisResult;
  meaning: MeaningResolutionResult;
};

export async function runLoreInterpretationPipeline(
  input: AnalyzeMessageInput,
  opts: { priorMentionedNames?: string[] } = {}
): Promise<LoreInterpretationResult> {
  const lexical = lexicalAnalyzerService.analyzeMessage(input);
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

  const ontologyMeta = {
    ...(await enrichFromLexicalAnalysisAsync(lexical, input.userId)),
    ...(await enrichFromMeaningResolutionAsync(meaning, lexical, input.userId)),
  };

  await attachPipelineMetadata(input.messageId, input.userId, lexical, meaning, ontologyMeta);

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
  ontologyMeta: Record<string, unknown>
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
      version: 2,
      phases: ['lexer', 'parser', 'mapper'],
      lexical_confidence: lexical.confidence,
      meaning_confidence: meaning.confidence,
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
    ontology_enrichment: ontologyMeta,
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
