/** Rough USD estimates per 1M tokens (input / output). Update when models change. */
const PRICE_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

const DEFAULT_PRICE = { input: 0.15, output: 0.6 };

function resolvePrice(model: string) {
  const m = model.toLowerCase();
  const key = Object.keys(PRICE_PER_1M).find((k) => m.includes(k));
  return key ? PRICE_PER_1M[key] : DEFAULT_PRICE;
}

export function estimateUsdFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = resolvePrice(model);
  const usd =
    (Math.max(0, inputTokens) * price.input + Math.max(0, outputTokens) * price.output) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export type TokenUsageLike = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

export function readTokenUsage(usage: TokenUsageLike | null | undefined): {
  inputTokens: number;
  outputTokens: number;
} {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
  };
}

export function estimateUsdFromUsage(
  model: string,
  usage: TokenUsageLike | null | undefined,
): number {
  const { inputTokens, outputTokens } = readTokenUsage(usage);
  return estimateUsdFromTokens(model, inputTokens, outputTokens);
}
