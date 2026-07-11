/**
 * LoreBook System Cognition — product self-model for chat.
 *
 * Grounds meta/product questions ("what is LoreBook?", "how do you remember?")
 * in verified system_knowledge facts — never LLM guesses.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { mentionsLoreBookProduct } from './metaConversationClassifier';
import { detectTestingMode } from './testingModeDetector';
import {
  formatUserProductLoreBlock,
  loadUserProductObservations,
} from './productConversationService';
import {
  BIOGRAPHY_RE,
  CHARACTER_LIST_RE,
  FAMILY_RECALL_RE,
  FAMILY_KIN_TERM_RE,
} from './recallIntentPatterns';

export type SelfModelConcept =
  | 'product_identity'
  | 'creator'
  | 'inception'
  | 'capabilities'
  | 'priority'
  | 'platform_status'
  | 'memory_lifecycle'
  | 'chat_flow'
  | 'surfaces'
  | 'limitations'
  | 'retrieval'
  | 'user_is_narrator'
  | 'extraction_pipeline';

export type MetaQueryStrength = 'strong' | 'soft';

export interface SelfModelFact {
  concept: SelfModelConcept;
  description: string;
}

export interface MetaQueryMatch {
  concepts: SelfModelConcept[];
  strength: MetaQueryStrength;
}

export type MetaProductGateResult = {
  shortCircuit: { content: string; concepts: SelfModelConcept[] } | null;
  promptBlock: string | null;
};

const MAX_FACTS_IN_BLOCK = 8;
const MAX_FACT_CHARS = 150;

/** User-facing facts — mirror system_knowledge seed; used when DB is empty. */
export const FALLBACK_SELF_MODEL: Record<SelfModelConcept, SelfModelFact> = {
  product_identity: {
    concept: 'product_identity',
    description:
      'LoreBook is a personal memory operating system — not a generic chatbot. It accumulates people, moments, and patterns from your conversations into a persistent biographical record.',
  },
  creator: {
    concept: 'creator',
    description:
      'LoreBook was created by Abel Mendoza, founder of LoreBook. He built it so people can keep a living record of their story — the people, places, and meaning that make a life.',
  },
  inception: {
    concept: 'inception',
    description:
      'LoreBook began as a way to stop losing life’s continuity across chats and apps — to remember who matters, what happened, and how your story grows over time.',
  },
  capabilities: {
    concept: 'capabilities',
    description:
      'LoreBook can chat, remember, and organize your lore: characters, places, relationships, timeline events, groups, skills, and foundation recall from structured knowledge before raw journal search.',
  },
  priority: {
    concept: 'priority',
    description:
      'LoreBook’s main focus is your lore — your story, personality, identities, and the people and places in your life. Product self-talk stays short; you are the protagonist.',
  },
  platform_status: {
    concept: 'platform_status',
    description:
      'When asked if LoreBook is working, answer from the latest admin core health snapshot when available; otherwise say you are online and ready to keep their story.',
  },
  memory_lifecycle: {
    concept: 'memory_lifecycle',
    description:
      'When you share lived experience, LoreBook extracts candidates in the background. Some memories await your confirmation in Memory Review before becoming durable.',
  },
  chat_flow: {
    concept: 'chat_flow',
    description:
      'Each message is interpreted (entities, events, relationships), may enqueue background ingestion, and future replies retrieve a bounded working-memory packet — not your entire history at once.',
  },
  surfaces: {
    concept: 'surfaces',
    description:
      'Chat is the input surface. Characters, Locations, Timeline, Events, and Memory Review are where stored data lives — check there to verify what was captured.',
  },
  limitations: {
    concept: 'limitations',
    description:
      'Retrieval is reconstruction with a token budget, not perfect omniscience. LoreBook answers from what was loaded for this turn; say honestly when something is not in context.',
  },
  retrieval: {
    concept: 'retrieval',
    description:
      'Recall checks the current thread first, then structured foundation data (characters, family, biography), then semantic search over journal entries.',
  },
  user_is_narrator: {
    concept: 'user_is_narrator',
    description:
      'You are the main character and narrator of your story. LoreBook tracks people in your life — not you as a character card in Characters.',
  },
  extraction_pipeline: {
    concept: 'extraction_pipeline',
    description:
      'People, places, and groups you mention are extracted automatically — you do not need to create cards manually. Extraction runs after chat, not through the assistant reply.',
  },
};

/** All product-facing concepts — keep in sync with system_knowledge product seed migration. */
export const PRODUCT_SELF_MODEL_CONCEPTS = Object.keys(FALLBACK_SELF_MODEL) as SelfModelConcept[];

const META_QUERY_RULES: Array<{
  concepts: SelfModelConcept[];
  pattern: RegExp;
  strength: MetaQueryStrength;
}> = [
  {
    concepts: ['creator', 'inception', 'product_identity'],
    pattern:
      /\b(who (created|built|made|founded) (you|lore ?book)|who('s| is) (your|the) (creator|founder|maker)|who (is|was) abel( mendoza)?)\b/i,
    strength: 'strong',
  },
  {
    concepts: ['inception', 'creator', 'priority'],
    pattern:
      /\b(why (was|were) (you|lore ?book) (created|built|made)|what('s| is) (your|lore ?book('s)?) (origin|inception|story)|how did (lore ?book|you) (start|begin))\b/i,
    strength: 'strong',
  },
  {
    concepts: ['capabilities', 'priority', 'surfaces'],
    pattern:
      /\b(what can (you|lore ?book) do|what (are|is) (your|lore ?book('s)?) (capabilities|features|functions)|what (are you|is lore ?book) (able|good) (at|for))\b/i,
    strength: 'strong',
  },
  {
    concepts: ['platform_status', 'product_identity'],
    pattern:
      /\b(are you (working|ok|okay|healthy|online|up)|is (lore ?book|the app|everything) (working|ok|okay|healthy|up|down)|how (are you|is lore ?book) (doing|feeling)|system (status|health))\b/i,
    strength: 'strong',
  },
  {
    concepts: ['priority', 'user_is_narrator', 'product_identity'],
    pattern:
      /\b(what (is|are) (your|lore ?book('s)?) (focus|priority|main job)|what (should|do) you (care|focus) (about|on)|are you (about|for) (me|my story))\b/i,
    strength: 'strong',
  },
  {
    concepts: ['product_identity', 'priority'],
    pattern: /\b(what is lore ?book|what('s| is) lore ?book|tell me about lore ?book)\b/i,
    strength: 'strong',
  },
  {
    concepts: ['product_identity', 'memory_lifecycle', 'surfaces', 'capabilities'],
    pattern: /\b(how does (lore ?book|this( app)?|the app) work|how do you work as (an? )?(app|system))\b/i,
    strength: 'strong',
  },
  {
    concepts: ['memory_lifecycle', 'extraction_pipeline'],
    pattern:
      /\b(how do you remember|how does memory work|what (gets|is) saved|what do you extract|what happens when i (chat|talk|share|tell you))\b/i,
    strength: 'strong',
  },
  {
    concepts: ['surfaces'],
    pattern:
      /\b(where (can i|do i) (see|find|view) (my )?(memories|characters|timeline|events|saved data)|where is (my )?(data|record) stored)\b/i,
    strength: 'strong',
  },
  {
    concepts: ['retrieval', 'limitations'],
    pattern: /\b(how do you (recall|retrieve)|how does recall work|why (can'?t|don'?t) you remember everything)\b/i,
    strength: 'soft',
  },
  {
    concepts: ['user_is_narrator'],
    pattern: /\b(am i (in|a) (my )?characters|did you add me as a character|am i a character)\b/i,
    strength: 'soft',
  },
  {
    concepts: ['limitations', 'extraction_pipeline', 'capabilities'],
    pattern: /\b(what are your limits|what can'?t you do|do you have access to everything)\b/i,
    strength: 'soft',
  },
  {
    concepts: ['surfaces', 'extraction_pipeline'],
    pattern:
      /\b(what did i (say|tell you) about (lore ?book|the app)|what have i said about (lore ?book|the app)|my feedback on (lore ?book|the app))\b/i,
    strength: 'soft',
  },
  {
    concepts: ['surfaces', 'limitations'],
    pattern: /\b(composer|entity chip|character book|memory review).*(broken|bug|issue|not working|confus)/i,
    strength: 'soft',
  },
];

const USER_RECALL_BLOCKERS: RegExp[] = [
  BIOGRAPHY_RE,
  CHARACTER_LIST_RE,
  FAMILY_RECALL_RE,
  FAMILY_KIN_TERM_RE,
  /\bwhat do you know about (me|my)\b/i,
  /\bwhat have you (learned|stored) about (me|my)\b/i,
  /\bwhat do you remember about (me|my)\b/i,
  /\brecall (everything|all).*(about )?me\b/i,
  /\b(will you|can you) remember this (conversation|chat|thread)\b/i,
];

function isUserRecallQuery(message: string): boolean {
  return USER_RECALL_BLOCKERS.some((p) => p.test(message.trim()));
}

export function detectMetaQuery(message: string): MetaQueryMatch | null {
  const text = message.trim();
  if (!text || isUserRecallQuery(text)) return null;

  const testingMode = detectTestingMode(text);
  if (testingMode === 'memory_formation' || testingMode === 'recall_check') return null;

  for (const rule of META_QUERY_RULES) {
    if (!rule.pattern.test(text)) continue;
    return { concepts: rule.concepts, strength: rule.strength };
  }

  // Product discussion without a strict FAQ shape — still load self-model context.
  if (mentionsLoreBookProduct(text)) {
    return {
      concepts: ['product_identity', 'extraction_pipeline'],
      strength: 'soft',
    };
  }

  return null;
}

function truncateDescription(text: string): string {
  if (text.length <= MAX_FACT_CHARS) return text;
  return `${text.substring(0, MAX_FACT_CHARS - 1)}…`;
}

export async function loadSelfModel(concepts?: SelfModelConcept[]): Promise<SelfModelFact[]> {
  const merged = new Map<SelfModelConcept, SelfModelFact>();
  for (const [key, fact] of Object.entries(FALLBACK_SELF_MODEL) as [SelfModelConcept, SelfModelFact][]) {
    merged.set(key, fact);
  }

  try {
    let query = supabaseAdmin.from('system_knowledge').select('concept, description');
    if (concepts?.length) {
      query = query.in('concept', concepts);
    }
    const { data, error } = await query.limit(50);
    if (error) {
      logger.debug({ err: error }, 'lorebookSelfModelService.loadSelfModel failed');
    } else {
      for (const row of data ?? []) {
        const concept = String(row.concept ?? '') as SelfModelConcept;
        if (!concept || !(concept in FALLBACK_SELF_MODEL)) continue;
        const description = String(row.description ?? '').trim();
        if (description) {
          merged.set(concept, { concept, description: truncateDescription(description) });
        }
      }
    }
  } catch (err) {
    logger.debug({ err }, 'lorebookSelfModelService.loadSelfModel threw');
  }

  const ordered = concepts?.length
    ? concepts.map((c) => merged.get(c)).filter((f): f is SelfModelFact => !!f)
    : [...merged.values()];

  return ordered.slice(0, MAX_FACTS_IN_BLOCK);
}

export function formatSelfModelBlock(facts: SelfModelFact[]): string | null {
  if (facts.length === 0) return null;
  const lines = facts.map((f) => `• ${truncateDescription(f.description)}`);
  return [
    'Use these verified facts for product/system questions. Do not invent capabilities beyond this list.',
    ...lines,
  ].join('\n');
}

function formatMetaProductAnswer(facts: SelfModelFact[], message: string): string {
  const lines = facts.map((f) => `• ${truncateDescription(f.description)}`);
  let opener = 'Here is how LoreBook works:';
  if (/\bwho (created|built|made|founded)\b|\b(creator|founder)\b/i.test(message)) {
    opener = 'LoreBook was created by Abel Mendoza.';
  } else if (/\bwhat can (you|lore ?book) do\b|\bcapabilities\b|\bfeatures\b/i.test(message)) {
    opener = "Here's what LoreBook can do — with your story at the center:";
  } else if (/\bare you (working|ok|okay|healthy|online)\b|\bis (lore ?book|the app).*(working|ok|healthy)\b|\bsystem (status|health)\b/i.test(message)) {
    opener = "Here's my current status:";
  } else if (/\bwhat is\b/i.test(message)) {
    opener = 'LoreBook is a continuity-aware autobiographical memory system.';
  }

  return [
    opener,
    '',
    ...lines,
    '',
    'Ask me anything about your story — people, places, relationships, or what happened recently. Characters, Timeline, and Memory Review show what has been captured.',
  ].join('\n');
}

async function enrichFactsWithLiveStatus(facts: SelfModelFact[]): Promise<SelfModelFact[]> {
  if (!facts.some((f) => f.concept === 'platform_status')) return facts;
  try {
    const { getCoreSuiteSnapshot } = await import('../diagnostics/coreSuiteSnapshot');
    const snap = getCoreSuiteSnapshot();
    if (!snap) return facts;
    const statusLine =
      snap.status === 'PASS'
        ? `Core health checks last passed at ${new Date(snap.completedAt).toLocaleString()} (${snap.summary.PASS} pass / ${snap.summary.FAIL} fail).`
        : snap.status === 'FAIL'
          ? `Core health checks last finished with failures at ${new Date(snap.completedAt).toLocaleString()} (${snap.summary.FAIL} fail). Admins can re-run System Health.`
          : `Core health checks last finished as ${snap.status} at ${new Date(snap.completedAt).toLocaleString()}.`;
    return facts.map((f) =>
      f.concept === 'platform_status' ? { ...f, description: statusLine } : f
    );
  } catch {
    return facts;
  }
}

async function buildProductContextBlock(
  message: string,
  facts: SelfModelFact[],
  userId?: string
): Promise<string | null> {
  const parts: string[] = [];
  const systemBlock = formatSelfModelBlock(facts);
  if (systemBlock) parts.push(systemBlock);

  if (userId) {
    const observations = await loadUserProductObservations(userId);
    const userBlock = formatUserProductLoreBlock(observations);
    if (userBlock) parts.push(userBlock);
  }

  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

export async function resolveMetaProductContext(
  message: string,
  userId?: string
): Promise<MetaProductGateResult> {
  const match = detectMetaQuery(message);
  if (!match) return { shortCircuit: null, promptBlock: null };

  const facts = await enrichFactsWithLiveStatus(await loadSelfModel(match.concepts));
  if (facts.length === 0) return { shortCircuit: null, promptBlock: null };

  const promptBlock = await buildProductContextBlock(message, facts, userId);

  if (match.strength === 'strong') {
    const userObs = userId ? await loadUserProductObservations(userId) : [];
    const userBlock = formatUserProductLoreBlock(userObs);
    const content = userBlock
      ? [formatMetaProductAnswer(facts, message), '', userBlock].join('\n')
      : formatMetaProductAnswer(facts, message);

    return {
      shortCircuit: {
        content,
        concepts: match.concepts,
      },
      promptBlock: null,
    };
  }

  return {
    shortCircuit: null,
    promptBlock,
  };
}

export async function buildSelfModelPromptBlock(
  message: string,
  userId?: string
): Promise<string | null> {
  const { promptBlock } = await resolveMetaProductContext(message, userId);
  return promptBlock;
}
