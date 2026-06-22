import { config } from '../config';
import { estimateUsdFromTokens } from '../lib/openaiCost';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

export type OpenAiBudgetSnapshot = {
  enabled: boolean;
  monthlyLimitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  percentUsed: number;
  exhausted: boolean;
  warning: boolean;
  resetsAt: string;
};

type SpendRow = {
  estimated_usd: number;
  input_tokens: number;
  output_tokens: number;
  call_count: number;
};

const monthKey = (date = new Date()): string => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  return start.toISOString().split('T')[0];
};

const nextMonthIso = (date = new Date()): string => {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return next.toISOString();
};

let memorySpendUsd = 0;
let memoryMonth = monthKey();
let tableAvailable: boolean | null = null;

function budgetLimitUsd(): number {
  return Math.max(0, config.monthlyOpenAiBudgetUsd ?? 0);
}

function isBudgetEnabled(): boolean {
  return budgetLimitUsd() > 0;
}

async function loadSpendFromDb(month: string): Promise<SpendRow | null> {
  if (tableAvailable === false) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_openai_spend')
      .select('estimated_usd, input_tokens, output_tokens, call_count')
      .eq('month', month)
      .maybeSingle();
    if (error) {
      if (/platform_openai_spend|relation.*does not exist|PGRST205/i.test(error.message ?? '')) {
        tableAvailable = false;
        return null;
      }
      logger.warn({ err: error }, 'Failed to load platform OpenAI spend');
      return null;
    }
    tableAvailable = true;
    return data as SpendRow | null;
  } catch (err) {
    logger.warn({ err }, 'Failed to load platform OpenAI spend');
    return null;
  }
}

async function getSpentUsd(month = monthKey()): Promise<number> {
  if (memoryMonth !== month) {
    memoryMonth = month;
    memorySpendUsd = 0;
  }
  const row = await loadSpendFromDb(month);
  if (row) {
    memorySpendUsd = Number(row.estimated_usd) || 0;
  }
  return memorySpendUsd;
}

export async function getOpenAiBudgetSnapshot(): Promise<OpenAiBudgetSnapshot> {
  const month = monthKey();
  const monthlyLimitUsd = budgetLimitUsd();
  const enabled = isBudgetEnabled();
  const spentUsd = enabled ? await getSpentUsd(month) : 0;
  const remainingUsd = enabled ? Math.max(0, monthlyLimitUsd - spentUsd) : 0;
  const percentUsed = enabled && monthlyLimitUsd > 0
    ? Math.min(100, Math.round((spentUsd / monthlyLimitUsd) * 100))
    : 0;

  return {
    enabled,
    monthlyLimitUsd,
    spentUsd,
    remainingUsd,
    percentUsed,
    exhausted: enabled && spentUsd >= monthlyLimitUsd,
    warning: enabled && percentUsed >= 80 && spentUsd < monthlyLimitUsd,
    resetsAt: nextMonthIso(),
  };
}

export function createOpenAiBudgetExceededError(
  snapshot: OpenAiBudgetSnapshot,
): Error & { status: number; code: string; userMessage: string; budget: OpenAiBudgetSnapshot } {
  const limit = snapshot.monthlyLimitUsd.toFixed(2);
  const err = new Error(
    `Monthly OpenAI budget exhausted ($${limit})`,
  ) as Error & {
    status: number;
    code: string;
    userMessage: string;
    budget: OpenAiBudgetSnapshot;
  };
  err.status = 403;
  err.code = 'openai_budget_exceeded';
  err.budget = snapshot;
  err.userMessage =
    `LoreBook hit the $${limit}/month AI budget for this app. ` +
    'Chat and extraction are paused until the budget resets or you add credits at platform.openai.com. ' +
    'Your messages and lore are still saved — only new AI replies are blocked.';
  return err;
}

export async function assertOpenAiBudgetAvailable(): Promise<void> {
  if (!isBudgetEnabled()) return;
  const snapshot = await getOpenAiBudgetSnapshot();
  if (snapshot.exhausted) {
    throw createOpenAiBudgetExceededError(snapshot);
  }
}

export function isOpenAiBudgetExceededError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  return err?.code === 'openai_budget_exceeded' || /monthly openai budget/i.test(err?.message ?? '');
}

export async function recordOpenAiTokenUsage(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  if (!isBudgetEnabled()) return;
  const month = monthKey();
  const deltaUsd = estimateUsdFromTokens(params.model, params.inputTokens, params.outputTokens);
  if (deltaUsd <= 0 && params.inputTokens === 0 && params.outputTokens === 0) return;

  memoryMonth = month;
  memorySpendUsd += deltaUsd;

  if (tableAvailable === false) return;

  try {
    const { data: existing } = await supabaseAdmin
      .from('platform_openai_spend')
      .select('estimated_usd, input_tokens, output_tokens, call_count')
      .eq('month', month)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('platform_openai_spend')
        .update({
          estimated_usd: Number(existing.estimated_usd) + deltaUsd,
          input_tokens: Number(existing.input_tokens) + params.inputTokens,
          output_tokens: Number(existing.output_tokens) + params.outputTokens,
          call_count: Number(existing.call_count) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('month', month);
    } else {
      await supabaseAdmin.from('platform_openai_spend').insert({
        month,
        estimated_usd: deltaUsd,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        call_count: 1,
      });
    }
    tableAvailable = true;
  } catch (err) {
    logger.warn({ err, deltaUsd }, 'Failed to persist platform OpenAI spend (in-memory still tracked)');
  }
}

/** Reset in-memory spend tracking (tests only). */
export function resetOpenAiBudgetForTests(): void {
  memorySpendUsd = 0;
  memoryMonth = monthKey();
  tableAvailable = null;
}
