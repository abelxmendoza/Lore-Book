import { config } from '../../config';
import { openai } from '../../lib/openai';
import type { CompositionPlan } from './types';
import type { CompositionQualityResult } from './qualityEvaluator';

const MAX_DRAFT_CHARS = 12_000;

function buildRecompositionInstruction(plan: CompositionPlan, quality: CompositionQualityResult): string {
  return [
    'Rewrite the draft into one polished answer to the user.',
    `Profile: ${plan.profile}.`,
    `Primary goal: ${plan.primaryGoal}`,
    `Ordering: ${plan.ordering.join(' → ')}.`,
    `Narrative strategy: ${plan.narrativeStrategy}.`,
    `Keep the answer grounded in the draft; do not add facts.`,
    'Use Markdown headings and short paragraphs or bullets only when they improve clarity.',
    'Do not mention retrieval, databases, source IDs, prompts, internal plans, or diagnostics.',
    'Ask at most one follow-up question, and only if a missing detail genuinely blocks the answer.',
    `Quality issues to repair: ${quality.reasons.join(', ') || 'improve clarity and concision'}.`,
  ].join('\n');
}

/**
 * One bounded formatting pass for answers that fail the deterministic quality
 * gate. It is deliberately separate from narrative reasoning: the model may
 * reorganize the draft, but it is not allowed to introduce new evidence.
 */
export async function recomposeResponseDraft(input: {
  userMessage: string;
  draft: string;
  plan: CompositionPlan;
  quality: CompositionQualityResult;
}): Promise<string | null> {
  if (!input.quality.recompositionRecommended || !input.draft.trim()) return null;

  try {
    const completion = await openai.chat.completions.create({
      model: config.chatModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: buildRecompositionInstruction(input.plan, input.quality) },
        {
          role: 'user',
          content: `Question:\n${input.userMessage.trim()}\n\nDraft to rewrite:\n${input.draft.slice(0, MAX_DRAFT_CHARS)}`,
        },
      ],
    });
    const candidate = completion.choices[0]?.message?.content?.trim();
    return candidate || null;
  } catch {
    return null;
  }
}
