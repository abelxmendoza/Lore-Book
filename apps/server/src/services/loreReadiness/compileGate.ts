import type { LoreReadinessEvaluateRequest, LoreReadinessEvaluation } from './types';
import { loreReadinessService } from './loreReadinessService';

export type CompileGateMode = 'ready' | 'soft_blocked' | 'hard_blocked';

export type CompileGateResult = {
  allowed: boolean;
  mode: CompileGateMode;
  canForce: boolean;
  evaluation: LoreReadinessEvaluation;
  message: string;
  warning?: string;
};

const SOFT_GATE_PROGRESS = 0.45;

export async function checkCompileGate(
  userId: string,
  request: LoreReadinessEvaluateRequest,
  options?: { force?: boolean }
): Promise<CompileGateResult> {
  const evaluation = await loreReadinessService.evaluate(userId, request);
  const force = options?.force === true;

  if (evaluation.canGenerate) {
    return {
      allowed: true,
      mode: 'ready',
      canForce: false,
      evaluation,
      message: 'Ready to compile',
    };
  }

  if (evaluation.progress >= SOFT_GATE_PROGRESS) {
    if (force) {
      return {
        allowed: true,
        mode: 'soft_blocked',
        canForce: true,
        evaluation,
        message: 'Compiling with partial knowledge',
        warning: `This book is ${Math.round(evaluation.progress * 100)}% ready — output may feel thin. ${evaluation.suggestions[0] ?? ''}`.trim(),
      };
    }
    return {
      allowed: false,
      mode: 'soft_blocked',
      canForce: true,
      evaluation,
      message: `Not fully ready (${Math.round(evaluation.progress * 100)}%). Pass force=true to compile a thinner book.`,
    };
  }

  if (force) {
    return {
      allowed: true,
      mode: 'hard_blocked',
      canForce: true,
      evaluation,
      message: 'Force-compiling with insufficient knowledge',
      warning: evaluation.suggestions[0] ?? 'Add more stories before compiling for best results.',
    };
  }

  return {
    allowed: false,
    mode: 'hard_blocked',
    canForce: true,
    evaluation,
    message: evaluation.suggestions[0] ?? 'Not enough knowledge to compile this book yet.',
  };
}

export function evaluationToQuestPrompts(
  summary: Awaited<ReturnType<typeof loreReadinessService.getSummary>>
): Array<{ id: string; topicId: string; label: string; prompt: string; progress: number }> {
  const building = summary.topics
    .filter((t) => !t.canGenerate && t.progress >= 0.2)
    .sort((a, b) => b.progress - a.progress || a.atomsNeeded - b.atomsNeeded);

  const quests: Array<{ id: string; topicId: string; label: string; prompt: string; progress: number }> = [];

  for (const topic of building) {
    const gap = topic.gaps?.find((g) => g.severity === 'blocker') ?? topic.gaps?.[0];
    if (!gap?.suggestion) continue;
    quests.push({
      id: `${topic.topic.id}-${gap.id}`,
      topicId: topic.topic.id,
      label: topic.topic.label,
      prompt: gapPromptToChatPrompt(gap.suggestion, topic.topic.label),
      progress: topic.progress,
    });
    if (quests.length >= 3) break;
  }

  if (quests.length === 0) {
    const nearest = summary.topics
      .filter((t) => !t.canGenerate)
      .sort((a, b) => b.progress - a.progress)[0];
    if (nearest) {
      quests.push({
        id: `${nearest.topic.id}-default`,
        topicId: nearest.topic.id,
        label: nearest.topic.label,
        prompt: `Tell me more about ${nearest.topic.label.toLowerCase()} — a specific moment that shaped you.`,
        progress: nearest.progress,
      });
    }
  }

  return quests;
}

function gapPromptToChatPrompt(suggestion: string, topicLabel: string): string {
  if (suggestion.length > 20 && suggestion.length < 160) {
    return suggestion.endsWith('.') ? `${suggestion.slice(0, -1)} — can you walk me through one?` : suggestion;
  }
  return `I'd like to explore my ${topicLabel.toLowerCase()} — ask me about a moment that mattered.`;
}

export async function getQuestPrompts(userId: string) {
  const summary = await loreReadinessService.getSummary(userId);
  return evaluationToQuestPrompts(summary);
}
