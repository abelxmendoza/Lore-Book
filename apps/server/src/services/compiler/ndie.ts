// =====================================================
// LOREKEEPER CORE BLUEPRINT
// Narrative Diff & Identity Evolution (NDIE)
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { contractLayer, type ConstrainedMemoryView } from './contractLayer';
import type { EntryIR, KnowledgeType } from './types';

export type EvolutionType =
  | 'BELIEF_STRENGTH_CHANGE'
  | 'BELIEF_ABANDONMENT'
  | 'EMOTIONAL_SHIFT'
  | 'INTERPRETATION_SHIFT'
  | 'VALUE_REPRIORITIZATION'
  | 'CONFIDENCE_CHANGE'
  | 'ENTITY_RELATIONSHIP_CHANGE';

export interface NarrativeDiff {
  id: string;
  user_id: string;
  entry_id_1: string;
  entry_id_2: string;
  evolution_type: EvolutionType;
  knowledge_type: KnowledgeType;
  shared_entities: string[];
  shared_themes: string[];
  diff_description: string;
  confidence: number;
  detected_at: string;
}

export class NDIEService {
  /**
   * Generate narrative diffs from a constrained memory view
   */
  async generateNarrativeDiffs(
    userId: string,
    contractName: string = 'REFLECTOR'
  ): Promise<NarrativeDiff[]> {
    try {
      // Get contract
      const contract = contractLayer.getContract(contractName);
      if (!contract) {
        throw new Error(`Contract ${contractName} not found`);
      }

      // Get all IR entries for user
      const { data: allEntries, error: fetchError } = await supabaseAdmin
        .from('entry_ir')
        .select('*')
        .eq('user_id', userId)
        .eq('compiler_flags->is_deprecated', false)
        .order('timestamp', { ascending: true });

      if (fetchError) throw fetchError;
      if (!allEntries || allEntries.length < 2) {
        return [];
      }

      // Apply contract (includes canon gating - Phase 3.6)
      const constrainedView = contractLayer.applyContract(contract, allEntries as EntryIR[]);

      // Generate diffs
      const diffs: NarrativeDiff[] = [];

      for (let i = 0; i < constrainedView.entries.length - 1; i++) {
        const entry1 = constrainedView.entries[i];
        const entry2 = constrainedView.entries[i + 1];

        // Only compare entries with same knowledge type or shared entities/themes
        const sharedEntities = this.getSharedEntities(entry1, entry2);
        const sharedThemes = this.getSharedThemes(entry1, entry2);

        if (
          entry1.knowledge_type === entry2.knowledge_type ||
          sharedEntities.length > 0 ||
          sharedThemes.length > 0
        ) {
          const detectedDiffs = this.detectDiffs(entry1, entry2, sharedEntities, sharedThemes);
          diffs.push(...detectedDiffs);
        }
      }

      // Save diffs to database
      if (diffs.length > 0) {
        await this.saveDiffs(userId, diffs);
      }

      logger.debug({ userId, contractName, diffCount: diffs.length }, 'Generated narrative diffs');
      return diffs;
    } catch (error) {
      logger.error({ error, userId, contractName }, 'Failed to generate narrative diffs');
      throw error;
    }
  }

  /**
   * Detect diffs between two entries
   */
  private detectDiffs(
    entry1: EntryIR,
    entry2: EntryIR,
    sharedEntities: string[],
    sharedThemes: string[]
  ): NarrativeDiff[] {
    const diffs: NarrativeDiff[] = [];
    const timestamp = new Date().toISOString();

    // Detect belief strength change
    if (
      entry1.knowledge_type === 'BELIEF' &&
      entry2.knowledge_type === 'BELIEF' &&
      sharedEntities.length > 0
    ) {
      const confidenceDiff = Math.abs(entry2.confidence - entry1.confidence);
      if (confidenceDiff > 0.2) {
        diffs.push({
          id: `${entry1.id}-${entry2.id}-belief-strength`,
          user_id: entry1.user_id,
          entry_id_1: entry1.id,
          entry_id_2: entry2.id,
          evolution_type: 'BELIEF_STRENGTH_CHANGE',
          knowledge_type: 'BELIEF',
          shared_entities: sharedEntities,
          shared_themes: sharedThemes,
          diff_description: `Belief confidence changed from ${entry1.confidence.toFixed(2)} to ${entry2.confidence.toFixed(2)}`,
          confidence: 0.8,
          detected_at: timestamp,
        });
      }
    }

    // Detect belief abandonment
    if (
      entry1.knowledge_type === 'BELIEF' &&
      entry2.knowledge_type !== 'BELIEF' &&
      sharedEntities.length > 0
    ) {
      diffs.push({
        id: `${entry1.id}-${entry2.id}-belief-abandonment`,
        user_id: entry1.user_id,
        entry_id_1: entry1.id,
        entry_id_2: entry2.id,
        evolution_type: 'BELIEF_ABANDONMENT',
        knowledge_type: entry1.knowledge_type,
        shared_entities: sharedEntities,
        shared_themes: sharedThemes,
        diff_description: 'Belief was abandoned or changed',
        confidence: 0.7,
        detected_at: timestamp,
      });
    }

    // Detect emotional shift
    const emotionDiff = this.detectEmotionalShift(entry1, entry2);
    if (emotionDiff && (sharedEntities.length > 0 || sharedThemes.length > 0)) {
      diffs.push({
        id: `${entry1.id}-${entry2.id}-emotional-shift`,
        user_id: entry1.user_id,
        entry_id_1: entry1.id,
        entry_id_2: entry2.id,
        evolution_type: 'EMOTIONAL_SHIFT',
        knowledge_type: entry1.knowledge_type,
        shared_entities: sharedEntities,
        shared_themes: sharedThemes,
        diff_description: emotionDiff,
        confidence: 0.7,
        detected_at: timestamp,
      });
    }

    // Detect confidence change
    const confidenceDiff = Math.abs(entry2.confidence - entry1.confidence);
    if (
      confidenceDiff > 0.3 &&
      entry1.knowledge_type === entry2.knowledge_type &&
      sharedEntities.length > 0
    ) {
      diffs.push({
        id: `${entry1.id}-${entry2.id}-confidence-change`,
        user_id: entry1.user_id,
        entry_id_1: entry1.id,
        entry_id_2: entry2.id,
        evolution_type: 'CONFIDENCE_CHANGE',
        knowledge_type: entry1.knowledge_type,
        shared_entities: sharedEntities,
        shared_themes: sharedThemes,
        diff_description: `Confidence changed from ${entry1.confidence.toFixed(2)} to ${entry2.confidence.toFixed(2)}`,
        confidence: 0.8,
        detected_at: timestamp,
      });
    }

    return diffs;
  }

  /**
   * Detect emotional shift between entries
   */
  private detectEmotionalShift(entry1: EntryIR, entry2: EntryIR): string | null {
    const emotions1 = entry1.emotions.map(e => e.emotion);
    const emotions2 = entry2.emotions.map(e => e.emotion);

    if (emotions1.length === 0 || emotions2.length === 0) {
      return null;
    }

    // Check for significant emotional change
    const hasOverlap = emotions1.some(e => emotions2.includes(e));
    if (!hasOverlap) {
      return `Emotional shift from [${emotions1.join(', ')}] to [${emotions2.join(', ')}]`;
    }

    return null;
  }

  /**
   * Get shared entities between two entries
   */
  private getSharedEntities(entry1: EntryIR, entry2: EntryIR): string[] {
    const ids1 = entry1.entities.map(e => e.id);
    const ids2 = entry2.entities.map(e => e.id);
    return ids1.filter(id => ids2.includes(id));
  }

  /**
   * Get shared themes between two entries
   */
  private getSharedThemes(entry1: EntryIR, entry2: EntryIR): string[] {
    const themes1 = entry1.themes.map(t => t.theme);
    const themes2 = entry2.themes.map(t => t.theme);
    return themes1.filter(theme => themes2.includes(theme));
  }

  /**
   * Save diffs to database
   */
  private async saveDiffs(userId: string, diffs: NarrativeDiff[]): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('narrative_diffs')
        .upsert(
          diffs.map(diff => ({
            id: diff.id,
            user_id: userId,
            entry_id_1: diff.entry_id_1,
            entry_id_2: diff.entry_id_2,
            evolution_type: diff.evolution_type,
            knowledge_type: diff.knowledge_type,
            shared_entities: diff.shared_entities,
            shared_themes: diff.shared_themes,
            diff_description: diff.diff_description,
            confidence: diff.confidence,
            detected_at: diff.detected_at,
          })),
          { onConflict: 'id' }
        );

      if (error) throw error;
    } catch (error) {
      logger.error({ error, userId, diffCount: diffs.length }, 'Failed to save narrative diffs');
      throw error;
    }
  }
}

export const ndieService = new NDIEService();

