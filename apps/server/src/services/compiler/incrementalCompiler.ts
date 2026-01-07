// =====================================================
// LORE-KEEPER NARRATIVE COMPILER (LNC)
// Incremental Compiler - Recompiles only affected entries
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { dependencyGraph } from './dependencyGraph';
import { irCompiler } from './irCompiler';
import { entryEnrichmentService } from '../entryEnrichmentService';
import { omegaMemoryService } from '../omegaMemoryService';
import type { EntryIR } from './types';

export class IncrementalCompiler {
  /**
   * Incrementally compile changed entries
   */
  async incrementalCompile(userId: string, changedEntryIds: string[]): Promise<void> {
    try {
      // Get affected entries (transitive closure)
      const affected = await dependencyGraph.getAffectedEntries(changedEntryIds);

      logger.info({ userId, changedCount: changedEntryIds.length, affectedCount: affected.size }, 'Starting incremental compilation');

      // Recompile each affected entry
      for (const entryId of affected) {
        await this.recompileEntry(userId, entryId);
      }

      logger.info({ userId, compiledCount: affected.size }, 'Completed incremental compilation');
    } catch (error) {
      logger.error({ error, userId, changedEntryIds }, 'Failed incremental compilation');
      throw error;
    }
  }

  /**
   * Recompile a single entry
   */
  private async recompileEntry(userId: string, entryId: string): Promise<void> {
    try {
      // Load existing IR
      const { data: existingIR, error: loadError } = await supabaseAdmin
        .from('entry_ir')
        .select('*')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (loadError || !existingIR) {
        logger.warn({ entryId, error: loadError }, 'Entry IR not found for recompilation');
        return;
      }

      // Re-run only cheap passes (no LLM calls)
      const content = existingIR.content;

      // Re-extract entities (cheap - uses existing service)
      const entities = await this.reExtractEntities(userId, content);

      // Re-extract emotions and themes (cheap - uses enrichment service)
      const enrichment = await entryEnrichmentService.enrichEntry(
        content,
        entities.map(e => ({ id: e.entity_id, type: 'person' }))
      );

      const emotions = enrichment.emotions.map(emotion => ({
        emotion,
        intensity: enrichment.intensity === 'HIGH' ? 0.8 : enrichment.intensity === 'MEDIUM' ? 0.5 : 0.3,
        confidence: 0.7,
      }));

      const themes = enrichment.themes.map(theme => ({
        theme,
        confidence: 0.7,
      }));

      // Recompute confidence
      const confidence = this.recomputeConfidence(existingIR as EntryIR, entities, emotions, themes);

      // Update IR
      const { error: updateError } = await supabaseAdmin
        .from('entry_ir')
        .update({
          entities,
          emotions,
          themes,
          confidence,
          compiler_flags: {
            ...existingIR.compiler_flags,
            is_dirty: false,
            last_compiled_at: new Date().toISOString(),
            compilation_version: (existingIR.compiler_flags?.compilation_version || 0) + 1,
          },
        })
        .eq('id', entryId)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      logger.debug({ entryId, confidence }, 'Recompiled entry');
    } catch (error) {
      logger.error({ error, entryId }, 'Failed to recompile entry');
      throw error;
    }
  }

  /**
   * Re-extract entities (cheap pass)
   */
  private async reExtractEntities(userId: string, text: string) {
    try {
      const candidateEntities = await omegaMemoryService.extractEntities(text);
      const resolved = await omegaMemoryService.resolveEntities(userId, candidateEntities);

      return resolved.map(entity => ({
        entity_id: entity.id,
        mention_text: entity.primary_name,
        confidence: entity.confidence || 0.7,
      }));
    } catch (error) {
      logger.debug({ error }, 'Failed to re-extract entities');
      return [];
    }
  }

  /**
   * Recompute confidence
   */
  private recomputeConfidence(
    ir: EntryIR,
    entities: Array<{ entity_id: string; mention_text: string; confidence: number }>,
    emotions: Array<{ emotion: string; intensity: number; confidence: number }>,
    themes: Array<{ theme: string; confidence: number }>
  ): number {
    // Base confidence from knowledge type
    const baseConfidence = ir.confidence;

    // Adjust based on entity confidence
    const avgEntityConfidence = entities.length > 0
      ? entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length
      : 0.5;

    // Adjust based on emotion/themes presence
    const hasEmotions = emotions.length > 0;
    const hasThemes = themes.length > 0;
    const enrichmentBoost = (hasEmotions ? 0.05 : 0) + (hasThemes ? 0.05 : 0);

    // Combine
    const newConfidence = (baseConfidence * 0.6) + (avgEntityConfidence * 0.3) + (enrichmentBoost * 0.1);

    return Math.min(1.0, Math.max(0.1, newConfidence));
  }
}

export const incrementalCompiler = new IncrementalCompiler();

