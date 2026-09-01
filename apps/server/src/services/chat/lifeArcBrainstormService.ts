/**
 * Read-only name-idea brainstorming for life arcs, triggered from chat.
 * Same LLM-call shape as characters/epithetGenerationService.ts's
 * suggestEpithetFromLlm — completeFor('nano', ...) + strict JSON parsing —
 * but returns several options instead of one, and never writes anything.
 * Renaming an arc after picking a suggestion still goes through the existing
 * LIFE_ARC_WRITE path (lifeArcWriteService.ts), not this file.
 */
import { logger } from '../../logger';
import { completeFor } from '../llm/completeFor';
import { isFallbackEnabled } from '../devFallbackService';
import { arcService, type ArcTrack } from '../continuityRuntime/arcs/arcService';

export type LifeArcNameSuggestion = {
  title: string;
  rationale: string;
};

export type LifeArcBrainstormResult = {
  summary: string;
  arcId: string | null;
  arcTitle: string | null;
  suggestions: LifeArcNameSuggestion[];
};

const TRACK_VALUES: ArcTrack[] = ['career', 'romance', 'relationships', 'creative', 'health', 'inner', 'mixed', 'custom'];
const MAX_SUGGESTIONS = 6;

function cleanPhrase(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLane(raw: string): ArcTrack | null {
  const key = cleanPhrase(raw).toLowerCase();
  return TRACK_VALUES.find((t) => t === key) ?? null;
}

/**
 * Best-effort extraction of which arc (by title) or which lane (by track)
 * the user is asking about. Deliberately narrow — falls back to "no target"
 * (brainstorm generically off the user's active arcs) rather than guessing.
 */
function extractTarget(message: string): { arcTitle: string | null; lane: ArcTrack | null } {
  const text = cleanPhrase(message);

  const laneMatch = text.match(/\b(?:for|in)\s+(?:my\s+|the\s+)?([a-zA-Z]+)\s+lane\b/i);
  const lane = laneMatch ? parseLane(laneMatch[1]) : null;

  const arcMatch = text.match(/\barc\s+(?:called\s+|named\s+)?["“]?([a-zA-Z0-9][\w' .&/-]{1,58}?)["”]?(?:\s+arc)?$/i)
    ?? text.match(/\b(?:my|the)\s+([a-zA-Z0-9][\w' .&/-]{1,40}?)\s+arc\b/i);
  const arcTitle = arcMatch ? cleanPhrase(arcMatch[1]) : null;

  return { arcTitle, lane };
}

function heuristicSuggestions(seed: string, lane: ArcTrack | null): LifeArcNameSuggestion[] {
  const base = cleanPhrase(seed) || (lane ?? 'This Chapter');
  const titled = base.replace(/\b\w/g, (c) => c.toUpperCase());
  return [
    { title: `The ${titled} Years`, rationale: `A straightforward era name built from "${titled}".` },
    { title: `${titled} Chapter`, rationale: `Keeps "${titled}" front and center as a chapter label.` },
    { title: `Rise of ${titled}`, rationale: `A more narrative framing for the same period.` },
  ];
}

async function suggestFromLlm(
  target: { arcTitle: string | null; lane: ArcTrack | null },
  existingTitles: string[],
): Promise<LifeArcNameSuggestion[] | null> {
  if (isFallbackEnabled()) return null;

  const focus = target.arcTitle
    ? `an arc currently titled "${target.arcTitle}"`
    : target.lane
      ? `an arc in the "${target.lane}" life lane`
      : 'a life arc';

  try {
    const result = await completeFor('nano', {
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You brainstorm short, evocative title options for chapters/eras on a personal life-story timeline app. ' +
            'Return JSON: {"suggestions":[{"title":"Two To Five Words","rationale":"one short sentence"}, ...]}. ' +
            `Return between 3 and ${MAX_SUGGESTIONS} suggestions. Rules: Title Case; no leading "the" unless it reads naturally; ` +
            'vary the tone across options (plain/descriptive, narrative/dramatic, playful); never repeat a title already in use; ' +
            'do not invent biographical facts, just riff on the label itself.',
        },
        {
          role: 'user',
          content:
            `Brainstorm title options for ${focus}.\n` +
            (existingTitles.length
              ? `Titles already in use (avoid duplicating): ${existingTitles.join(', ')}`
              : 'No other arc titles exist yet.'),
        },
      ],
    });

    const raw = result.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { suggestions?: Array<{ title?: string; rationale?: string }> };
    if (!Array.isArray(parsed.suggestions)) return null;

    const seen = new Set(existingTitles.map((t) => t.toLowerCase()));
    const suggestions: LifeArcNameSuggestion[] = [];
    for (const s of parsed.suggestions) {
      const title = typeof s.title === 'string' ? cleanPhrase(s.title) : '';
      if (!title || title.length > 60) continue;
      if (seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      suggestions.push({
        title,
        rationale: typeof s.rationale === 'string' ? s.rationale.slice(0, 160) : '',
      });
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }
    return suggestions.length ? suggestions : null;
  } catch (err) {
    logger.debug({ err, focus }, 'life arc brainstorm LLM suggestion failed; falling back to heuristic');
    return null;
  }
}

export async function brainstormLifeArcNames(userId: string, message: string): Promise<LifeArcBrainstormResult> {
  const target = extractTarget(message);
  const arcs = await arcService.listForUser(userId);
  const existingTitles = arcs.map((a) => a.title);

  let matchedArc = target.arcTitle
    ? arcs.find((a) => a.title.trim().toLowerCase() === target.arcTitle!.toLowerCase()) ?? null
    : null;
  if (!matchedArc && target.lane) {
    matchedArc = arcs.find((a) => a.track === target.lane) ?? null;
  }

  const seedTitle = matchedArc?.title ?? target.arcTitle ?? target.lane ?? 'life arc';

  let suggestions = await suggestFromLlm(
    { arcTitle: matchedArc?.title ?? target.arcTitle, lane: matchedArc?.track ?? target.lane },
    existingTitles,
  );
  if (!suggestions) suggestions = heuristicSuggestions(seedTitle, matchedArc?.track ?? target.lane);

  const targetLabel = matchedArc?.title ?? target.arcTitle ?? (target.lane ? `your ${target.lane} lane` : 'your arc');
  const lines = suggestions.map((s, i) => `${i + 1}. **${s.title}**${s.rationale ? ` — ${s.rationale}` : ''}`);
  const summary =
    `Here are some name ideas for ${targetLabel}:\n\n${lines.join('\n')}\n\n` +
    `Say "rename the arc ${matchedArc?.title ?? targetLabel} to <one of these>" and I'll update it.`;

  return {
    summary,
    arcId: matchedArc?.id ?? null,
    arcTitle: matchedArc?.title ?? null,
    suggestions,
  };
}
