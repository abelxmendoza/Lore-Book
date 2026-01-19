// =====================================================
// NARRATIVE DIFF & IDENTITY EVOLUTION ENGINE (NDIE)
// Purpose: Track how beliefs, interpretations, emotions, and values
// evolve over time WITHOUT rewriting history or asserting truth.
// =====================================================

import { logger } from '../logger';

import { beliefRealityReconciliationService } from './beliefRealityReconciliationService';
import type { 
  EntryIR, 
  KnowledgeType, 
  EntityRef, 
  EmotionSignal, 
  ThemeSignal, 
  CertaintySource,
  NarrativeLinks,
  CompilerFlags
} from './compiler/types';
import { supabaseAdmin } from './supabaseClient';

export type DiffType = 
  | 'BELIEF_STRENGTHENED'
  | 'BELIEF_WEAKENED'
  | 'BELIEF_ABANDONED'
  | 'INTERPRETATION_SHIFT'
  | 'EMOTIONAL_CHANGE'
  | 'VALUE_REPRIORITIZATION';

export type SubjectType = 'SELF' | 'ENTITY' | 'THEME';

export interface NarrativeDiff {
  id: string;
  user_id: string;
  subject_type: SubjectType;
  subject_id: string;
  diff_type: DiffType;
  from_content: string;
  from_knowledge_type: KnowledgeType;
  from_confidence: number;
  from_timestamp: string;
  to_content: string;
  to_knowledge_type: KnowledgeType;
  to_confidence: number;
  to_timestamp: string;
  evidence_entry_ids: string[];
      contract_type: SensemakingContractType | null;
  metadata: Record<string, any>;
  created_at: string;
}

// Simple contract types for NDIE
export type SensemakingContractType = 
  | 'ARCHIVIST'  // Only retrieve, summarize, reference past entries; no advice/interpretation
  | 'ANALYST'    // Pattern-based, structured analysis
  | 'REFLECTOR'; // Processing feelings or experiences

export interface ConstrainedMemoryView {
  entries: EntryIR[];
  allowed_inference_labels: string[];
}

export class NarrativeDiffEngineService {
  /**
   * Generate narrative diffs from compiled entries
   * Contract-gated: only uses entries allowed by contract
   */
  async generateDiffs(
    userId: string,
    contract: SensemakingContractType,
    compiledEntries: EntryIR[]
  ): Promise<NarrativeDiff[]> {
    try {
      // STEP 1: Apply contract gate
      const memoryView = this.applyContractGate(contract, compiledEntries);

      // STEP 2: Group entries by subject (self, entity, theme)
      const subjectGroups = this.groupBySubject(memoryView.entries);

      // STEP 3: Detect diffs per subject
      const diffs: NarrativeDiff[] = [];

      for (const group of subjectGroups) {
        const ordered = this.sortChronologically(group.entries);
        const subjectDiffs = await this.detectSubjectDiffs(userId, ordered, contract);
        diffs.push(...subjectDiffs);
      }

      // STEP 4: Save diffs (read-only records)
      if (diffs.length > 0) {
        await this.saveDiffs(userId, diffs);
      }

      return diffs;
    } catch (error) {
      logger.error({ error, userId, contract }, 'Failed to generate narrative diffs');
      throw error;
    }
  }

  /**
   * Apply contract gate to filter entries
   * HARD RULES:
   * - No raw chat access
   * - No Strategist access
   * - Contract required
   */
  private applyContractGate(
    contract: SensemakingContractType,
    entries: EntryIR[]
  ): ConstrainedMemoryView {
    // Filter entries based on contract
    let allowedEntries = entries;

    switch (contract) {
      case 'ARCHIVIST':
        // ARCHIVIST: Only EXPERIENCE and FACT, only CANON
        allowedEntries = entries.filter(e => 
          (e.knowledge_type === 'EXPERIENCE' || e.knowledge_type === 'FACT') &&
          e.canon_status === 'CANON'
        );
        return {
          entries: allowedEntries,
          allowed_inference_labels: ['FACT', 'EXPERIENCE'],
        };

      case 'ANALYST':
        // ANALYST: EXPERIENCE, FACT, BELIEF, only CANON
        allowedEntries = entries.filter(e => 
          (e.knowledge_type !== 'FEELING' || e.knowledge_type === 'EXPERIENCE') &&
          e.canon_status === 'CANON'
        );
        return {
          entries: allowedEntries,
          allowed_inference_labels: ['EXPERIENCE', 'FACT', 'BELIEF'],
        };

      case 'REFLECTOR':
        // REFLECTOR: All types, CANON + HYPOTHETICAL + THOUGHT_EXPERIMENT
        allowedEntries = entries.filter(e => 
          ['CANON', 'HYPOTHETICAL', 'THOUGHT_EXPERIMENT'].includes(e.canon_status)
        );
        return {
          entries: allowedEntries,
          allowed_inference_labels: ['EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION'],
        };

      default:
        // Default: conservative (ARCHIVIST-like)
        allowedEntries = entries.filter(e => 
          (e.knowledge_type === 'EXPERIENCE' || e.knowledge_type === 'FACT') &&
          e.canon_status === 'CANON'
        );
        return {
          entries: allowedEntries,
          allowed_inference_labels: ['FACT', 'EXPERIENCE'],
        };
    }
  }

  /**
   * Group entries by subject (SELF, ENTITY, THEME)
   */
  private groupBySubject(entries: EntryIR[]): Array<{ subject: { type: SubjectType; id: string }; entries: EntryIR[] }> {
    const groups = new Map<string, { subject: { type: SubjectType; id: string }; entries: EntryIR[] }>();

    for (const entry of entries) {
      // Determine subject
      let subject: { type: SubjectType; id: string };

      if (entry.entities && entry.entities.length > 0) {
        // Entity subject
        const primaryEntity = entry.entities[0];
        subject = {
          type: 'ENTITY',
          id: primaryEntity.entity_id,
        };
      } else if (entry.themes && entry.themes.length > 0) {
        // Theme subject
        const primaryTheme = entry.themes[0].theme;
        subject = {
          type: 'THEME',
          id: primaryTheme,
        };
      } else {
        // Self subject (default)
        subject = {
          type: 'SELF',
          id: entry.user_id,
        };
      }

      const key = `${subject.type}:${subject.id}`;
      if (!groups.has(key)) {
        groups.set(key, { subject, entries: [] });
      }
      groups.get(key)!.entries.push(entry);
    }

    return Array.from(groups.values());
  }

  /**
   * Sort entries chronologically
   */
  private sortChronologically(entries: EntryIR[]): EntryIR[] {
    return entries.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
  }

  /**
   * Detect diffs for a subject's entries
   */
  private async detectSubjectDiffs(
    userId: string,
    entries: EntryIR[],
    contract: SensemakingContractType
  ): Promise<NarrativeDiff[]> {
    const diffs: NarrativeDiff[] = [];

    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];

      // Only epistemically compatible comparisons
      if (!this.isComparable(prev, curr)) {
        continue;
      }

      const diffType = await this.classifyDiff(userId, prev, curr);
      if (!diffType) {
        continue;
      }

      const subject = this.resolveSubject(curr);

      diffs.push({
        id: '', // Will be set on save
        user_id: userId,
        subject_type: subject.type,
        subject_id: subject.id,
        diff_type: diffType,
        from_content: prev.content,
        from_knowledge_type: prev.knowledge_type,
        from_confidence: prev.confidence,
        from_timestamp: prev.timestamp,
        to_content: curr.content,
        to_knowledge_type: curr.knowledge_type,
        to_confidence: curr.confidence,
        to_timestamp: curr.timestamp,
        evidence_entry_ids: [prev.id, curr.id],
        contract_type: contract,
        metadata: {},
        created_at: new Date().toISOString(),
      });
    }

    return diffs;
  }

  /**
   * Check if two entries are comparable
   * HARD RULE: Never compare FACT with FEELING, never promote BELIEF to FACT
   */
  private isComparable(a: EntryIR, b: EntryIR): boolean {
    // Must have same knowledge type
    if (a.knowledge_type !== b.knowledge_type) {
      return false;
    }

    // Must be about similar subjects (entity/theme overlap)
    const aEntities = new Set((a.entities || []).map(e => e.entity_id));
    const bEntities = new Set((b.entities || []).map(e => e.entity_id));
    const entityOverlap = Array.from(aEntities).some(id => bEntities.has(id));

    const aThemes = new Set((a.themes || []).map(t => t.theme));
    const bThemes = new Set((b.themes || []).map(t => t.theme));
    const themeOverlap = Array.from(aThemes).some(theme => bThemes.has(theme));

    return entityOverlap || themeOverlap || (aEntities.size === 0 && bEntities.size === 0 && aThemes.size === 0 && bThemes.size === 0);
  }

  /**
   * Classify diff type between two entries
   */
  private async classifyDiff(
    userId: string,
    a: EntryIR,
    b: EntryIR
  ): Promise<DiffType | null> {
    // Belief evolution
    if (a.knowledge_type === 'BELIEF' && b.knowledge_type === 'BELIEF') {
      // Check belief resolution status
      const resolutionA = await beliefRealityReconciliationService.getResolutionForBelief(
        userId,
        a.id
      ).catch(() => null);

      const resolutionB = await beliefRealityReconciliationService.getResolutionForBelief(
        userId,
        b.id
      ).catch(() => null);

      if (resolutionB?.status === 'ABANDONED') {
        return 'BELIEF_ABANDONED';
      }

      // Confidence-based changes
      if (b.confidence > a.confidence + 0.1) {
        return 'BELIEF_STRENGTHENED';
      }
      if (b.confidence < a.confidence - 0.1) {
        return 'BELIEF_WEAKENED';
      }

      // Resolution status changes
      if (resolutionA?.status === 'UNRESOLVED' && resolutionB?.status === 'SUPPORTED') {
        return 'BELIEF_STRENGTHENED';
      }
      if (resolutionA?.status === 'SUPPORTED' && resolutionB?.status === 'CONTRADICTED') {
        return 'BELIEF_WEAKENED';
      }
    }

    // Emotional change
    if (a.knowledge_type === 'FEELING' && b.knowledge_type === 'FEELING') {
      const aEmotions = new Set((a.emotions || []).map(e => e.emotion));
      const bEmotions = new Set((b.emotions || []).map(e => e.emotion));
      
      // Check if emotions changed significantly
      const intersection = Array.from(aEmotions).filter(e => bEmotions.has(e));
      const union = new Set([...aEmotions, ...bEmotions]);
      const similarity = intersection.length / union.size;

      if (similarity < 0.5) {
        return 'EMOTIONAL_CHANGE';
      }
    }

    // Interpretive shift (experience reframed)
    if (a.knowledge_type === 'EXPERIENCE' && b.knowledge_type === 'EXPERIENCE') {
      const aThemes = new Set((a.themes || []).map(t => t.theme));
      const bThemes = new Set((b.themes || []).map(t => t.theme));
      
      // Check if themes changed (different interpretation)
      const intersection = Array.from(aThemes).filter(t => bThemes.has(t));
      const union = new Set([...aThemes, ...bThemes]);
      const similarity = intersection.length / union.size;

      if (similarity < 0.6 && union.size > 0) {
        return 'INTERPRETATION_SHIFT';
      }
    }

    // Value reprioritization (decision patterns)
    if (a.knowledge_type === 'DECISION' && b.knowledge_type === 'DECISION') {
      // If decisions show different priorities/themes
      const aThemes = new Set((a.themes || []).map(t => t.theme));
      const bThemes = new Set((b.themes || []).map(t => t.theme));
      
      if (aThemes.size > 0 && bThemes.size > 0) {
        const intersection = Array.from(aThemes).filter(t => bThemes.has(t));
        if (intersection.length === 0) {
          return 'VALUE_REPRIORITIZATION';
        }
      }
    }

    return null;
  }

  /**
   * Resolve subject from entry
   */
  private resolveSubject(entry: EntryIR): { type: SubjectType; id: string } {
    if (entry.entities && entry.entities.length > 0) {
      return {
        type: 'ENTITY',
        id: entry.entities[0].entity_id,
      };
    }

    if (entry.themes && entry.themes.length > 0) {
      return {
        type: 'THEME',
        id: entry.themes[0].theme,
      };
    }

    return {
      type: 'SELF',
      id: entry.user_id,
    };
  }

  /**
   * Save diffs to database
   */
  private async saveDiffs(userId: string, diffs: NarrativeDiff[]): Promise<void> {
    try {
      const inserts = diffs.map(diff => ({
        user_id: userId,
        subject_type: diff.subject_type,
        subject_id: diff.subject_id,
        diff_type: diff.diff_type,
        from_content: diff.from_content,
        from_knowledge_type: diff.from_knowledge_type,
        from_confidence: diff.from_confidence,
        from_timestamp: diff.from_timestamp,
        to_content: diff.to_content,
        to_knowledge_type: diff.to_knowledge_type,
        to_confidence: diff.to_confidence,
        to_timestamp: diff.to_timestamp,
        evidence_entry_ids: diff.evidence_entry_ids,
        contract_type: diff.contract_type,
        metadata: diff.metadata,
      }));

      const { error } = await supabaseAdmin
        .from('narrative_diffs')
        .insert(inserts);

      if (error) {
        throw error;
      }

      logger.debug({ userId, diffCount: diffs.length }, 'Saved narrative diffs');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save narrative diffs');
      throw error;
    }
  }

  /**
   * Generate diffs from EntryIR records (main entry point)
   */
  async generateDiffsFromIR(
    userId: string,
    contract: SensemakingContractType = 'ARCHIVIST'
  ): Promise<NarrativeDiff[]> {
    try {
      // Get all EntryIR records for user
      const { data: irRecords, error } = await supabaseAdmin
        .from('entry_ir')
        .select('*')
        .eq('user_id', userId)
        .eq('compiler_flags->>is_deprecated', 'false')
        .order('timestamp', { ascending: true });

      if (error) {
        throw error;
      }

      if (!irRecords || irRecords.length === 0) {
        return [];
      }

      // Convert to EntryIR format
      const entries: EntryIR[] = irRecords.map((record: any) => ({
        id: record.id,
        user_id: record.user_id,
        source_utterance_id: record.source_utterance_id,
        thread_id: record.thread_id,
        timestamp: record.timestamp,
        knowledge_type: record.knowledge_type as KnowledgeType,
        canon_status: (record.canon_status || 'CANON') as CanonStatus,
        content: record.content,
        entities: (record.entities || []) as EntityRef[],
        emotions: (record.emotions || []) as EmotionSignal[],
        themes: (record.themes || []) as ThemeSignal[],
        confidence: record.confidence,
        certainty_source: record.certainty_source as CertaintySource,
        narrative_links: (record.narrative_links || {}) as NarrativeLinks,
        compiler_flags: (record.compiler_flags || {
          is_dirty: false,
          is_deprecated: false,
          last_compiled_at: record.created_at,
          compilation_version: 1,
        }) as CompilerFlags,
      }));

      // Generate diffs
      return await this.generateDiffs(userId, contract, entries);
    } catch (error) {
      logger.error({ error, userId, contract }, 'Failed to generate diffs from IR');
      return [];
    }
  }

  /**
   * Get narrative diffs for a user
   */
  async getDiffsForUser(
    userId: string,
    options: {
      subject_type?: SubjectType;
      subject_id?: string;
      diff_type?: DiffType;
      contract_type?: SensemakingContractType;
      limit?: number;
    } = {}
  ): Promise<NarrativeDiff[]> {
    try {
      let query = supabaseAdmin
        .from('narrative_diffs')
        .select('*')
        .eq('user_id', userId)
        .order('to_timestamp', { ascending: false });

      if (options.subject_type) {
        query = query.eq('subject_type', options.subject_type);
      }

      if (options.subject_id) {
        query = query.eq('subject_id', options.subject_id);
      }

      if (options.diff_type) {
        query = query.eq('diff_type', options.diff_type);
      }

      if (options.contract_type) {
        query = query.eq('contract_type', options.contract_type);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []) as NarrativeDiff[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get narrative diffs');
      return [];
    }
  }

  /**
   * Get diffs for a specific entity
   */
  async getDiffsForEntity(
    userId: string,
    entityId: string,
    contract?: SensemakingContractType
  ): Promise<NarrativeDiff[]> {
    return this.getDiffsForUser(userId, {
      subject_type: 'ENTITY',
      subject_id: entityId,
      contract_type: contract,
    });
  }

  /**
   * Get diffs for self (identity evolution)
   */
  async getDiffsForSelf(
    userId: string,
    contract?: SensemakingContractType
  ): Promise<NarrativeDiff[]> {
    return this.getDiffsForUser(userId, {
      subject_type: 'SELF',
      subject_id: userId,
      contract_type: contract,
    });
  }
}

export const narrativeDiffEngineService = new NarrativeDiffEngineService();

