/**
 * Explicit chat write to apply a card title (epithet) the user picked — "set
 * Jordan's title to Card Table Rival". Same shape as lifeArcWriteService.ts:
 * regex extraction, no LLM field parsing, applied through the existing
 * persistCharacterEpithet persistence (no parallel write path).
 */
import { resolveCharacterByName } from './foundationRecallDataService';
import { persistCharacterEpithet, type EpithetSuggestion } from '../characters/epithetGenerationService';
import { isThemeShapedEpithet, normalizeEpithetText } from '../../utils/personNameEpithet';

export type CharacterEpithetWriteResult = {
  summary: string;
  characterId: string;
  characterName: string;
  title: string;
};

function cleanPhrase(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CHARACTER_EPITHET_SET_RE =
  /\b(?:set|change|update|make)\s+(.{1,60}?)(?:'s|’s)\s+(?:card\s+)?(?:title|epithet)\s+(?:to\s+)?(.{1,60})$/i;

export async function writeCharacterEpithetFromChat(userId: string, message: string): Promise<CharacterEpithetWriteResult> {
  const text = message.trim();
  const match = text.match(CHARACTER_EPITHET_SET_RE);
  if (!match) {
    throw new Error('Try "set Jordan\'s title to Card Table Rival".');
  }

  const rawName = cleanPhrase(match[1]);
  const rawTitle = cleanPhrase(match[2]);
  if (!rawName || !rawTitle) {
    throw new Error('Try "set Jordan\'s title to Card Table Rival".');
  }

  // Normalize up front so the summary/return value match exactly what
  // persistCharacterEpithet will actually store (it re-normalizes internally,
  // idempotently, but we want to report the real persisted string, not the
  // raw regex capture).
  const normalizedTitle = normalizeEpithetText(rawTitle);
  if (!normalizedTitle || isThemeShapedEpithet(normalizedTitle)) {
    throw new Error(
      `"${rawTitle}" didn't look like a usable title — try something short and specific, like "Card Table Rival".`,
    );
  }

  const character = await resolveCharacterByName(userId, rawName);
  if (!character) throw new Error(`I couldn't find a character named "${rawName}".`);

  const metadata = (character.metadata ?? {}) as Record<string, unknown>;
  const displayTitle = metadata.display_title as { stability?: string; primaryTitle?: string } | undefined;
  const nextMetadata: Record<string, unknown> = { ...metadata, epithet_pinned: true };
  // A locked display_title wins outright over metadata.epithet in the UI's
  // title composition — un-pin it so the newly chosen title actually shows.
  if (displayTitle?.stability === 'locked') {
    nextMetadata.display_title = { ...displayTitle, stability: 'suggested_update' };
  }

  const suggestion: EpithetSuggestion = {
    epithet: normalizedTitle,
    evidence: { source: 'user', quotes: [], confidence: 1, generatedAt: new Date().toISOString() },
  };

  const ok = await persistCharacterEpithet(userId, character.id, suggestion, {
    name: character.name,
    alias: character.alias,
    metadata: nextMetadata,
  });
  if (!ok) {
    throw new Error(
      `"${normalizedTitle}" didn't look like a usable title — try something short and specific, like "Card Table Rival".`,
    );
  }

  return {
    summary: `Updated ${character.name}'s card title to **${normalizedTitle}**.`,
    characterId: character.id,
    characterName: character.name,
    title: normalizedTitle,
  };
}
