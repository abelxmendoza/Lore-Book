/**
 * Story-derived personality epithets for Character Book cards + Actors cast.
 *
 * Identity stays in `characters.name`. Display composes "Name the Epithet"
 * from metadata.epithet (preferred) / contextual_title. Users can pin or
 * disable via metadata.epithet_pinned / epithet_disabled.
 */

import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import {
  isThemeShapedEpithet,
  normalizeEpithetText,
  resolveStoredEpithet,
} from '../../utils/personNameEpithet';
import { completeFor } from '../llm/completeFor';
import { isFallbackEnabled } from '../devFallbackService';
import { entityFactsService } from '../entityFactsService';
import { supabaseAdmin } from '../supabaseClient';

export type EpithetEvidence = {
  source: 'story_heuristic' | 'story_llm' | 'primary_name_repair' | 'user';
  quotes: string[];
  confidence: number;
  generatedAt: string;
};

export type EpithetSuggestion = {
  epithet: string;
  evidence: EpithetEvidence;
};

const MIN_SNIPPETS = 2;
const MAX_SNIPPETS = 10;
const EPITHET_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** Synthetic / generic story patterns only — never founder-specific lore literals. */
const HEURISTIC_RULES: Array<{ pattern: RegExp; epithet: string; confidence: number }> = [
  {
    pattern: /clean(?:s|ing)?\s+(?:the\s+)?(?:hallways?|bathrooms?|restrooms?|kitchen).{0,80}(?:every\s+friday|always|every\s+week)/i,
    epithet: 'Hallway Guardian',
    confidence: 0.82,
  },
  {
    pattern: /(?:plays?|playing)\s+magic\s+the\s+gathering/i,
    epithet: 'Card Table Rival',
    confidence: 0.78,
  },
  {
    pattern: /(?:coding\s+mentor|mentor.{0,40}coding|teaches?.{0,40}code)/i,
    epithet: 'Bootcamp Mentor',
    confidence: 0.8,
  },
  {
    pattern: /(?:dj|deejay|spins?\s+(?:records?|sets?))/i,
    epithet: 'Underground Selector',
    confidence: 0.75,
  },
  {
    pattern: /(?:recruiter|onboarding|hiring\s+manager|gatekeep)/i,
    epithet: 'Hiring Gatekeeper',
    confidence: 0.75,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMentionPattern(names: string[]): RegExp | null {
  const terms = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))];
  if (terms.length === 0) return null;
  return new RegExp(`\\b(?:${terms.map(escapeRegExp).join('|')})\\b`, 'i');
}

async function loadStorySnippets(
  userId: string,
  characterId: string,
  mentionNames: string[],
): Promise<string[]> {
  const snippets: string[] = [];
  const mentionPattern = buildMentionPattern(mentionNames);

  const { data: facts } = await supabaseAdmin
    .from('entity_facts')
    .select('fact')
    .eq('user_id', userId)
    .eq('entity_id', characterId)
    .eq('entity_type', 'character')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(20);
  for (const row of facts ?? []) {
    if (typeof row.fact === 'string' && row.fact.trim()) snippets.push(row.fact.trim());
  }

  const { data: journals } = await supabaseAdmin
    .from('journal_entries')
    .select('content, summary')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(60);
  for (const entry of journals ?? []) {
    const text = [entry.summary, entry.content].filter(Boolean).join(' ').trim();
    if (!text || !mentionPattern?.test(text)) continue;
    snippets.push(text.slice(0, 400));
    if (snippets.length >= MAX_SNIPPETS) break;
  }

  // Chat mentions via entity_conversation_links → recent messages is heavy;
  // lean on facts + journals. Callers can pass extra corpus.
  return snippets.slice(0, MAX_SNIPPETS);
}

export function suggestEpithetFromCorpus(corpus: string): EpithetSuggestion | null {
  const blob = corpus.trim();
  if (blob.length < 24) return null;
  for (const rule of HEURISTIC_RULES) {
    const m = blob.match(rule.pattern);
    if (!m) continue;
    if (isThemeShapedEpithet(rule.epithet)) continue;
    return {
      epithet: rule.epithet,
      evidence: {
        source: 'story_heuristic',
        quotes: [m[0].slice(0, 160)],
        confidence: rule.confidence,
        generatedAt: new Date().toISOString(),
      },
    };
  }
  return null;
}

async function suggestEpithetFromLlm(
  characterName: string,
  snippets: string[],
): Promise<EpithetSuggestion | null> {
  if (isFallbackEnabled()) {
    return suggestEpithetFromCorpus(`${characterName}\n${snippets.join('\n')}`);
  }

  try {
    const result = await completeFor('nano', {
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You invent short, fun personality epithets for characters in a life-memory app. ' +
            'Return JSON: {"epithet":"Two To Four Words","confidence":0.0-1.0,"quote":"short supporting snippet"}. ' +
            'Rules: no leading "the"; Title Case; capture a memorable recurring habit/role/vibe from the evidence; ' +
            'never invent biographical facts not grounded in the snippets; if evidence is weak return {"epithet":null}.',
        },
        {
          role: 'user',
          content: `Character: ${characterName}\n\nStory evidence:\n${snippets
            .map((s, i) => `${i + 1}. ${s}`)
            .join('\n')}`,
        },
      ],
    });

    const raw = result.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as {
      epithet?: string | null;
      confidence?: number;
      quote?: string;
    };
    const epithet = normalizeEpithetText(parsed.epithet ?? null);
    if (!epithet || isThemeShapedEpithet(epithet)) return null;
    const confidence =
      typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
        ? parsed.confidence
        : 0.7;
    if (confidence < 0.65) return null;
    return {
      epithet,
      evidence: {
        source: 'story_llm',
        quotes: parsed.quote ? [parsed.quote.slice(0, 160)] : snippets.slice(0, 2).map((s) => s.slice(0, 160)),
        confidence,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    logger.debug({ err, characterName }, 'epithet LLM suggestion failed; trying heuristic');
    return suggestEpithetFromCorpus(`${characterName}\n${snippets.join('\n')}`);
  }
}

export function shouldAttemptEpithetGeneration(
  metadata: Record<string, unknown> | null | undefined,
  options?: { force?: boolean },
): boolean {
  if (options?.force) return true;
  if (!metadata) return true;
  // The main character card is an identity surface, not a story-epithet card.
  if (metadata.is_self === true || metadata.is_user === true) return false;
  if (metadata.epithet_disabled === true) return false;
  if (metadata.epithet_pinned === true) return false;
  if (resolveStoredEpithet(metadata)) {
    const evidence = metadata.epithet_evidence as EpithetEvidence | undefined;
    const generatedAt = evidence?.generatedAt ? Date.parse(evidence.generatedAt) : NaN;
    if (Number.isFinite(generatedAt) && Date.now() - generatedAt < EPITHET_COOLDOWN_MS) {
      return false;
    }
    // Already has one — only refresh when forced.
    return false;
  }
  return true;
}

export async function persistCharacterEpithet(
  userId: string,
  characterId: string,
  suggestion: EpithetSuggestion,
  row: { name: string; alias?: string[] | null; metadata?: Record<string, unknown> | null },
): Promise<boolean> {
  const epithet = normalizeEpithetText(suggestion.epithet);
  if (!epithet || isThemeShapedEpithet(epithet)) return false;

  const metadata: Record<string, unknown> = {
    ...(row.metadata ?? {}),
    epithet,
    contextual_title: epithet,
    epithet_evidence: suggestion.evidence,
  };
  const alias = [...(row.alias ?? [])].filter(Boolean);
  // Short epithet can live as an alias. The composed "Name the Epithet" form is
  // display-only — storing it as an alias pollutes the identity line.
  if (!alias.some((a) => normalizeNameKey(a) === normalizeNameKey(epithet))) {
    alias.push(epithet);
  }

  const { error } = await supabaseAdmin
    .from('characters')
    .update({
      alias: alias.length ? alias : null,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', characterId)
    .eq('user_id', userId);

  if (error) {
    logger.warn({ err: error, characterId }, 'persistCharacterEpithet failed');
    return false;
  }
  return true;
}

/**
 * Generate + persist an epithet when story evidence is rich enough and the
 * character does not already have a pinned/disabled title.
 */
export async function maybeGenerateCharacterEpithet(
  userId: string,
  characterId: string,
  options?: { force?: boolean },
): Promise<EpithetSuggestion | null> {
  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !character) return null;
  const metadata = (character.metadata as Record<string, unknown>) ?? {};
  if (metadata.is_self === true || metadata.is_user === true) return null;
  if (!shouldAttemptEpithetGeneration(metadata, options)) return null;

  const mentionNames = [
    character.name,
    ...((character.alias as string[] | null) ?? []),
  ].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);

  let snippets = await loadStorySnippets(userId, characterId, mentionNames);
  if (snippets.length < MIN_SNIPPETS) {
    // Fall back to in-memory facts service if table shape differs.
    try {
      const facts = await entityFactsService.getEntityFacts(userId, characterId, 'character');
      for (const f of facts.filter((x) => x.status === 'active')) {
        if (f.fact?.trim()) snippets.push(f.fact.trim());
      }
      snippets = [...new Set(snippets)].slice(0, MAX_SNIPPETS);
    } catch {
      /* ignore */
    }
  }
  if (snippets.length < MIN_SNIPPETS && !options?.force) return null;

  const corpus = `${character.name}\n${snippets.join('\n')}`;
  let suggestion = suggestEpithetFromCorpus(corpus);
  if (!suggestion || (suggestion.evidence.confidence < 0.8 && snippets.length >= MIN_SNIPPETS)) {
    const llm = await suggestEpithetFromLlm(character.name, snippets);
    if (llm) suggestion = llm;
  }
  if (!suggestion) return null;

  const ok = await persistCharacterEpithet(userId, characterId, suggestion, {
    name: character.name,
    alias: character.alias,
    metadata,
  });
  if (!ok) return null;

  logger.info(
    { characterId, epithet: suggestion.epithet, source: suggestion.evidence.source },
    'Generated story epithet for character',
  );
  return suggestion;
}
