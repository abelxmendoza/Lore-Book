/**
 * Auto domain classification for the character card audit.
 *
 * Tier 1: the app's own pipeline classifier (classifyEntity — glossary
 * lexicons + structural rules, "PERSON requires positive evidence").
 * Tier 2: LLM batch classification for phrases the pipeline can't decide,
 * result cached on the card's metadata so each card is billed at most once.
 *
 * This is what removes the hardcoded feel: new misfiles ("Claude Code",
 * "One Piece", next month's equivalent) are decided by the same machinery
 * that classifies entities at ingestion, not by audit-local word lists.
 */
import { config } from '../../../config';
import { openai } from '../../../lib/openai';
import { logger } from '../../../logger';
import { classifyEntity } from '../../entities/entityClassifier';

export type AutoDomain =
  | 'person'
  | 'contextual_person'
  | 'tool'
  | 'media'
  | 'band'
  | 'group'
  | 'event'
  | 'process'
  | 'role'
  | 'skill'
  | 'place'
  | 'unknown';

export type AutoDomainResult = {
  domain: AutoDomain;
  confidence: number;
  source: 'pipeline' | 'llm' | 'cached';
  reason: string;
};

const LLM_DOMAINS: ReadonlySet<string> = new Set([
  'person', 'contextual_person', 'tool', 'media', 'band', 'group',
  'event', 'process', 'role', 'skill', 'place', 'unknown',
]);

/**
 * Tier 1 — the ingestion pipeline's deterministic classifier. Returns null
 * when the pipeline has no confident signal (goes to the LLM tier).
 */
export function pipelineDomain(name: string, provenance: string): AutoDomainResult | null {
  const c = classifyEntity(name, provenance || undefined);
  if (c.confidence < 0.8) return null;

  const mk = (domain: AutoDomain): AutoDomainResult => ({
    domain,
    confidence: c.confidence,
    source: 'pipeline',
    reason: `pipeline classifier: ${c.type} (${c.reason})`,
  });

  switch (c.type) {
    case 'APP':
    case 'PRODUCT':
      return mk('tool');
    case 'MEDIA':
      return mk('media');
    case 'ORGANIZATION':
      return c.dynamicLabel === 'band' || /music act|band/i.test(c.reason) ? mk('band') : mk('group');
    case 'COMPANY':
    case 'GROUP':
    case 'FAMILY':
      return mk('group');
    case 'EVENT':
      return mk('event');
    case 'SKILL':
      return mk('skill');
    case 'PLACE':
    case 'LOCATION':
    case 'HOUSEHOLD':
      return mk('place');
    case 'PERSON':
      return mk('person');
    default:
      // BRAND/FOOD_DRINK/PET/VEHICLE/UNKNOWN — let the LLM tier decide.
      return null;
  }
}

export type LlmClassificationCard = {
  id: string;
  name: string;
  provenance: string;
};

const SYSTEM_PROMPT = `You audit the "Character Book" of a personal-memory app. Each candidate is a phrase that was extracted from the user's conversations and stored as a PERSON. Many are misfiled. Decide what each phrase actually names, using its story context.

Domains:
- person: a real, individual human (named person, nickname/stage name, public figure).
- contextual_person: a real human referenced only by role ("potential investor", "friend of X") — needs a contextual title but IS a person.
- tool: software, app, AI assistant, product.
- media: anime/manga/series/film/game/franchise/fandom title.
- band: musical act or band.
- group: team, company, community, collective.
- event: show, party, festival, gathering, named happening.
- process: work/administrative process (background check, onboarding, interview).
- role: job title / occupation label, not a specific person.
- skill: an ability or craft.
- place: location or venue.
- unknown: cannot tell.

Rules: provenance proves the phrase was MENTIONED, not that it is a human. Only answer person/contextual_person on positive human evidence. Return JSON: {"classifications":[{"id":"...","domain":"...","confidence":0.0,"reason":"..."}]} — one entry per candidate, confidence in [0,1].`;

/**
 * Tier 2 — one batched LLM call for every undecided card. Failure-safe:
 * returns an empty map on any error so the audit falls back to deterministic
 * results instead of blocking.
 */
export async function llmClassifyDomains(
  cards: LlmClassificationCard[],
): Promise<Map<string, AutoDomainResult>> {
  const out = new Map<string, AutoDomainResult>();
  if (cards.length === 0) return out;

  try {
    const payload = cards.map((c) => ({
      id: c.id,
      phrase: c.name,
      story_context: c.provenance.slice(0, 500) || '(none captured)',
    }));
    // The shared client normalizes temperature/max_tokens per model at the
    // fetch boundary (see lib/openai.ts), so pass standard params here.
    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ candidates: payload }) },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const byId = new Map(cards.map((c) => [c.id, c]));
    for (const entry of parseLlmClassifications(raw)) {
      if (!byId.has(entry.id)) continue;
      out.set(entry.id, { ...entry.result, source: 'llm' });
    }
  } catch (error) {
    logger.warn({ error, count: cards.length }, 'card audit: LLM domain classification skipped');
  }
  return out;
}

/** Pure parser — exported for tests. Drops malformed entries. */
export function parseLlmClassifications(
  raw: string,
): Array<{ id: string; result: AutoDomainResult }> {
  const entries: Array<{ id: string; result: AutoDomainResult }> = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return entries;
  }
  const list = (parsed as { classifications?: unknown })?.classifications;
  if (!Array.isArray(list)) return entries;
  for (const item of list) {
    const id = typeof (item as { id?: unknown })?.id === 'string' ? (item as { id: string }).id : null;
    const domain = (item as { domain?: unknown })?.domain;
    const confidence = Number((item as { confidence?: unknown })?.confidence ?? 0);
    const reason = String((item as { reason?: unknown })?.reason ?? '');
    if (!id || typeof domain !== 'string' || !LLM_DOMAINS.has(domain)) continue;
    entries.push({
      id,
      result: {
        domain: domain as AutoDomain,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        source: 'llm',
        reason: reason || 'LLM classification',
      },
    });
  }
  return entries;
}

/** Metadata cache — one LLM classification per card, ever. */
export function cachedDomain(metadata: Record<string, unknown>): AutoDomainResult | null {
  const cached = metadata?.domain_classification as
    | { domain?: unknown; confidence?: unknown; reason?: unknown }
    | undefined;
  if (!cached || typeof cached.domain !== 'string' || !LLM_DOMAINS.has(cached.domain)) return null;
  return {
    domain: cached.domain as AutoDomain,
    confidence: Number(cached.confidence ?? 0.7),
    source: 'cached',
    reason: String(cached.reason ?? 'cached classification'),
  };
}
