import { detectCorrectionIntent } from '../memory/correctionDetection';
import { entityFactsService } from '../entityFactsService';
import { entityConversationLinkService } from '../conversationCentered/entityConversationLinkService';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { appendMemoryEvent } from '../memory/memoryEventService';

export type CharacterChatKnowledgeResult = {
  characterId: string;
  applied: boolean;
  isCorrection: boolean;
  fieldUpdates: string[];
  factsExtracted: boolean;
};

type FieldPatch = Record<string, unknown>;

function trimValue(raw: string): string {
  return raw.replace(/^["']|["']$/g, '').trim();
}

function parseNameCorrection(text: string): string | null {
  const patterns = [
    /\b(?:actually|correction:?)\s+(?:(?:his|her|their)|(?:[A-Z][a-z]+(?:'s)?))\s+name\s+is\s+(.+?)[.!?]?\s*$/i,
    /\b(?:her|his|their)\s+name\s+is\s+(?:actually\s+)?(.+?)[.!?]?\s*$/i,
    /\bnot\s+[^,]+,\s*(?:it'?s|her name is|his name is|they'?re called)\s+(.+?)[.!?]?\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return trimValue(match[1]);
  }
  return null;
}

function parsePronounsCorrection(text: string): string | null {
  const match = text.match(/\b(?:their|her|his)\s+pronouns\s+(?:are|is)\s+([^\n.!?]+)/i);
  return match?.[1] ? trimValue(match[1]) : null;
}

function parseRoleCorrection(text: string): string | null {
  const match = text.match(
    /\b(?:actually,?\s+)?(?:they(?:'re| are)|she(?:'s| is)|he(?:'s| is))\s+(?:my\s+)?([a-z][a-z\s-]{1,40}?)(?:\.|,|$)/i,
  );
  if (!match?.[1]) return null;
  const role = trimValue(match[1]);
  if (/^(not|wrong|incorrect)/i.test(role)) return null;
  return role;
}

function parseSummaryCorrection(text: string): string | null {
  const match = text.match(
    /\b(?:actually|correction:?)\s*,?\s*(?:they|she|he)\s+(.{12,280}?)[.!?]?\s*$/i,
  );
  return match?.[1] ? trimValue(match[1]) : null;
}

function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

async function applyFieldPatch(
  userId: string,
  characterId: string,
  patch: FieldPatch,
): Promise<string[]> {
  const updates = Object.keys(patch);
  if (updates.length === 0) return [];

  const { error } = await supabaseAdmin
    .from('characters')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', characterId)
    .eq('user_id', userId);

  if (error) {
    logger.warn({ error, characterId, patch }, 'Character field correction failed');
    return [];
  }
  return updates;
}

/**
 * When a character chip is attached (or modal focus is active), route chat text into
 * their profile: heuristic field corrections + fact extraction into entity_facts.
 */
export async function applyCharacterChatKnowledgeUpdate(
  userId: string,
  characterId: string,
  message: string,
  options: {
    sessionId?: string;
    messageId?: string;
    characterName?: string;
    forceCorrection?: boolean;
  } = {},
): Promise<CharacterChatKnowledgeResult> {
  const correction = detectCorrectionIntent(message);
  const isCorrection = options.forceCorrection || correction.isCorrection;
  const fieldUpdates: string[] = [];

  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, summary, role, pronouns, metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!character) {
    return {
      characterId,
      applied: false,
      isCorrection,
      fieldUpdates: [],
      factsExtracted: false,
    };
  }

  const displayName = options.characterName ?? character.name;
  const patch: FieldPatch = {};
  const aliases = Array.isArray(character.alias) ? [...character.alias] : [];

  if (isCorrection) {
    const newName = parseNameCorrection(message);
    if (newName && newName.toLowerCase() !== character.name.toLowerCase()) {
      const { firstName, lastName } = splitName(newName);
      patch.name = newName;
      patch.first_name = firstName;
      patch.last_name = lastName;
      if (!aliases.some((a) => a.toLowerCase() === character.name.toLowerCase())) {
        aliases.push(character.name);
      }
      patch.alias = aliases;
      fieldUpdates.push('name');
    }

    const pronouns = parsePronounsCorrection(message);
    if (pronouns) {
      patch.pronouns = pronouns;
      fieldUpdates.push('pronouns');
    }

    const role = parseRoleCorrection(message);
    if (role) {
      patch.role = role;
      fieldUpdates.push('role');
    }

    const summary = parseSummaryCorrection(message);
    if (summary) {
      patch.summary = summary;
      fieldUpdates.push('summary');
    }
  }

  if (Object.keys(patch).length > 0) {
    const meta = (character.metadata as Record<string, unknown>) ?? {};
    patch.metadata = {
      ...meta,
      last_chat_correction_at: new Date().toISOString(),
      last_chat_correction_message_id: options.messageId ?? null,
    };
    await applyFieldPatch(userId, characterId, patch);
  }

  let factsExtracted = false;
  try {
    const contextualText = isCorrection
      ? `User correction about ${displayName}: ${message}`
      : `About ${displayName}: ${message}`;
    await entityFactsService.extractAndPersistFacts(
      userId,
      characterId,
      'character',
      displayName,
      contextualText,
    );
    factsExtracted = true;
  } catch (err) {
    logger.warn({ err, characterId }, 'Character chat fact extraction failed');
  }

  if (options.sessionId) {
    await entityConversationLinkService
      .linkEntity(userId, 'character', characterId, options.sessionId, {
        linkKind: isCorrection ? 'mention' : 'mention',
        entityName: displayName,
      })
      .catch((err) => logger.warn({ err, characterId }, 'Failed to link character conversation'));
  }

  if (isCorrection && options.messageId) {
    void appendMemoryEvent({
      userId,
      kind: 'correction',
      actor: 'user',
      sessionId: options.sessionId,
      sourceMessageId: options.messageId,
      content: message,
      confidence: correction.confidence,
      extractionMethod: 'heuristic',
      userConfirmed: true,
      payload: {
        character_id: characterId,
        character_name: displayName,
        field_updates: fieldUpdates,
      },
    });
  }

  return {
    characterId,
    applied: fieldUpdates.length > 0 || factsExtracted,
    isCorrection,
    fieldUpdates,
    factsExtracted,
  };
}
