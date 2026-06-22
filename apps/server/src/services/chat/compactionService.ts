// =====================================================
// CONVERSATION COMPACTION SERVICE
//
// Produces rolling summaries of dropped conversation turns.
// Compacted summaries are stored in conversation_compactions — NOT journal_entries.
//
// Architectural invariant:
//   Synthetic session summaries must NEVER enter autobiographical semantic search.
//   conversation_compactions is a separate cognitive layer from journal_entries.
//
// Retrieval: compactions are loaded at session start as a [SESSION MEMORY] block
//   prepended to the system prompt. They are NOT semantically searched.
// =====================================================

import { openai } from '../../lib/openai';
import { config } from '../../config';
import { logger } from '../../logger';
import { extractResponseText } from '../../lib/openaiResponsesBridge';
import { supabaseAdmin } from '../supabaseClient';

export interface CompactionInput {
  role: string;
  content: string;
}

export interface CompactionRecord {
  id: string;
  summary: string;
  summary_tokens: number;
  original_tokens: number;
  key_entities: string[];
  key_topics: string[];
  created_at: string;
}

class CompactionService {
  private readonly TARGET_SUMMARY_TOKENS = 600;  // ~2400 chars
  private readonly MAX_SUMMARY_TOKENS    = 800;

  /**
   * Compact dropped conversation turns into a persisted summary.
   * Call non-blocking (setImmediate) — never on the chat critical path.
   *
   * @param userId      Owner of the conversation
   * @param sessionId   Session the turns belong to
   * @param turns       The dropped turns to compress (oldest first)
   * @param type        Compaction type for lifecycle tracking
   */
  async compact(
    userId: string,
    sessionId: string,
    turns: CompactionInput[],
    type: 'ROLLING' | 'EPISODIC' | 'SESSION_CLOSE'
  ): Promise<void> {
    if (turns.length === 0) return;

    const originalText  = turns.map(t => `${t.role}: ${t.content}`).join('\n');
    const originalTokens = Math.ceil(originalText.length / 4);

    try {
      const { summary, keyEntities, keyTopics } = await this.summarizeTurns(turns);
      const summaryTokens = Math.ceil(summary.length / 4);

      await supabaseAdmin.from('conversation_compactions').insert({
        user_id:          userId,
        session_id:       sessionId,
        compaction_type:  type,
        turn_range_start: 0,
        turn_range_end:   turns.length - 1,
        original_turns:   turns.length,
        summary,
        summary_tokens:   summaryTokens,
        original_tokens:  originalTokens,
        compression_ratio: originalTokens > 0 ? summaryTokens / originalTokens : 1,
        model_used:       config.defaultModel,
        key_entities:     keyEntities,
        key_topics:       keyTopics,
      });

      logger.debug({
        userId,
        sessionId,
        type,
        originalTurns: turns.length,
        originalTokens,
        summaryTokens,
        compressionRatio: (summaryTokens / originalTokens).toFixed(2),
      }, 'Conversation compaction stored');
    } catch (err) {
      // Compaction failure is non-fatal — the conversation can continue.
      // The dropped turns are simply not summarized for this session.
      logger.warn({ err, userId, sessionId }, 'Compaction failed; dropped turns will not be summarized');
    }
  }

  /**
   * Load all compactions for a session, ordered oldest-first.
   * Used at session init to prepend [SESSION MEMORY] to the system prompt.
   */
  async getSessionCompactions(userId: string, sessionId: string): Promise<CompactionRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('conversation_compactions')
      .select('id, summary, summary_tokens, original_tokens, key_entities, key_topics, created_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.warn({ err: error, userId, sessionId }, 'Failed to load session compactions');
      return [];
    }
    return (data ?? []) as CompactionRecord[];
  }

  /**
   * Build the [SESSION MEMORY] block from stored compactions.
   * Prepend this to the system prompt at the start of each turn.
   * Returns empty string if no compactions exist for the session.
   */
  buildSessionMemoryBlock(compactions: CompactionRecord[]): string {
    if (compactions.length === 0) return '';
    const summaries = compactions.map(c => c.summary).join('\n\n');
    return `[SESSION MEMORY — earlier in this conversation]\n${summaries}`;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async summarizeTurns(
    turns: CompactionInput[]
  ): Promise<{ summary: string; keyEntities: string[]; keyTopics: string[] }> {
    if (config.openAiUseCompactApi) {
      try {
        return await this.summarizeTurnsWithCompactApi(turns);
      } catch (err) {
        logger.warn({ err }, 'OpenAI compact API failed — falling back to chat summarizer');
      }
    }

    const conversation = turns
      .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0,
      max_tokens: this.MAX_SUMMARY_TOKENS,
      messages: [
        {
          role: 'system',
          content:
            'You are a conversation summarizer. Produce a dense factual summary of the conversation ' +
            'that preserves: key decisions, facts stated, entities mentioned, timeline references, ' +
            'and emotional context. Do not editorialize. Do not add interpretation not present in the text.',
        },
        {
          role: 'user',
          content:
            `Summarize this conversation segment in approximately ${this.TARGET_SUMMARY_TOKENS} tokens.\n\n` +
            `Also extract:\n` +
            `- key_entities: comma-separated list of people, places, organizations mentioned\n` +
            `- key_topics: comma-separated list of main topics\n\n` +
            `Format your response as:\n` +
            `SUMMARY:\n[summary text]\n\nKEY_ENTITIES: [comma list]\nKEY_TOPICS: [comma list]\n\n` +
            `Conversation:\n${conversation}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '';
    return this.parseCompactionResponse(raw);
  }

  /** OpenAI `/responses/compact` — opt-in via OPENAI_USE_COMPACT_API. */
  private async summarizeTurnsWithCompactApi(
    turns: CompactionInput[],
  ): Promise<{ summary: string; keyEntities: string[]; keyTopics: string[] }> {
    const input = turns.map((turn) => ({
      role: turn.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: turn.content,
    }));

    const compacted = await openai.responses.compact({
      model: config.defaultModel,
      input,
    });

    const compactedInput = (compacted as { output?: unknown }).output ?? compacted;
    const summarySeed = typeof compactedInput === 'string'
      ? compactedInput
      : extractResponseText(compacted as Parameters<typeof extractResponseText>[0]);

    const enrichment = await openai.chat.completions.create({
      model: config.nanoModel,
      temperature: 0,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content:
            'Extract key_entities and key_topics from the compacted conversation summary. ' +
            'Respond in this exact format:\nKEY_ENTITIES: a, b\nKEY_TOPICS: x, y',
        },
        { role: 'user', content: summarySeed },
      ],
    });

    const raw = [
      'SUMMARY:',
      summarySeed,
      '',
      enrichment.choices[0]?.message?.content ?? '',
    ].join('\n');

    return this.parseCompactionResponse(raw);
  }

  private parseCompactionResponse(
    raw: string
  ): { summary: string; keyEntities: string[]; keyTopics: string[] } {
    const summaryMatch    = raw.match(/SUMMARY:\s*([\s\S]*?)(?=KEY_ENTITIES:|$)/i);
    const entitiesMatch   = raw.match(/KEY_ENTITIES:\s*([^\n]*)/i);
    const topicsMatch     = raw.match(/KEY_TOPICS:\s*([^\n]*)/i);

    const summary     = summaryMatch?.[1]?.trim() ?? raw.trim();
    const keyEntities = (entitiesMatch?.[1] ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const keyTopics   = (topicsMatch?.[1] ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);

    return { summary, keyEntities, keyTopics };
  }
}

export const compactionService = new CompactionService();
