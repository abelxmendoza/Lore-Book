// =====================================================
// TOKEN BUDGET SERVICE
//
// Server-side token accounting for LLM context windows.
// Prevents silent context overflow on long conversations.
//
// Two pools are managed independently:
//   [A] conversation_history  — client-supplied, unbounded by default → bounded here
//   [B] rag_packet            — managed by contextCompressor (2000 tokens)
//   [C] system_prompt         — fixed ~2000 tokens
//   [D] response_buffer       — reserved for model output
//
// Never pass raw unbounded history to the LLM again.
// =====================================================

// ─── Context window limits per model ─────────────────────────────────────────
// Conservative values — stay well under actual limits to leave headroom.
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o':          128_000,
  'gpt-4o-mini':      128_000,
  'gpt-4-turbo':      128_000,
  'gpt-4':             8_192,
  'gpt-3.5-turbo':   16_385,
  'claude-opus-4-7':  200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

// Fraction of context window allocated to each pool
const BUDGET_FRACTIONS = {
  system_prompt:    0.02,   // ~2–4k tokens — fixed, small
  rag_packet:       0.12,   // semantic memory context
  response_buffer:  0.05,   // reserved for model output
  // conversation_history gets the remainder
} as const;

export interface TurnBudgetResult {
  /** History turns that fit within the budget, newest-first order preserved */
  truncatedHistory: Array<{ role: string; content: string }>;
  /** True if older turns were dropped and compaction should be triggered */
  compactionNeeded: boolean;
  /** Number of turns dropped */
  droppedTurns: number;
  /** Estimated token counts for observability */
  tokenCounts: {
    systemPrompt: number;
    ragPacket: number;
    history: number;
    total: number;
    limit: number;
  };
}

class TokenBudgetService {
  /**
   * Estimate token count using the 4-chars-per-token heuristic.
   * Accurate enough for budget management; not suitable for billing.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate conversation history to fit within the token budget.
   *
   * Strategy: walk history newest-to-oldest, keep turns that fit.
   * The most recent turns are always preserved — older context is dropped first.
   *
   * @param history       Full conversation history from client
   * @param model         Model identifier (used to look up context window size)
   * @param ragTokens     Token count of the RAG packet (from contextCompressor)
   * @param systemTokens  Token count of the system prompt
   */
  buildBudgetedHistory(
    history: Array<{ role: string; content: string }>,
    model: string,
    ragTokens: number,
    systemTokens: number
  ): TurnBudgetResult {
    const limit = MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;

    const responseBuffer   = Math.floor(limit * BUDGET_FRACTIONS.response_buffer);
    const available        = limit - systemTokens - ragTokens - responseBuffer;

    // Walk newest → oldest, accumulate until budget exhausted
    let historyTokens = 0;
    const kept: Array<{ role: string; content: string }> = [];

    for (let i = history.length - 1; i >= 0; i--) {
      // +8 overhead per turn (role token + message framing)
      const turnTokens = this.estimateTokens(history[i].content) + 8;
      if (historyTokens + turnTokens > available) {
        const droppedTurns = i + 1;
        return {
          truncatedHistory: kept.reverse(),
          compactionNeeded: droppedTurns > 0,
          droppedTurns,
          tokenCounts: {
            systemPrompt: systemTokens,
            ragPacket:    ragTokens,
            history:      historyTokens,
            total:        systemTokens + ragTokens + historyTokens + responseBuffer,
            limit,
          },
        };
      }
      historyTokens += turnTokens;
      kept.push(history[i]);
    }

    return {
      truncatedHistory: kept.reverse(),
      compactionNeeded: false,
      droppedTurns: 0,
      tokenCounts: {
        systemPrompt: systemTokens,
        ragPacket:    ragTokens,
        history:      historyTokens,
        total:        systemTokens + ragTokens + historyTokens + responseBuffer,
        limit,
      },
    };
  }

  /**
   * Estimate token count of the system prompt.
   * Call once per chat turn; result is passed into buildBudgetedHistory.
   */
  estimateSystemPromptTokens(systemPrompt: string): number {
    return this.estimateTokens(systemPrompt) + 8; // +8 role overhead
  }

  /**
   * Estimate token count of a RAG packet (entries array + engine outputs).
   * Pass the serialized context string, not the raw object.
   */
  estimateRagTokens(ragContextText: string): number {
    return this.estimateTokens(ragContextText);
  }
}

export const tokenBudgetService = new TokenBudgetService();
