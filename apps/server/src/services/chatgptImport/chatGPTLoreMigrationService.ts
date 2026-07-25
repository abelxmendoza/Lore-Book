import { createHash } from 'crypto';

import { logger } from '../../logger';
import { memoryReviewQueueService } from '../memoryReviewQueueService';
import { selfCharacterService } from '../selfCharacterService';

import type {
  ChatGPTExportConversation,
  ChatGPTMemoryHandoffClaim,
} from './chatGPTExportParser';

export type ChatGPTLoreCategory =
  | 'identity'
  | 'relationships'
  | 'projects'
  | 'skills_interests'
  | 'goals_values'
  | 'places_organizations'
  | 'timeline'
  | 'preferences_habits'
  | 'other';

export type ChatGPTLoreMigrationStats = {
  conversationsProcessed: number;
  userMessagesConsidered: number;
  handoffClaimsConsidered: number;
  assistantMessagesExcluded: number;
  hypotheticalMessagesExcluded: number;
  sensitiveClaimsExcluded: number;
  proposalsCreated: number;
  proposalsDeduplicated: number;
  categoryCounts: Partial<Record<ChatGPTLoreCategory, number>>;
  examples: Partial<Record<ChatGPTLoreCategory, string[]>>;
};

const CATEGORY_LABELS: Record<ChatGPTLoreCategory, string> = {
  identity: 'Identity',
  relationships: 'People & relationships',
  projects: 'Projects',
  skills_interests: 'Skills & interests',
  goals_values: 'Goals & values',
  places_organizations: 'Places & organizations',
  timeline: 'Timeline',
  preferences_habits: 'Preferences & habits',
  other: 'Other profile lore',
};

const HYPOTHETICAL_OR_TASK =
  /\b(?:hypothetical|imagine (?:that|you|a)|pretend|role[- ]?play|fictional|sample data|test fixture|debug this|here(?:'s| is) (?:my|the) code)\b|```|\b(?:write|draft|generate|create)\s+(?:me\s+)?(?:a|an|the)\b/i;
const SENSITIVE =
  /\b(?:diagnos|medical|health|therapy|medication|sexual|sex life|pregnan|abuse|trauma|religion|politic|salary|income|debt|bank|crime|legal case)\b/i;
const AUTOBIOGRAPHICAL =
  /\b(?:i am|i'm|i was|i grew up|i live|i lived|i work|i worked|i study|i studied|i built|i created|i started|i founded|i have|i had|i like|i love|i prefer|i dislike|i hate|i want|i plan|i hope|i believe|i value|i met|i went|i moved|my [a-z][a-z '-]{1,40} (?:is|was|are|were))\b/i;

function emptyStats(): ChatGPTLoreMigrationStats {
  return {
    conversationsProcessed: 0,
    userMessagesConsidered: 0,
    handoffClaimsConsidered: 0,
    assistantMessagesExcluded: 0,
    hypotheticalMessagesExcluded: 0,
    sensitiveClaimsExcluded: 0,
    proposalsCreated: 0,
    proposalsDeduplicated: 0,
    categoryCounts: {},
    examples: {},
  };
}

function splitCandidateClaims(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(
      (sentence) =>
        sentence.length >= 12 &&
        sentence.length <= 420 &&
        !sentence.endsWith('?') &&
        AUTOBIOGRAPHICAL.test(sentence),
    );
}

export function extractUserAuthoredChatGPTClaims(
  text: string,
  options: { includeSensitive?: boolean } = {},
): {
  claims: string[];
  excludedAsHypothetical: boolean;
  sensitiveClaimsExcluded: number;
} {
  if (HYPOTHETICAL_OR_TASK.test(text)) {
    return { claims: [], excludedAsHypothetical: true, sensitiveClaimsExcluded: 0 };
  }
  const candidates = splitCandidateClaims(text);
  if (options.includeSensitive) {
    return { claims: candidates, excludedAsHypothetical: false, sensitiveClaimsExcluded: 0 };
  }
  const claims = candidates.filter((claim) => !SENSITIVE.test(claim));
  return {
    claims,
    excludedAsHypothetical: false,
    sensitiveClaimsExcluded: candidates.length - claims.length,
  };
}

export function classifyChatGPTLoreCategory(text: string): ChatGPTLoreCategory {
  if (/\b(?:dating|partner|friend|family|mother|father|sister|brother|relationship|married|boyfriend|girlfriend|met)\b/i.test(text)) {
    return 'relationships';
  }
  if (/\b(?:project|product|app|company|startup|founded|built|created|launch)\b/i.test(text)) {
    return 'projects';
  }
  if (/\b(?:skill|learn|studied|program|design|write|music|art|interest|hobby)\b/i.test(text)) {
    return 'skills_interests';
  }
  if (/\b(?:goal|want|plan|hope|value|believe|important to me)\b/i.test(text)) {
    return 'goals_values';
  }
  if (/\b(?:live|lived|moved|city|country|school|university|company|organization|work at|work for)\b/i.test(text)) {
    return 'places_organizations';
  }
  if (/\b(?:prefer|like|love|dislike|hate|usually|always|routine|habit)\b/i.test(text)) {
    return 'preferences_habits';
  }
  if (/\b(?:born|grew up|when i|last year|yesterday|today|in 20\d{2}|started|ended|went|visited)\b/i.test(text)) {
    return 'timeline';
  }
  if (/\b(?:i am|i'm|i was|my identity|my personality|i consider myself)\b/i.test(text)) {
    return 'identity';
  }
  return 'other';
}

function classifyHandoffCategory(
  handoff: ChatGPTMemoryHandoffClaim | undefined,
  text: string,
): ChatGPTLoreCategory {
  const category = handoff?.category.toLowerCase().replace(/[_-]+/g, ' ') ?? '';
  if (/\b(?:identity|creative identity)\b/.test(category)) return 'identity';
  if (/\b(?:relationship|family|social|personal history)\b/.test(category)) return 'relationships';
  if (/\b(?:project|software)\b/.test(category)) return 'projects';
  if (/\b(?:interest|skill|education|learning|creative work|activit)\b/.test(category)) {
    return 'skills_interests';
  }
  if (/\b(?:goal|value)\b/.test(category)) return 'goals_values';
  if (/\b(?:career|employment)\b/.test(category)) return 'places_organizations';
  if (/\b(?:preference|habit|communication)\b/.test(category)) return 'preferences_habits';
  return classifyChatGPTLoreCategory(text);
}

function handoffConfidence(handoff: ChatGPTMemoryHandoffClaim | undefined): number {
  if (handoff?.confidence === 'high') return 0.72;
  if (handoff?.confidence === 'medium') return 0.55;
  if (handoff?.confidence === 'low') return 0.4;
  return 0.5;
}

function mergeStats(target: ChatGPTLoreMigrationStats, source: ChatGPTLoreMigrationStats): void {
  for (const key of [
    'conversationsProcessed',
    'userMessagesConsidered',
    'handoffClaimsConsidered',
    'assistantMessagesExcluded',
    'hypotheticalMessagesExcluded',
    'sensitiveClaimsExcluded',
    'proposalsCreated',
    'proposalsDeduplicated',
  ] as const) {
    target[key] += source[key];
  }
  for (const [category, count] of Object.entries(source.categoryCounts)) {
    const key = category as ChatGPTLoreCategory;
    target.categoryCounts[key] = (target.categoryCounts[key] ?? 0) + (count ?? 0);
  }
  for (const [category, examples] of Object.entries(source.examples)) {
    const key = category as ChatGPTLoreCategory;
    target.examples[key] = [...new Set([...(target.examples[key] ?? []), ...(examples ?? [])])].slice(0, 3);
  }
}

export class ChatGPTLoreMigrationService {
  async processConversations(params: {
    userId: string;
    sourceFileId: string;
    conversations: ChatGPTExportConversation[];
    includeSensitive?: boolean;
  }): Promise<ChatGPTLoreMigrationStats> {
    const stats = emptyStats();
    const self = await selfCharacterService.ensureSelfCharacter(params.userId);
    if (!self?.id) throw new Error('LoreBook could not resolve your self profile.');
    const entity = {
      id: String(self.id),
      primary_name: String(self.name ?? self.primary_name ?? 'You'),
    };

    for (const conversation of params.conversations) {
      stats.conversationsProcessed += 1;
      for (const message of conversation.messages) {
        if (message.role === 'assistant') {
          stats.assistantMessagesExcluded += 1;
          continue;
        }
        const candidates: Array<{
          text: string;
          category: ChatGPTLoreCategory;
          confidence: number;
          source: 'chatgpt_export' | 'chatgpt_memory_handoff';
          authority: 'user_authored' | 'assistant_recalled_review_required';
          metadata?: Record<string, unknown>;
        }> = [];

        if (message.role === 'handoff') {
          stats.handoffClaimsConsidered += 1;
          if (message.handoffClaim?.sensitive && !params.includeSensitive) {
            stats.sensitiveClaimsExcluded += 1;
            continue;
          }
          candidates.push({
            text: message.text,
            category: classifyHandoffCategory(message.handoffClaim, message.text),
            confidence: handoffConfidence(message.handoffClaim),
            source: 'chatgpt_memory_handoff',
            authority: 'assistant_recalled_review_required',
            metadata: {
              handoff_category: message.handoffClaim?.category ?? null,
              handoff_confidence: message.handoffClaim?.confidence ?? 'unknown',
              handoff_source_type: message.handoffClaim?.sourceType ?? 'unclear',
              handoff_approximate_period: message.handoffClaim?.approximatePeriod ?? null,
              handoff_related_entities: message.handoffClaim?.relatedEntities ?? null,
              handoff_evidence: message.handoffClaim?.evidence ?? null,
              handoff_sensitive: message.handoffClaim?.sensitive ?? false,
            },
          });
        } else if (message.role === 'user') {
          stats.userMessagesConsidered += 1;
          const extraction = extractUserAuthoredChatGPTClaims(message.text, {
            includeSensitive: params.includeSensitive,
          });
          if (extraction.excludedAsHypothetical) {
            stats.hypotheticalMessagesExcluded += 1;
            continue;
          }
          stats.sensitiveClaimsExcluded += extraction.sensitiveClaimsExcluded;
          candidates.push(
            ...extraction.claims.map((text) => ({
              text,
              category: classifyChatGPTLoreCategory(text),
              confidence: 0.82,
              source: 'chatgpt_export' as const,
              authority: 'user_authored' as const,
            })),
          );
        } else {
          continue;
        }

        for (const candidate of candidates) {
          const claimText = candidate.text;
          const category = candidate.category;
          const evidenceId = `chatgpt:${params.sourceFileId}:${conversation.id}:${message.id}`;
          const claim = {
            text: claimText,
            confidence: candidate.confidence,
            metadata: {
              force_review: true,
              source: candidate.source,
              source_file_id: params.sourceFileId,
              source_conversation_id: conversation.id,
              source_conversation_title: conversation.title,
              source_message_id: message.id,
              source_message_created_at: message.createdAt,
              extracted_unit_id: evidenceId,
              authority: candidate.authority,
              category,
              group_label: `ChatGPT import · ${CATEGORY_LABELS[category]}`,
              import_fingerprint: createHash('sha256').update(evidenceId).digest('hex'),
              ...candidate.metadata,
            },
          };

          try {
            const { proposal } = await memoryReviewQueueService.ingestMemory(
              params.userId,
              claim,
              entity,
              null,
              claimText,
            );
            const metadata = (proposal.metadata ?? {}) as Record<string, unknown>;
            const evidenceCount = Number(metadata.evidence_count ?? 1);
            if (evidenceCount > 1) stats.proposalsDeduplicated += 1;
            else stats.proposalsCreated += 1;
            stats.categoryCounts[category] = (stats.categoryCounts[category] ?? 0) + 1;
            stats.examples[category] = [...new Set([...(stats.examples[category] ?? []), claimText])].slice(0, 3);
          } catch (error) {
            logger.warn(
              { error, userId: params.userId, conversationId: conversation.id, messageId: message.id },
              'ChatGPT lore proposal failed',
            );
          }
        }
      }
    }
    return stats;
  }

  mergeStats(
    current: ChatGPTLoreMigrationStats | null | undefined,
    next: ChatGPTLoreMigrationStats,
  ): ChatGPTLoreMigrationStats {
    const merged = current ? structuredClone(current) : emptyStats();
    mergeStats(merged, next);
    return merged;
  }
}

export const chatGPTLoreMigrationService = new ChatGPTLoreMigrationService();
