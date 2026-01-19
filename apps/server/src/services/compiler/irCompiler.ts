// =====================================================
// LORE-KEEPER NARRATIVE COMPILER (LNC)
// IR Compiler - Converts utterances to EntryIR
// =====================================================

import { logger } from '../../logger';
import { canonDetectionService } from '../canonDetectionService';
import { entryEnrichmentService } from '../entryEnrichmentService';
import { omegaMemoryService } from '../omegaMemoryService';
import { supabaseAdmin } from '../supabaseClient';

import { epistemicInvariants } from './epistemicInvariants';
import { epistemicLatticeService } from './epistemicLattice';
import type { EntryIR, KnowledgeType, CertaintySource, EntityRef, EmotionSignal, ThemeSignal, CanonStatus } from './types';

export class IRCompiler {
  /**
   * Compile utterance to EntryIR
   */
  async compileUtteranceToIR(
    userId: string,
    utteranceId: string,
    utteranceText: string,
    threadId: string,
    timestamp: string,
    userCanonOverride?: CanonStatus
  ): Promise<EntryIR> {
    try {
      // Normalize text
      const normalized = this.normalizeText(utteranceText);

      // Classify knowledge type
      const knowledgeType = await this.classifyKnowledge(normalized);

      // Initial confidence
      const confidence = this.initialConfidence(knowledgeType, normalized);

      // Extract entities
      const entities = await this.extractEntities(userId, normalized);

      // Extract emotions and themes (using enrichment service)
      const enrichment = await entryEnrichmentService.enrichEntry(normalized, entities.map(e => ({ id: e.entity_id, type: 'person' })));
      
      const emotions: EmotionSignal[] = enrichment.emotions.map(emotion => ({
        emotion,
        intensity: enrichment.intensity === 'HIGH' ? 0.8 : enrichment.intensity === 'MEDIUM' ? 0.5 : 0.3,
        confidence: 0.7,
      }));

      const themes: ThemeSignal[] = enrichment.themes.map(theme => ({
        theme,
        confidence: 0.7,
      }));

      // Infer certainty source
      const certaintySource = this.inferCertaintySource(knowledgeType, normalized);

      // Determine canon status (Phase 3.6: Reality boundary)
      const canonMetadata = canonDetectionService.determineCanonStatus(
        utteranceText,
        userCanonOverride
      );

      // Create IR
      const ir: EntryIR = {
        id: randomUUID(),
        user_id: userId,
        source_utterance_id: utteranceId,
        thread_id: threadId,
        timestamp,
        knowledge_type: knowledgeType,
        canon: canonMetadata,
        content: normalized,
        entities,
        emotions,
        themes,
        confidence,
        certainty_source: certaintySource,
        narrative_links: {},
        compiler_flags: {
          is_dirty: true,
          is_deprecated: false,
          last_compiled_at: new Date().toISOString(),
          compilation_version: 1,
        },
      };

      // Phase 3.5: Enforce epistemic safety (automatic downgrading)
      const safeIR = epistemicLatticeService.enforceEpistemicSafety(ir);

      // Save IR
      await this.saveIR(safeIR);

      // Phase 3.5: Check invariants (non-blocking, logs violations)
      try {
        epistemicInvariants.checkAllInvariants([safeIR]);
      } catch (error) {
        logger.warn({ error, irId: safeIR.id }, 'Invariant check failed (non-blocking)');
      }

      // Phase 2: Resolve entities using symbol table
      try {
        const { symbolResolver } = await import('./symbolResolver');
        const { resolved, updatedIR, warnings } = await symbolResolver.resolveEntitiesForEntry(ir);
        
        if (warnings.length > 0) {
          logger.warn({ irId: ir.id, warnings }, 'Epistemic type checking warnings');
        }

        // Update IR if it was modified (e.g., downgraded)
        if (updatedIR.knowledge_type !== ir.knowledge_type || updatedIR.confidence !== ir.confidence) {
          await this.updateIR(updatedIR);
          ir = updatedIR;
        }
      } catch (error) {
        logger.warn({ error, irId: ir.id }, 'Failed to resolve symbols, continuing with basic IR');
      }

      // Phase 3: Track belief evolution if this is a BELIEF entry
      if (ir.knowledge_type === 'BELIEF') {
        try {
          const { bemreService } = await import('./bemre');
          await bemreService.trackBeliefEvolution(
            userId,
            ir.id,
            ir.content,
            ir.timestamp
          );
        } catch (error) {
          logger.debug({ error, irId: ir.id }, 'Failed to track belief evolution');
        }
      }

      logger.debug({ irId: ir.id, utteranceId, knowledgeType }, 'Compiled utterance to IR');

      return ir;
    } catch (error) {
      logger.error({ error, utteranceId }, 'Failed to compile utterance to IR');
      throw error;
    }
  }

  /**
   * Normalize text
   */
  private normalizeText(text: string): string {
    // Basic normalization - can be enhanced
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?;:'"()-]/g, '');
  }

  /**
   * Classify knowledge type
   */
  private async classifyKnowledge(text: string): Promise<KnowledgeType> {
    const lowerText = text.toLowerCase();

    // EXPERIENCE patterns (past tense, action verbs)
    if (/\b(i|we|they|he|she)\s+(went|did|met|saw|visited|attended|completed|finished|started|began|achieved|accomplished|had|got|received|gave|took|made|created|built|wrote|read|watched|listened|played|worked|studied|learned|taught|helped|solved|fixed|broke|lost|found|bought|sold|moved|traveled|arrived|left|returned|joined|left|quit|started|ended)\b/gi.test(text)) {
      return 'EXPERIENCE';
    }

    // FEELING patterns
    if (/\b(i|i'm|i am|i feel|feeling|felt|feels)\s+(happy|sad|angry|excited|nervous|anxious|worried|scared|afraid|confident|proud|ashamed|embarrassed|disappointed|frustrated|grateful|thankful|relieved|stressed|overwhelmed|calm|peaceful|content|satisfied|unsatisfied|lonely|connected|loved|hated|jealous|envious|guilty|shameful|hopeful|hopeless|optimistic|pessimistic)\b/gi.test(text)) {
      return 'FEELING';
    }

    // BELIEF patterns
    if (/\b(i believe|i think|i assume|i suspect|i guess|i imagine|supposedly|apparently|allegedly|reportedly|i heard|i was told|someone said|they said|people say|rumor|rumors|gossip)\b/gi.test(lowerText)) {
      return 'BELIEF';
    }

    // FACT patterns (declarative statements)
    if (/\b(is|are|was|were|has|have|had|will|would|can|could|should|must)\b/gi.test(text) && 
        !/\b(i think|i believe|i feel|maybe|perhaps|probably)\b/gi.test(lowerText)) {
      return 'FACT';
    }

    // DECISION patterns
    if (/\b(i decided|i'm going to|i will|i'm planning|i chose|i selected|i picked|i opted|decision|decide|choosing|choice)\b/gi.test(lowerText)) {
      return 'DECISION';
    }

    // QUESTION patterns
    if (/\?/g.test(text) || /\b(what|when|where|who|why|how|which|should|can|could|would|will)\b/gi.test(text)) {
      return 'QUESTION';
    }

    // Default to EXPERIENCE
    return 'EXPERIENCE';
  }

  /**
   * Initial confidence based on knowledge type
   */
  private initialConfidence(knowledgeType: KnowledgeType, text: string): number {
    const baseConfidence: Record<KnowledgeType, number> = {
      EXPERIENCE: 0.9,
      FEELING: 0.8,
      FACT: 0.7,
      DECISION: 0.9,
      QUESTION: 0.5,
      BELIEF: 0.6,
    };

    let confidence = baseConfidence[knowledgeType];

    // Adjust based on text quality
    if (text.length < 10) confidence *= 0.8;
    if (text.length > 500) confidence *= 0.9; // Very long might be rambling

    // Lower confidence for belief/hearsay
    if (/\b(heard|told|said|rumor|gossip|supposedly|apparently)\b/gi.test(text)) {
      confidence *= 0.7;
    }

    return Math.min(1.0, Math.max(0.1, confidence));
  }

  /**
   * Extract entities
   */
  private async extractEntities(userId: string, text: string): Promise<EntityRef[]> {
    try {
      const candidateEntities = await omegaMemoryService.extractEntities(text);
      const resolved = await omegaMemoryService.resolveEntities(userId, candidateEntities);

      return resolved.map(entity => ({
        entity_id: entity.id,
        mention_text: entity.primary_name,
        confidence: entity.confidence || 0.7,
      }));
    } catch (error) {
      logger.debug({ error }, 'Failed to extract entities, returning empty');
      return [];
    }
  }

  /**
   * Infer certainty source
   */
  private inferCertaintySource(knowledgeType: KnowledgeType, text: string): CertaintySource {
    const lowerText = text.toLowerCase();

    if (knowledgeType === 'EXPERIENCE' || knowledgeType === 'FEELING') {
      return 'DIRECT_EXPERIENCE';
    }

    if (knowledgeType === 'BELIEF') {
      if (/\b(heard|told|said|rumor|gossip)\b/gi.test(lowerText)) {
        return 'HEARSAY';
      }
      return 'INFERENCE';
    }

    if (knowledgeType === 'FACT') {
      if (/\b(verified|confirmed|checked|validated)\b/gi.test(lowerText)) {
        return 'VERIFICATION';
      }
      return 'INFERENCE';
    }

    if (knowledgeType === 'QUESTION') {
      return 'MEMORY_RECALL';
    }

    return 'INFERENCE';
  }

  /**
   * Save IR to database
   */
  private async saveIR(ir: EntryIR): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('entry_ir')
        .insert({
          id: ir.id,
          user_id: ir.user_id,
          source_utterance_id: ir.source_utterance_id,
          thread_id: ir.thread_id,
          timestamp: ir.timestamp,
          knowledge_type: ir.knowledge_type,
          canon: ir.canon, // Phase 3.6: Canon metadata
          content: ir.content,
          entities: ir.entities,
          emotions: ir.emotions,
          themes: ir.themes,
          confidence: ir.confidence,
          certainty_source: ir.certainty_source,
          narrative_links: ir.narrative_links,
          compiler_flags: ir.compiler_flags,
        });

      if (error) throw error;
    } catch (error) {
      logger.error({ error, irId: ir.id }, 'Failed to save IR');
      throw error;
    }
  }

  /**
   * Update existing IR
   */
  private async updateIR(ir: EntryIR): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('entry_ir')
        .update({
          knowledge_type: ir.knowledge_type,
          confidence: ir.confidence,
          certainty_source: ir.certainty_source,
          compiler_flags: {
            ...ir.compiler_flags,
            last_compiled_at: new Date().toISOString(),
            compilation_version: (ir.compiler_flags.compilation_version || 0) + 1,
          },
        })
        .eq('id', ir.id)
        .eq('user_id', ir.user_id);

      if (error) throw error;
    } catch (error) {
      logger.error({ error, irId: ir.id }, 'Failed to update IR');
      throw error;
    }
  }
}

export const irCompiler = new IRCompiler();

