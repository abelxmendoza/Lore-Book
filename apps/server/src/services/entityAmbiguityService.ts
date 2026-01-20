// =====================================================
// INLINE ENTITY AMBIGUITY & DISAMBIGUATION ENGINE (IADE)
// Purpose:
// Detect ambiguous PRIMARY entities in chat
// Ask clarification ONLY when necessary
// Never pollute memory or force ontology on the user
// =====================================================

import { logger } from '../logger';
import type { UserIntent } from '../types/conversationalOrchestration';
import { entityResolutionService, type EntityCandidate, type ResolutionTier } from './entityResolutionService';

// -----------------------------
// TYPES
// -----------------------------

export interface AmbiguitySignal {
  mention_text: string; // e.g. "Alex"
  candidates: EntityCandidate[]; // PRIMARY tier only
  similarity_scores: {
    name: number;
    context: number;
    recency: number;
  }[];
  confidence_gap: number; // how close top candidates are
  recent_context_entities: string[]; // entities active in last N turns
}

export interface ExtractedEntityMention {
  text: string;
  start_index: number;
  end_index: number;
  confidence: number;
}

export interface ChatContext {
  recent_entities: string[]; // entity IDs active in recent turns
  recent_messages: string[]; // last N messages for context
  session_id: string;
}

export interface DisambiguationPrompt {
  type: 'ENTITY_CLARIFICATION';
  mention_text: string;
  options: Array<{
    label: string;
    subtitle?: string;
    entity_id: string;
    entity_type: string;
  }>;
  skippable: boolean;
  explanation: string;
}

export interface DisambiguationResponse {
  mention_text: string;
  action: 'SELECT_ENTITY' | 'CREATE_NEW_ENTITY' | 'SKIP';
  entity_id?: string;
}

// -----------------------------
// THRESHOLDS
// -----------------------------

const AMBIGUITY_THRESHOLD = 0.75;
const CONFIDENCE_GAP_MAX = 0.15;
const MAX_CANDIDATES = 3;
const MIN_CANDIDATES_FOR_AMBIGUITY = 2;

// -----------------------------
// ENTITY AMBIGUITY SERVICE
// -----------------------------

export class EntityAmbiguityService {
  /**
   * Extract entity mentions from message text
   * Simple pattern-based extraction (can be enhanced with LLM)
   */
  extractEntityMentions(message: string): ExtractedEntityMention[] {
    const mentions: ExtractedEntityMention[] = [];

    // Pattern: Capitalized words (potential names)
    // This is a simple heuristic - can be enhanced with LLM
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let match;

    while ((match = namePattern.exec(message)) !== null) {
      const text = match[1];
      // Skip common words that are capitalized
      const skipWords = [
        'I', 'The', 'This', 'That', 'There', 'Here', 'When', 'Where', 'What', 'Who', 'Why', 'How',
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
      ];

      if (!skipWords.includes(text) && text.length > 2) {
        mentions.push({
          text,
          start_index: match.index,
          end_index: match.index + text.length,
          confidence: 0.6, // Default confidence
        });
      }
    }

    return mentions;
  }

  /**
   * Detect entity ambiguity in extracted mentions
   */
  async detectEntityAmbiguity(
    userId: string,
    mentions: ExtractedEntityMention[],
    context: ChatContext
  ): Promise<AmbiguitySignal[]> {
    const signals: AmbiguitySignal[] = [];

    for (const mention of mentions) {
      try {
        // Find candidates (PRIMARY tier only)
        const candidates = await entityResolutionService.findCandidates(
          userId,
          mention.text,
          {
            tier: 'PRIMARY',
            limit: MAX_CANDIDATES,
          }
        );

        // Need at least 2 candidates for ambiguity
        if (candidates.length < MIN_CANDIDATES_FOR_AMBIGUITY) {
          continue;
        }

        // Compute similarity scores
        const scores = this.computeSimilarityScores(mention, candidates, context);

        // Check if top candidates are too close
        const topScore = scores[0]?.total || 0;
        const secondScore = scores[1]?.total || 0;
        const gap = topScore - secondScore;

        // Ambiguous if:
        // 1. Top score is high enough (confident it's an entity)
        // 2. Gap is small (multiple candidates are plausible)
        if (topScore >= AMBIGUITY_THRESHOLD && gap <= CONFIDENCE_GAP_MAX) {
          signals.push({
            mention_text: mention.text,
            candidates,
            similarity_scores: scores,
            confidence_gap: gap,
            recent_context_entities: context.recent_entities,
          });
        }
      } catch (error) {
        logger.warn({ error, userId, mention: mention.text }, 'Failed to check entity ambiguity');
        // Continue with other mentions
      }
    }

    return signals;
  }

  /**
   * Compute similarity scores for candidates
   */
  private computeSimilarityScores(
    mention: ExtractedEntityMention,
    candidates: EntityCandidate[],
    context: ChatContext
  ): Array<{ name: number; context: number; recency: number; total: number }> {
    return candidates.map(candidate => {
      // Name similarity (already computed in findCandidates, but refine here)
      let nameScore = 0;
      const normalizedMention = mention.text.toLowerCase();
      const normalizedName = candidate.primary_name.toLowerCase();

      if (normalizedName === normalizedMention) {
        nameScore = 1.0;
      } else if (normalizedName.includes(normalizedMention) || normalizedMention.includes(normalizedName)) {
        nameScore = 0.8;
      } else {
        // Check aliases
        const aliasMatch = candidate.aliases.some(alias => {
          const normalizedAlias = alias.toLowerCase();
          return normalizedAlias === normalizedMention || 
                 normalizedAlias.includes(normalizedMention) ||
                 normalizedMention.includes(normalizedAlias);
        });
        if (aliasMatch) {
          nameScore = 0.7;
        } else {
          nameScore = 0.5; // Fuzzy match
        }
      }

      // Context similarity (was this entity mentioned recently?)
      const contextScore = context.recent_entities.includes(candidate.entity_id) ? 0.3 : 0;

      // Recency score (more recently used = higher score)
      // Normalize last_seen to 0-1 scale (recent = higher)
      const lastSeenDate = new Date(candidate.last_seen);
      const daysSince = (Date.now() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 0.2 * (1 - daysSince / 365)); // Decay over 1 year

      const total = nameScore + contextScore + recencyScore;

      return { name: nameScore, context: contextScore, recency: recencyScore, total };
    });
  }

  /**
   * Decide whether to prompt for disambiguation
   */
  shouldPromptDisambiguation(
    ambiguity: AmbiguitySignal,
    intent: UserIntent
  ): boolean {
    // Never interrupt venting or emotional processing
    // Note: UserIntent doesn't have VENTING/SUPPORT_REQUEST, so we'll check message content
    // For now, we'll be conservative and only skip for explicit support requests
    if (intent === 'DECISION_SUPPORT') {
      // Could skip here, but decision support might benefit from clarity
      // Let's allow it for now
    }

    // Never disambiguate non-PRIMARY tier entities
    if (!ambiguity.candidates.every(c => c.resolution_tier === 'PRIMARY')) {
      return false;
    }

    // Must have at least 2 candidates
    if (ambiguity.candidates.length < 2) {
      return false;
    }

    return true;
  }

  /**
   * Build disambiguation prompt for UI
   */
  buildDisambiguationPrompt(ambiguity: AmbiguitySignal): DisambiguationPrompt {
    const options = ambiguity.candidates.map(candidate => {
      // Build subtitle with context hints
      const hints: string[] = [];
      
      if (candidate.usage_count > 0) {
        hints.push(`mentioned ${candidate.usage_count} time${candidate.usage_count !== 1 ? 's' : ''}`);
      }

      const lastSeen = new Date(candidate.last_seen);
      const daysAgo = Math.floor((Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo < 7) {
        hints.push('recent');
      } else if (daysAgo < 30) {
        hints.push('this month');
      }

      if (candidate.entity_type) {
        hints.push(candidate.entity_type.toLowerCase());
      }

      return {
        label: candidate.primary_name,
        subtitle: hints.length > 0 ? hints.join(' · ') : undefined,
        entity_id: candidate.entity_id,
        entity_type: candidate.entity_type,
      };
    });

    // Add "Someone else" option
    options.push({
      label: 'Someone else',
      subtitle: 'Create a new entity',
      entity_id: '', // Will be handled specially
      entity_type: '',
    });

    return {
      type: 'ENTITY_CLARIFICATION',
      mention_text: ambiguity.mention_text,
      options,
      skippable: true,
      explanation: 'This helps keep names and events accurate.',
    };
  }
}

export const entityAmbiguityService = new EntityAmbiguityService();

