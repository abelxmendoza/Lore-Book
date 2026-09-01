/**
 * Read-only card-title (epithet) name-idea brainstorming for a character,
 * triggered from chat. Same shape as lifeArcBrainstormService.ts, and reuses
 * epithetGenerationService.ts's LLM call pattern + story-evidence loader.
 * Applying a chosen title still goes through characterEpithetWriteService.ts,
 * not this file.
 */
import { logger } from '../../logger';
import { completeFor } from '../llm/completeFor';
import { isFallbackEnabled } from '../devFallbackService';
import { isThemeShapedEpithet, normalizeEpithetText, resolveStoredEpithet } from '../../utils/personNameEpithet';
import { resolveCharacterByName } from './foundationRecallDataService';
import { loadStorySnippets } from '../characters/epithetGenerationService';

export type CharacterTitleSuggestion = {
  title: string;
  rationale: string;
};

export type CharacterTitleBrainstormResult = {
  summary: string;
  characterId: string | null;
  characterName: string | null;
  suggestions: CharacterTitleSuggestion[];
};

const MAX_SUGGESTIONS = 6;

function cleanPhrase(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deliberately narrow name extraction — matches the platform's stance
 * against guessing. Only handles "... for <name>" / "... title <name>('s)"
 * shapes; anything else asks the user to name the character explicitly.
 */
function extractCharacterName(message: string): string | null {
  const text = cleanPhrase(message);

  const forMatch = text.match(/\bfor\s+(?:my\s+character\s+)?([A-Za-z][\w' .-]{1,40}?)(?:'s)?$/i);
  if (forMatch) return cleanPhrase(forMatch[1]);

  const helpMatch = text.match(/\bhelp\s+me\s+(?:title|retitle)\s+([A-Za-z][\w' .-]{1,40}?)(?:'s)?\s*(?:card\s+)?title\b/i);
  if (helpMatch) return cleanPhrase(helpMatch[1]);

  return null;
}

function heuristicSuggestions(name: string, existingEpithet: string | null): CharacterTitleSuggestion[] {
  const seed = existingEpithet ?? name;
  return [
    { title: `The ${name}`, rationale: 'A minimal, name-forward title.' },
    { title: `Friend of the Story`, rationale: 'A warm, generic placeholder while more story evidence comes in.' },
    { title: `${seed} Reconsidered`, rationale: 'A quick twist on the current title/name to riff from.' },
  ];
}

async function suggestFromLlm(
  characterName: string,
  snippets: string[],
  existingEpithet: string | null,
): Promise<CharacterTitleSuggestion[] | null> {
  if (isFallbackEnabled()) return null;

  try {
    const result = await completeFor('nano', {
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You brainstorm short, fun personality-epithet options ("card titles") for characters in a life-memory app. ' +
            'Return JSON: {"suggestions":[{"title":"Two To Four Words","rationale":"one short sentence"}, ...]}. ' +
            `Return between 3 and ${MAX_SUGGESTIONS} suggestions. Rules: no leading "the" unless it reads naturally; Title Case; ` +
            'capture a memorable recurring habit/role/vibe grounded in the evidence given; vary the tone across options; ' +
            'never invent biographical facts not grounded in the evidence; never repeat the current title.',
        },
        {
          role: 'user',
          content:
            `Character: ${characterName}\n` +
            (existingEpithet ? `Current title: "${existingEpithet}" (don't repeat this)\n` : '') +
            `\nStory evidence:\n${
              snippets.length ? snippets.map((s, i) => `${i + 1}. ${s}`).join('\n') : '(no story evidence available yet)'
            }`,
        },
      ],
    });

    const raw = result.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { suggestions?: Array<{ title?: string; rationale?: string }> };
    if (!Array.isArray(parsed.suggestions)) return null;

    const seen = new Set(existingEpithet ? [existingEpithet.toLowerCase()] : []);
    const suggestions: CharacterTitleSuggestion[] = [];
    for (const s of parsed.suggestions) {
      const title = typeof s.title === 'string' ? normalizeEpithetText(s.title) : null;
      if (!title || isThemeShapedEpithet(title)) continue;
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
    logger.debug({ err, characterName }, 'character epithet brainstorm LLM suggestion failed; falling back to heuristic');
    return null;
  }
}

export async function brainstormCharacterEpithets(userId: string, message: string): Promise<CharacterTitleBrainstormResult> {
  const name = extractCharacterName(message);
  if (!name) {
    return {
      summary: 'Which character would you like title ideas for? Try "give me some title ideas for Genni".',
      characterId: null,
      characterName: null,
      suggestions: [],
    };
  }

  const character = await resolveCharacterByName(userId, name);
  if (!character) {
    return {
      summary: `I couldn't find a character named "${name}" to brainstorm titles for.`,
      characterId: null,
      characterName: null,
      suggestions: [],
    };
  }

  const metadata = (character.metadata ?? {}) as Record<string, unknown>;
  const existingEpithet = resolveStoredEpithet(metadata);
  const mentionNames = [character.name, ...((character.alias as string[] | null) ?? [])].filter(
    (n): n is string => typeof n === 'string' && n.trim().length > 0,
  );
  const snippets = await loadStorySnippets(userId, character.id, mentionNames);

  let suggestions = await suggestFromLlm(character.name, snippets, existingEpithet);
  if (!suggestions) suggestions = heuristicSuggestions(character.name, existingEpithet);

  const lines = suggestions.map((s, i) => `${i + 1}. **${s.title}**${s.rationale ? ` — ${s.rationale}` : ''}`);
  const summary =
    `Here are some title ideas for ${character.name}:\n\n${lines.join('\n')}\n\n` +
    `Say "set ${character.name}'s title to <one of these>" and I'll update their card.`;

  return {
    summary,
    characterId: character.id,
    characterName: character.name,
    suggestions,
  };
}
