// =====================================================
// KNOWLEDGE TYPE ENGINE (KTE)
// Purpose: Explicitly separate EXPERIENCE, BELIEF, and FACT
// so the system knows *what kind of knowing* something is
// =====================================================

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

export type KnowledgeType = 
  | 'EXPERIENCE'  // What happened to me
  | 'FEELING'     // What I felt
  | 'BELIEF'      // What I think / assume / interpret
  | 'FACT'        // Verifiable claims
  | 'DECISION'    // What I chose
  | 'QUESTION';   // Unresolved inquiry

export type CertaintySource = 
  | 'DIRECT_EXPERIENCE'
  | 'HEARSAY'
  | 'INFERENCE'
  | 'VERIFICATION'
  | 'MEMORY_RECALL';

export type TemporalScope = 
  | 'MOMENT'
  | 'PERIOD'
  | 'ONGOING'
  | 'UNKNOWN';

export interface KnowledgeUnit {
  id: string;
  user_id: string;
  utterance_id: string | null;
  knowledge_type: KnowledgeType;
  content: string;
  entities: Array<{ id: string; name: string; type: string }>;
  emotions: string[];
  themes: string[];
  confidence: number;
  certainty_source: CertaintySource | null;
  temporal_scope: TemporalScope | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface EntityRef {
  id: string;
  name: string;
  type: string;
}

// Pattern matching rules for classification
const EXPERIENCE_PATTERNS = [
  /\b(I|we|they)\s+(went|did|saw|heard|met|visited|attended|had|got|received|gave|took|made|said|told|asked|called|texted|emailed|drove|walked|ran|ate|drank|slept|woke|left|arrived|started|finished|ended|stopped|began|continued|decided|chose|picked|bought|sold|found|lost|won|lost|played|worked|studied|learned|taught|helped|hurt|fixed|broke|created|destroyed|built|moved|stayed|returned|left|joined|left|quit|started|stopped)\b/i,
  /\b(today|yesterday|last\s+(week|month|year)|this\s+(morning|afternoon|evening|week|month|year)|on\s+\w+day|at\s+\d+)\s+(I|we|they)\s+/i,
  /\b(happened|occurred|took\s+place|went\s+down)\b/i,
];

const FEELING_PATTERNS = [
  /\b(I|I'm|I\s+was|I\s+feel|I\s+felt|I'm\s+feeling)\s+(happy|sad|angry|frustrated|excited|nervous|anxious|calm|peaceful|stressed|overwhelmed|grateful|thankful|disappointed|proud|ashamed|embarrassed|guilty|relieved|worried|scared|afraid|confident|uncertain|confused|clear|focused|distracted|tired|energetic|exhausted|refreshed|lonely|connected|isolated|supported|abandoned|loved|hated|appreciated|resented|jealous|envious|content|satisfied|unsatisfied|fulfilled|empty|complete|incomplete|whole|broken|healed|hurt|comfortable|uncomfortable|safe|unsafe|secure|insecure|hopeful|hopeless|optimistic|pessimistic|positive|negative|neutral|mixed)\b/i,
  /\b(feeling|felt|feels|emotion|emotional|mood|moody)\b/i,
  /\b(made\s+me\s+feel|makes\s+me\s+feel|feeling\s+like|feel\s+as\s+if)\b/i,
];

const BELIEF_PATTERNS = [
  /\b(I\s+think|I\s+believe|I\s+assume|I\s+guess|I\s+suppose|I\s+imagine|I\s+feel\s+like|it\s+seems|it\s+appears|probably|maybe|perhaps|possibly|likely|unlikely|might|could|would|should|must\s+be|seems\s+like|looks\s+like|sounds\s+like|feels\s+like)\b/i,
  /\b(in\s+my\s+opinion|I\s+think|my\s+take|my\s+view|from\s+my\s+perspective|I\s+interpret|I\s+understand|I\s+see\s+it\s+as)\b/i,
  /\b(probably|maybe|perhaps|possibly|likely|unlikely|might\s+be|could\s+be|seems|appears|looks|sounds)\b/i,
];

const FACT_PATTERNS = [
  /\b(is|are|was|were|has|have|had|does|did|will|can|cannot|cannot\s+be|is\s+not|are\s+not|was\s+not|were\s+not)\b/i,
  /\b(according\s+to|based\s+on|research\s+shows|studies\s+show|data\s+shows|evidence\s+suggests|it\s+is\s+known|it\s+is\s+true|it\s+is\s+fact|verified|confirmed|proven|established)\b/i,
  /\b(\d+\s+(percent|%|years|months|days|hours|minutes|seconds|times|people|items))\b/i,
];

const DECISION_PATTERNS = [
  /\b(I\s+decided|I\s+chose|I\s+opted|I\s+selected|I\s+picked|I\s+went\s+with|I\s+settled\s+on|I\s+committed\s+to|I\s+resolved\s+to|I\s+determined|I\s+made\s+up\s+my\s+mind|my\s+decision|I\s+will|I\s+am\s+going\s+to|I\s+plan\s+to|I\s+intend\s+to)\b/i,
  /\b(decision|choice|option|alternative|path|route|direction|plan|strategy|approach)\b/i,
];

const QUESTION_PATTERNS = [
  /\?/,
  /\b(why|what|when|where|who|how|which|whose|whom|is\s+it|are\s+they|do\s+I|does\s+it|did\s+it|will\s+it|can\s+I|should\s+I|would\s+I|could\s+I|might\s+I|may\s+I)\b/i,
  /\b(wonder|curious|unsure|uncertain|don't\s+know|not\s+sure|not\s+certain|unclear|confused\s+about|question|doubt|puzzled)\b/i,
];

export class KnowledgeTypeEngineService {
  /**
   * Classify knowledge type from utterance text
   */
  classifyKnowledge(utterance: string): KnowledgeType {
    const normalized = this.normalizeText(utterance);

    // Check patterns in order of specificity
    if (this.matchesPattern(normalized, QUESTION_PATTERNS)) {
      return 'QUESTION';
    }

    if (this.matchesPattern(normalized, FEELING_PATTERNS)) {
      return 'FEELING';
    }

    if (this.matchesPattern(normalized, EXPERIENCE_PATTERNS)) {
      return 'EXPERIENCE';
    }

    if (this.matchesPattern(normalized, DECISION_PATTERNS)) {
      return 'DECISION';
    }

    if (this.matchesPattern(normalized, BELIEF_PATTERNS)) {
      return 'BELIEF';
    }

    if (this.matchesPattern(normalized, FACT_PATTERNS)) {
      return 'FACT';
    }

    // Default to EXPERIENCE if no clear pattern (assume user is describing what happened)
    return 'EXPERIENCE';
  }

  /**
   * Get initial confidence based on knowledge type
   */
  initialConfidence(type: KnowledgeType, utterance: string): number {
    switch (type) {
      case 'EXPERIENCE':
        return 0.9; // High confidence in lived experience
      case 'FEELING':
        return 0.95; // Strongest epistemic authority
      case 'BELIEF':
        return 0.5; // Explicitly uncertain
      case 'FACT':
        return 0.7; // Pending verification
      case 'DECISION':
        return 0.85;
      case 'QUESTION':
        return 0.2;
      default:
        return 0.7;
    }
  }

  /**
   * Infer certainty source from knowledge type
   */
  inferSource(type: KnowledgeType): CertaintySource {
    switch (type) {
      case 'EXPERIENCE':
      case 'FEELING':
        return 'DIRECT_EXPERIENCE';
      case 'BELIEF':
        return 'INFERENCE';
      case 'FACT':
        return 'VERIFICATION';
      case 'DECISION':
        return 'DIRECT_EXPERIENCE';
      case 'QUESTION':
        return 'INFERENCE';
      default:
        return 'INFERENCE';
    }
  }

  /**
   * Infer temporal scope from utterance
   */
  inferTemporalScope(utterance: string): TemporalScope {
    const normalized = utterance.toLowerCase();

    if (/\b(now|currently|right\s+now|at\s+this\s+moment|presently|ongoing|continuing|still)\b/.test(normalized)) {
      return 'ONGOING';
    }

    if (/\b(today|yesterday|this\s+(morning|afternoon|evening)|at\s+\d+|on\s+\w+day)\b/.test(normalized)) {
      return 'MOMENT';
    }

    if (/\b(last\s+(week|month|year)|this\s+(week|month|year)|during|throughout|for\s+\d+|over\s+the\s+past)\b/.test(normalized)) {
      return 'PERIOD';
    }

    return 'UNKNOWN';
  }

  /**
   * Create a knowledge unit from an utterance
   */
  async createKnowledgeUnit(
    userId: string,
    utteranceId: string | null,
    utterance: string,
    options: {
      entities?: EntityRef[];
      emotions?: string[];
      themes?: string[];
      knowledgeType?: KnowledgeType;
    } = {}
  ): Promise<KnowledgeUnit> {
    const normalized = this.normalizeText(utterance);
    const type = options.knowledgeType || this.classifyKnowledge(normalized);
    const confidence = this.initialConfidence(type, normalized);
    const certaintySource = this.inferSource(type);
    const temporalScope = this.inferTemporalScope(normalized);

    const { data, error } = await supabaseAdmin
      .from('knowledge_units')
      .insert({
        user_id: userId,
        utterance_id: utteranceId,
        knowledge_type: type,
        content: normalized,
        entities: options.entities || [],
        emotions: options.emotions || [],
        themes: options.themes || [],
        confidence,
        certainty_source: certaintySource,
        temporal_scope: temporalScope,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create knowledge unit');
      throw error;
    }

    return data;
  }

  /**
   * Get knowledge units for an utterance
   */
  async getKnowledgeUnitsForUtterance(
    userId: string,
    utteranceId: string
  ): Promise<KnowledgeUnit[]> {
    const { data, error } = await supabaseAdmin
      .from('knowledge_units')
      .select('*')
      .eq('user_id', userId)
      .eq('utterance_id', utteranceId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error({ error }, 'Failed to get knowledge units');
      return [];
    }

    return data || [];
  }

  /**
   * Get knowledge units by type
   */
  async getKnowledgeUnitsByType(
    userId: string,
    type: KnowledgeType,
    limit: number = 50
  ): Promise<KnowledgeUnit[]> {
    const { data, error } = await supabaseAdmin
      .from('knowledge_units')
      .select('*')
      .eq('user_id', userId)
      .eq('knowledge_type', type)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error }, 'Failed to get knowledge units by type');
      return [];
    }

    return data || [];
  }

  /**
   * Link knowledge unit to event
   */
  async linkKnowledgeUnitToEvent(
    userId: string,
    eventId: string,
    knowledgeUnitId: string,
    role: 'what_happened' | 'fact' | 'interpretation' | 'feeling'
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('event_knowledge_links')
      .insert({
        user_id: userId,
        event_id: eventId,
        knowledge_unit_id: knowledgeUnitId,
        role,
      });

    if (error) {
      logger.error({ error }, 'Failed to link knowledge unit to event');
      throw error;
    }
  }

  /**
   * Check if a unit can be corrected (epistemic rules)
   */
  canBeCorrected(unit: KnowledgeUnit): boolean {
    // EXPERIENCE and FEELING are never "wrong"
    return unit.knowledge_type !== 'EXPERIENCE' && unit.knowledge_type !== 'FEELING';
  }

  /**
   * Get epistemic authority ranking for recall
   */
  getEpistemicRank(type: KnowledgeType): number {
    // Higher number = higher authority
    switch (type) {
      case 'FEELING':
        return 5;
      case 'EXPERIENCE':
        return 4;
      case 'FACT':
        return 3;
      case 'DECISION':
        return 2;
      case 'BELIEF':
        return 1;
      case 'QUESTION':
        return 0;
      default:
        return 1;
    }
  }

  /**
   * Normalize text for classification
   */
  private normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if text matches any pattern
   */
  private matchesPattern(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }
}

export const knowledgeTypeEngineService = new KnowledgeTypeEngineService();

