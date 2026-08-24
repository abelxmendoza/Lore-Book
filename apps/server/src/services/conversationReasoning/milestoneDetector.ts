/**
 * Conversation Milestones — detects moments where the USER marks the
 * conversation-with-the-app itself as meaningful ("you finally remembered,"
 * "this felt alive"). Distinct from narrative/milestoneClassifier.ts's
 * life-event milestones, which track the user's life, never the
 * conversation-with-the-app experience.
 *
 * Deterministic, no LLM. Higher precision bar than continuityAlive's
 * MIN_COMPOSITE=0.32 — false positives here silently pollute persisted
 * session metadata with no user-facing correction path, so precision is
 * prioritized over recall.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ConversationMilestoneRecord, ConversationMilestoneType } from './milestoneTypes';

export const MILESTONE_MIN_COMPOSITE = 0.5;

const MAX_PERSISTED_MILESTONES = 20;

const MEMORY_RECOGNITION_RE =
  /\b(you (?:finally|actually) (?:remembered|got it)|you remembered!?|i can'?t believe you (?:remembered|kept that)|you (?:actually )?knew (?:that|this))\b/i;

const FIRST_TIME_ALIVE_RE =
  /\b(first time (?:lorebook|this|you) (?:felt|seemed|has felt) (?:alive|real)|(?:this|that) (?:felt|feels) (?:alive|real|like (?:you|someone) (?:was|were) (?:actually )?(?:listening|there)))\b/i;

const EXCEEDED_EXPECTATION_RE =
  /\b(exactly what i (?:hoped|wanted|needed)|(?:that|this) is (?:exactly|precisely) (?:what|how) i (?:hoped|imagined)|better than i (?:expected|thought|imagined))\b/i;

const APP_GRATITUDE_RE =
  /\b(thank you for (?:remembering|listening|being here|holding (?:this|that)|keeping track)|i(?:'m| am) (?:so )?grateful (?:you|for you)|means? (?:a lot|so much) that you)\b/i;

/** Explicit 2nd-person/app-referent — disambiguates a life-directed statement ("exactly what I hoped for my birthday") from one about the app itself. */
const APP_REFERENT_RE = /\b(you|lorebook|this (?:conversation|chat|app))\b/i;

export function detectConversationMilestone(
  message: string,
): { type: ConversationMilestoneType; score: number; triggerPhrase: string } | null {
  const text = message.trim();
  if (!text) return null;

  const appReferent = APP_REFERENT_RE.test(text);

  const candidates: Array<{
    type: ConversationMilestoneType;
    re: RegExp;
    base: number;
    requiresAppReferent: boolean;
  }> = [
    { type: 'first_time_felt_alive', re: FIRST_TIME_ALIVE_RE, base: 0.55, requiresAppReferent: false },
    { type: 'memory_recognition', re: MEMORY_RECOGNITION_RE, base: 0.5, requiresAppReferent: false },
    { type: 'app_gratitude', re: APP_GRATITUDE_RE, base: 0.4, requiresAppReferent: true },
    { type: 'exceeded_expectation', re: EXCEEDED_EXPECTATION_RE, base: 0.4, requiresAppReferent: true },
  ];

  for (const candidate of candidates) {
    const match = text.match(candidate.re);
    if (!match) continue;
    const score = candidate.requiresAppReferent
      ? candidate.base + (appReferent ? 0.25 : 0)
      : candidate.base + 0.25;
    if (score >= MILESTONE_MIN_COMPOSITE) {
      return { type: candidate.type, score: Math.min(1, score), triggerPhrase: match[0] };
    }
  }
  return null;
}

export async function loadConversationMilestones(sessionId: string): Promise<ConversationMilestoneRecord[]> {
  try {
    const { data } = await supabaseAdmin
      .from('conversation_sessions')
      .select('metadata')
      .eq('id', sessionId)
      .maybeSingle();
    const metadata = (data as { metadata?: Record<string, unknown> } | null)?.metadata;
    return (metadata?.conversationMilestones as ConversationMilestoneRecord[] | undefined) ?? [];
  } catch (e) {
    logger.debug({ e, sessionId }, 'MilestoneDetector: load failed');
    return [];
  }
}

export async function appendConversationMilestone(
  sessionId: string,
  record: ConversationMilestoneRecord,
): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('conversation_sessions')
      .select('metadata')
      .eq('id', sessionId)
      .maybeSingle();
    const metadata = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const existing = (metadata.conversationMilestones as ConversationMilestoneRecord[] | undefined) ?? [];
    const next = [...existing, record].slice(-MAX_PERSISTED_MILESTONES);
    await supabaseAdmin
      .from('conversation_sessions')
      .update({ metadata: { ...metadata, conversationMilestones: next } })
      .eq('id', sessionId);
  } catch (e) {
    logger.debug({ e, sessionId }, 'MilestoneDetector: persist failed');
  }
}
