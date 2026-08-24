/**
 * Response Planner — a lightweight, deterministic plan built from signals
 * already computed earlier in the pipeline (cognitive strategy, audited
 * working memory, conversation goal, scope/correction state) that steers
 * composition. Never LLM-generated: every input is already fully resolved
 * in-memory by the time this runs, so a rule-based selector costs zero
 * extra latency and zero extra model spend — consistent with every other
 * planning layer in this pipeline (cognitivePlanner, evidenceContract,
 * epistemicCalibration, responseScopePlanner are all pure/deterministic).
 *
 * Exported type is `AnswerPlan`, not `ResponsePlan` — contextualLore's
 * loreResponsePlanner.ts already exports a `LoreResponsePlan` for a
 * different, write-side concern (acknowledging new facts the user just
 * told LoreBook). See conversationReasoning/index.ts for how the five
 * adjacent "plan" concepts in this codebase divide responsibility.
 */

import type { CognitivePlan } from '../cognitivePlanner/cognitivePlanner';
import type { WorkingMemoryAssembly, WorkingMemoryItem } from '../chat/workingMemoryAssembler';
import type { ResponseScopePlan } from '../responseScope/responseScopeTypes';
import { normalizeNameKey } from '../../utils/nameNormalization';
import type { ConversationGoalState } from './goalTrackerTypes';

export type AnswerPlan = {
  primaryFocus: string;
  secondaryReferences: string[];
  avoid: string[];
  /**
   * Reflection Generator (Blueprint 21 Phase 3): set only when the question
   * is reflection-shaped AND a specific entity/theme recurs across the
   * audited evidence — names the recurring items and instructs the model to
   * synthesize a pattern grounded only in them, never invented.
   */
  synthesisNote?: string;
  /** Short, for the Observatory trace only — never shown to the user as chain-of-thought. */
  rationale: string;
};

const SECTION_KEYS = [
  'episodes',
  'events',
  'projects',
  'goals',
  'skills',
  'communities',
  'relationships',
  'preferences',
  'timeline',
] as const;

function topItems(assembly: WorkingMemoryAssembly | null, limit: number): WorkingMemoryItem[] {
  if (!assembly) return [];
  const all: WorkingMemoryItem[] = [];
  for (const key of SECTION_KEYS) all.push(...assembly[key]);
  return all.sort((a, b) => b.score - a.score).slice(0, limit);
}

const RECURRENCE_STOPWORDS = new Set([
  'with', 'and', 'the', 'about', 'during', 'after', 'before', 'from', 'into',
  'your', 'their', 'when', 'what', 'that', 'this', 'who', 'how', 'for', 'was',
  'were', 'are', 'been', 'have', 'has', 'had', 'trip', 'visit',
]);

const MIN_RECURRING_ITEMS = 2;
const MAX_SYNTHESIS_SUPPORTING_ITEMS = 4;

function sumScore(items: WorkingMemoryItem[]): number {
  return items.reduce((sum, item) => sum + item.score, 0);
}

/**
 * Finds a token (usually a name) that recurs across ≥2 items spanning ≥2
 * distinct dates/types — not just duplicate near-identical hits from one
 * retrieval cluster. Runs over the FULL audited assembly, not topItems'
 * top-4 slice, since recurrence needs more visibility than primary-focus
 * selection does.
 */
function detectRecurringEntity(
  assembly: WorkingMemoryAssembly | null,
): { token: string; items: WorkingMemoryItem[] } | null {
  if (!assembly) return null;
  const index = new Map<string, WorkingMemoryItem[]>();
  for (const key of SECTION_KEYS) {
    for (const item of assembly[key]) {
      const tokens = new Set(
        normalizeNameKey(item.title)
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3 && !RECURRENCE_STOPWORDS.has(t)),
      );
      for (const token of tokens) {
        const list = index.get(token) ?? [];
        list.push(item);
        index.set(token, list);
      }
    }
  }

  let best: { token: string; items: WorkingMemoryItem[] } | null = null;
  for (const [token, items] of index) {
    if (items.length < MIN_RECURRING_ITEMS) continue;
    if (new Set(items.map((i) => i.date ?? i.type)).size < 2) continue;
    if (
      !best ||
      items.length > best.items.length ||
      (items.length === best.items.length && sumScore(items) > sumScore(best.items))
    ) {
      best = { token, items };
    }
  }
  if (!best) return null;
  return {
    token: best.token,
    items: [...best.items].sort((a, b) => b.score - a.score).slice(0, MAX_SYNTHESIS_SUPPORTING_ITEMS),
  };
}

export function planAnswer(input: {
  goal: ConversationGoalState | null;
  cognitivePlan: CognitivePlan;
  auditedAssembly: WorkingMemoryAssembly | null;
  scopePlan: ResponseScopePlan;
  retryState?: { originalMessageText?: string } | null;
}): AnswerPlan | null {
  const { goal, cognitivePlan, auditedAssembly, scopePlan, retryState } = input;
  const ranked = topItems(auditedAssembly, 4);
  if (ranked.length === 0 && !scopePlan.isCorrection) return null;

  const [primary, ...rest] = ranked;
  const primaryFocus = primary
    ? `${primary.title} (${primary.type}) — matches the ${cognitivePlan.expectedAnswer} the question calls for`
    : 'Answer directly from what LoreBook already knows; the retrieved evidence set was empty';

  const secondaryReferences = rest.slice(0, 3).map((item) => `${item.title} (${item.type})`);

  const avoid: string[] = [...scopePlan.blockedDomains];
  if (scopePlan.isCorrection && scopePlan.correctionNames.length > 0) {
    avoid.push(`resurfacing corrected-away facts about: ${scopePlan.correctionNames.join(', ')}`);
  }
  if (retryState?.originalMessageText) {
    avoid.push('repeating the same failed framing as the previous attempt');
  }
  if (goal && goal.goal !== 'general') {
    avoid.push(`drifting away from the conversation's established purpose (${goal.goal})`);
  }

  let synthesisNote: string | undefined;
  if (cognitivePlan.expectedAnswer === 'reflection') {
    const recurrence = detectRecurringEntity(auditedAssembly);
    if (recurrence) {
      const itemList = recurrence.items
        .map((item) => `${item.title}${item.date ? ` — ${item.date}` : ''}`)
        .join('; ');
      synthesisNote = `"${recurrence.token}" recurs across ${recurrence.items.length} retrieved items (${itemList}). Synthesize what this recurrence reveals — a role, a chapter, a theme — grounded only in these specific items. Do not invent meaning beyond what they support, and do not simply restate the facts.`;
    }
  }

  const rationale = `strategy=${cognitivePlan.strategy} goal=${goal?.goal ?? 'none'} topItems=${ranked.length}`;

  return { primaryFocus, secondaryReferences, avoid, synthesisNote, rationale };
}

/** Static, invariant response-ordering instruction (Blueprint 21 Phase 3 — Human-Like Response Ordering). Not a per-turn computed signal, so it isn't a plan field. */
const RESPONSE_ORDER_INSTRUCTION =
  'Order: (1) direct answer first (2) brief reasoning behind it (3) supporting memory only if it adds something new (4) reflection/pattern if one applies (5) at most one follow-up question, last. Never open with a bulleted dump of retrieved facts.';

export function formatAnswerPlanBlock(plan: AnswerPlan): string {
  const lines = [`Answer: ${plan.primaryFocus}`];
  if (plan.secondaryReferences.length > 0) {
    lines.push(`May reference: ${plan.secondaryReferences.join('; ')}`);
  }
  if (plan.avoid.length > 0) {
    lines.push(`Do not bring up: ${plan.avoid.join('; ')}`);
  }
  if (plan.synthesisNote) {
    lines.push(`Synthesis: ${plan.synthesisNote}`);
  }
  lines.push(RESPONSE_ORDER_INSTRUCTION);
  return lines.join('\n');
}
