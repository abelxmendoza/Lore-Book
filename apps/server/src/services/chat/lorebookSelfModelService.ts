/**
 * LoreBook System Cognition — product self-model for chat.
 *
 * Grounds meta/product questions ("what is LoreBook?", "how do you remember?")
 * in verified system_knowledge facts — never LLM guesses.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  BIOGRAPHY_RE,
  CHARACTER_LIST_RE,
  FAMILY_RECALL_RE,
  FAMILY_KIN_TERM_RE,
} from './recallIntentPatterns';

export type SelfModelConcept =
  | 'product_identity'
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

const META_QUERY_RULES: Array<{
  concepts: SelfModelConcept[];
  pattern: RegExp;
  strength: MetaQueryStrength;
}> = [
  {
    concepts: ['product_identity'],
    pattern: /\b(what is lore ?book|what('s| is) lore ?book|tell me about lore ?book)\b/i,
    strength: 'strong',
  },
  {
    concepts: ['product_identity', 'memory_lifecycle', 'surfaces'],
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
    concepts: ['limitations', 'extraction_pipeline'],
    pattern: /\b(what are your limits|what can'?t you do|do you have access to everything)\b/i,
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
];

function isUserRecallQuery(message: string): boolean {
  return USER_RECALL_BLOCKERS.some((p) => p.test(message.trim()));
}

export function detectMetaQuery(message: string): MetaQueryMatch | null {
  const text = message.trim();
  if (!text || isUserRecallQuery(text)) return null;

  for (const rule of META_QUERY_RULES) {
    if (!rule.pattern.test(text)) continue;
    return { concepts: rule.concepts, strength: rule.strength };
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
  const opener = /\bwhat is\b/i.test(message)
    ? 'LoreBook is a continuity-aware autobiographical memory system.'
    : 'Here is how LoreBook works:';

  return [
    opener,
    '',
    ...lines,
    '',
    'Ask me anything about your story — or check Characters, Timeline, and Memory Review to inspect what has been captured.',
  ].join('\n');
}

export async function resolveMetaProductContext(message: string): Promise<MetaProductGateResult> {
  const match = detectMetaQuery(message);
  if (!match) return { shortCircuit: null, promptBlock: null };

  const facts = await loadSelfModel(match.concepts);
  if (facts.length === 0) return { shortCircuit: null, promptBlock: null };

  if (match.strength === 'strong') {
    return {
      shortCircuit: {
        content: formatMetaProductAnswer(facts, message),
        concepts: match.concepts,
      },
      promptBlock: null,
    };
  }

  return {
    shortCircuit: null,
    promptBlock: formatSelfModelBlock(facts),
  };
}

export async function buildSelfModelPromptBlock(message: string): Promise<string | null> {
  const { promptBlock } = await resolveMetaProductContext(message);
  return promptBlock;
}
