/**
 * Meaning Resolution Service — orchestrates interpretation between Lexer and Planner.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { resolveEntities } from './entityResolutionService';
import { resolveReferences } from './referenceResolutionService';
import { resolveTemporalContext } from './temporalResolutionService';
import { resolveFactuality } from './factualityResolutionService';
import { detectIdentityCollisions } from './identityCollisionService';
import { resolveRelationships } from './relationshipResolutionService';
import { resolveSkills } from './skillContextResolutionService';
import { detectContradictions } from './contradictionDetectionService';
import {
  applyConfirmationRules,
  allowsMemoryWrite,
  scoreMeaningConfidence,
} from './meaningConfidenceScorer';
import {
  buildMemoryReviewCandidates,
  buildOntologyActionCandidates,
} from './meaningCandidateBuilder';
import { processMeaningMemoryCandidates } from './meaningMemoryBridge';
import type {
  MeaningAmbiguity,
  MeaningResolutionInput,
  MeaningResolutionResult,
  ResolvedEvent,
  ResolvedPlace,
} from './meaningResolutionTypes';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';

class MeaningResolutionService {
  async resolve(input: MeaningResolutionInput): Promise<MeaningResolutionResult> {
    const { userId, messageId, text, threadId, lexicalResult, timestamp, priorMentionedNames = [] } = input;

    const temporalContext = resolveTemporalContext(text, lexicalResult);
    const { factuality, certaintyLevel } = resolveFactuality(text, lexicalResult);

    const { entities: resolvedEntities, charByName } = await resolveEntities(
      userId, text, lexicalResult, temporalContext
    );
    const resolvedRelationships = resolveRelationships(text, lexicalResult, charByName);
    const resolvedSkills = resolveSkills(text, lexicalResult, temporalContext);
    const resolvedPlaces = this.resolvePlaces(lexicalResult);
    const resolvedEvents = this.resolveEvents(lexicalResult, temporalContext);

    applyConfirmationRules(resolvedEntities, resolvedRelationships, factuality);

    const references = resolveReferences(text, resolvedEntities, priorMentionedNames);

    const nameForCollision = resolvedEntities.find((e) => e.isSelf)?.surface
      ?? resolvedEntities.find((e) => e.kind === 'PERSON')?.surface;
    const charMatches = nameForCollision
      ? [...charByName.values()].filter((c) => c.name.toLowerCase() === nameForCollision.toLowerCase())
      : [];
    const identityCollisions = detectIdentityCollisions(text, lexicalResult, charMatches);
    const contradictions = await detectContradictions(userId, temporalContext);
    const ambiguities = this.buildAmbiguities(lexicalResult, identityCollisions, factuality);

    const confidence = scoreMeaningConfidence({
      entities: resolvedEntities,
      relationships: resolvedRelationships,
      certaintyLevel,
      identityCollisions,
      ambiguities,
      contradictions,
    });

    const ontologyActionCandidates = buildOntologyActionCandidates(
      resolvedEntities,
      resolvedRelationships,
      resolvedSkills,
      identityCollisions,
      contradictions,
      lexicalResult,
      text,
      factuality
    );

    const memoryReviewCandidates = buildMemoryReviewCandidates(
      resolvedSkills,
      resolvedRelationships,
      resolvedEntities,
      factuality,
      confidence,
      ambiguities
    );

    return {
      userId,
      messageId,
      threadId,
      rawText: text,
      resolvedEntities,
      resolvedRelationships,
      resolvedSkills,
      resolvedPlaces,
      resolvedEvents,
      references,
      identityCollisions,
      contradictions,
      ambiguities,
      temporalContext,
      factuality,
      confidence,
      ontologyActionCandidates,
      memoryReviewCandidates,
      createdAt: timestamp,
    };
  }

  /** Resolve + persist + attach metadata + queue memory review candidates. */
  async resolveAndIntegrate(input: MeaningResolutionInput): Promise<MeaningResolutionResult> {
    const result = await this.resolve(input);

    try {
      await this.persistResult(result, input.lexicalResultId);
    } catch (err) {
      logger.warn({ err, messageId: input.messageId }, 'Failed to persist meaning resolution');
    }

    try {
      await this.attachToMessageMetadata(input.messageId, input.userId, result);
    } catch (err) {
      logger.warn({ err, messageId: input.messageId }, 'Failed to attach meaning metadata');
    }

    if (allowsMemoryWrite(result)) {
      try {
        await processMeaningMemoryCandidates(input.userId, input.messageId, result);
      } catch (err) {
        logger.warn({ err, messageId: input.messageId }, 'Meaning memory candidate queue failed');
      }
    }

    return result;
  }

  allowsMemoryWrite(result: MeaningResolutionResult): boolean {
    return allowsMemoryWrite(result);
  }

  /** @deprecated Pass MeaningResolutionInput with lexicalResult */
  async resolveLegacy(
    lexical: LexicalAnalysisResult,
    partial: Omit<MeaningResolutionInput, 'lexicalResult' | 'timestamp'>
  ): Promise<MeaningResolutionResult> {
    return this.resolve({
      ...partial,
      lexicalResult: lexical,
      timestamp: new Date().toISOString(),
    });
  }

  private resolvePlaces(lexical: LexicalAnalysisResult): ResolvedPlace[] {
    return lexical.places.map((p) => ({
      name: p.name,
      category: p.category,
      cue: p.cue,
      confidence: p.confidence,
      resolutionReason: `lexical:${p.cue}`,
      requiresConfirmation: false,
    }));
  }

  private resolveEvents(lexical: LexicalAnalysisResult, temporal: MeaningResolutionResult['temporalContext']): ResolvedEvent[] {
    return lexical.events.map((e) => ({
      kind: e.kind,
      subject: e.subject,
      cue: e.cue,
      temporalStatus: temporal.defaultStatus,
      confidence: e.confidence,
      resolutionReason: `lexical:${e.cue}`,
      requiresConfirmation: e.confidence < 0.7,
    }));
  }

  private buildAmbiguities(
    lexical: LexicalAnalysisResult,
    collisions: MeaningResolutionResult['identityCollisions'],
    factuality: MeaningResolutionResult['factuality']
  ): MeaningAmbiguity[] {
    const ambiguities: MeaningAmbiguity[] = [];

    for (const flag of lexical.ambiguityFlags) {
      ambiguities.push({
        code: flag,
        description: flag.replace(/_/g, ' '),
        candidates: lexical.entities.map((e) => e.surface).slice(0, 5),
        confidence: 0.7,
      });
    }

    for (const c of collisions) {
      ambiguities.push({
        code: 'identity_collision',
        description: `"${c.name}" claimed as ${c.claims.join(' and ')}`,
        candidates: c.claims,
        confidence: c.confidence,
      });
    }

    if (factuality === 'hypothetical') {
      ambiguities.push({
        code: 'hypothetical_statement',
        description: 'Hypothetical — will not store as hard fact',
        candidates: [],
        confidence: 0.9,
      });
    }
    if (factuality === 'desire') {
      ambiguities.push({
        code: 'desire_statement',
        description: 'Desire — preference/goal candidate only',
        candidates: [],
        confidence: 0.85,
      });
    }

    return ambiguities;
  }

  private async persistResult(
    result: MeaningResolutionResult,
    lexicalResultId?: string
  ): Promise<void> {
    const { error } = await supabaseAdmin.from('meaning_resolution_results').insert({
      user_id: result.userId,
      thread_id: result.threadId ?? null,
      message_id: result.messageId,
      lexical_result_id: lexicalResultId ?? null,
      result_json: result,
      confidence: result.confidence,
      factuality: result.factuality,
    });

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'PGRST205' || code === '42P01') return;
      throw error;
    }
  }

  private async attachToMessageMetadata(
    messageId: string,
    userId: string,
    result: MeaningResolutionResult
  ): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('chat_messages')
      .select('metadata')
      .eq('id', messageId)
      .eq('user_id', userId)
      .maybeSingle();

    const metadata = {
      ...(existing?.metadata as Record<string, unknown> ?? {}),
      meaning_resolution: {
        confidence: result.confidence,
        factuality: result.factuality,
        identity_collision_count: result.identityCollisions.length,
        contradiction_count: result.contradictions.length,
        ontology_action_count: result.ontologyActionCandidates.length,
        memory_review_count: result.memoryReviewCandidates.length,
        allows_memory_write: allowsMemoryWrite(result),
      },
    };

    await supabaseAdmin
      .from('chat_messages')
      .update({ metadata })
      .eq('id', messageId)
      .eq('user_id', userId);
  }
}

export const meaningResolutionService = new MeaningResolutionService();
