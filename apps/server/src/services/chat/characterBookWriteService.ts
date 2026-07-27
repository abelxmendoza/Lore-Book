/**
 * Explicit Character Book write requests ("make sure they're all in my
 * character book...") — turns the request into a real, synchronous
 * persistence action with a per-character reported outcome, instead of the
 * prompt-only "Got it, I'm tracking this" acknowledgment that never actually
 * saved anything (see continuityIntentDetection.ts).
 *
 * Every write funnels through characterRegistry.classifyForCreation() — the
 * one dedupe/creation chokepoint every other character-creating caller in
 * the codebase already uses — so this inherits its dedupe guarantee rather
 * than reimplementing one.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { characterRegistry } from '../characterRegistry';
import { entityFactsService } from '../entityFactsService';
import { classifyCastForActiveStory, type CastMemberResult } from './castRosterQueryService';

export type CharacterBookWriteOutcome = {
  name: string;
  outcome: 'saved' | 'proposed_for_review' | 'already_present' | 'ambiguous' | 'failed';
  characterId?: string;
  detail: string;
  spellingUncertain?: boolean;
};

function sourceText(messages: Array<{ role: string; content: string }>): string {
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n')
    .slice(0, 6000);
}

async function createCharacterFromName(userId: string, name: string): Promise<{ id: string } | null> {
  const parts = name.trim().split(/\s+/);
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('characters')
    .insert({
      id: randomUUID(),
      user_id: userId,
      name,
      first_name: parts[0],
      last_name: parts.slice(1).join(' ') || null,
      status: 'active',
      has_met: true,
      metadata: { created_via: 'character_book_write_request' },
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (error) {
    logger.warn({ err: error, name }, 'characterBookWriteService: character insert failed');
    return null;
  }
  return data as { id: string };
}

async function writeOneMember(
  userId: string,
  member: CastMemberResult,
  conversationText: string
): Promise<CharacterBookWriteOutcome> {
  if (member.entityId && member.classification === 'returning') {
    return {
      name: member.name,
      outcome: 'already_present',
      characterId: member.entityId,
      detail: 'Already in your Character Book.',
    };
  }

  return characterRegistry.runExclusive(userId, async (): Promise<CharacterBookWriteOutcome> => {
    const decision = await characterRegistry.classifyForCreation(userId, member.name);

    if (decision.action === 'merge') {
      await characterRegistry.mergeMention(userId, decision.characterId, decision.cleanName, {
        source: 'character_book_write_request',
      });
      return {
        name: member.name,
        outcome: 'already_present',
        characterId: decision.characterId,
        detail: `Already in your Character Book as ${decision.matchedName}.`,
      };
    }

    if (decision.action === 'defer') {
      await characterRegistry.recordPendingQuestion(
        userId,
        decision.cleanName,
        decision.candidates,
        null,
        decision.rawName
      );
      return {
        name: member.name,
        outcome: 'ambiguous',
        detail: 'Multiple possible matches — needs your confirmation before saving.',
      };
    }

    if (decision.action === 'reject') {
      return {
        name: member.name,
        outcome: 'failed',
        detail: `Could not save: ${decision.reason}.`,
      };
    }

    // action === 'create'
    const spellingUncertain = member.classification === 'unresolved';
    if (spellingUncertain) {
      // Never silently canonicalize a name the resolver itself isn't
      // confident about — route through the same review flow as an
      // ambiguous match rather than a hard create.
      await characterRegistry.recordPendingQuestion(userId, decision.cleanName, [], null, member.name);
      return {
        name: member.name,
        outcome: 'proposed_for_review',
        detail: 'Spelling uncertain — queued for your review instead of saving automatically.',
        spellingUncertain: true,
      };
    }

    const created = await createCharacterFromName(userId, decision.cleanName);
    if (!created) {
      return { name: member.name, outcome: 'failed', detail: 'Save failed — please try again.' };
    }
    if (conversationText.trim()) {
      await entityFactsService
        .extractAndPersistFacts(userId, created.id, 'character', decision.cleanName, conversationText)
        .catch((err) => logger.warn({ err, characterId: created.id }, 'Post-create fact extraction failed'));
    }
    return {
      name: member.name,
      outcome: 'saved',
      characterId: created.id,
      detail: 'Saved to your Character Book.',
    };
  });
}

function summarize(results: CharacterBookWriteOutcome[]): string {
  if (results.length === 0) {
    return "I don't see anyone specific mentioned yet in this conversation to add to your character book.";
  }
  const lines = results.map((r) => `**${r.name}** — ${r.detail}`);
  return ['Checked your cast:', ...lines].join('\n');
}

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findCharacterByName(
  userId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const key = name.trim().toLowerCase();
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, status')
    .eq('user_id', userId);
  const hit = (data ?? []).find((row) => {
    if (row.status === 'reclassified') return false;
    if (String(row.name ?? '').toLowerCase() === key) return true;
    const aliases = Array.isArray(row.alias) ? (row.alias as unknown[]) : [];
    return aliases.some((a) => typeof a === 'string' && a.toLowerCase() === key);
  });
  return hit ? { id: hit.id as string, name: hit.name as string } : null;
}

/**
 * Named Character Book CRUD from chat, falling back to cast-window save when
 * the message is the classic "add them to my character book" shape.
 */
export async function writeCharacterBookFromChat(
  userId: string,
  message: string,
  threadId: string,
): Promise<{ results: CharacterBookWriteOutcome[]; summary: string; metadata?: Record<string, unknown> }> {
  const text = message.trim();

  const rename = text.match(/\b(?:rename)\s+(?:the\s+)?(?:person|character)\s+(.{1,60}?)\s+to\s+(.{1,60})$/i);
  if (rename) {
    const from = cleanName(rename[1]);
    const to = cleanName(rename[2]);
    const existing = await findCharacterByName(userId, from);
    if (!existing) {
      return {
        results: [],
        summary: `I couldn't find **${from}** in your Character Book to rename.`,
      };
    }
    await supabaseAdmin
      .from('characters')
      .update({ name: to, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId);
    return {
      results: [{ name: to, outcome: 'saved', characterId: existing.id, detail: `Renamed from ${existing.name}.` }],
      summary: `Renamed **${existing.name}** to **${to}**.`,
      metadata: { characterRenamed: true, characterId: existing.id, characterName: to },
    };
  }

  const del = text.match(
    /\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+my\s+(?:character book|characters book|characters)\b|\b(?:delete|remove)\s+(?:the\s+)?(?:person|character)\s+(.{1,60})$/i,
  );
  if (del) {
    const name = cleanName(del[1] || del[2] || '');
    const existing = await findCharacterByName(userId, name);
    if (!existing) {
      return {
        results: [],
        summary: `I couldn't find **${name}** in your Character Book to delete.`,
      };
    }
    const { data: current } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', existing.id)
      .eq('user_id', userId)
      .maybeSingle();
    await supabaseAdmin
      .from('characters')
      .update({
        status: 'deleted',
        updated_at: new Date().toISOString(),
        metadata: {
          ...((current?.metadata as Record<string, unknown> | null) ?? {}),
          deleted_via: 'character_book_write',
          deleted_at: new Date().toISOString(),
        },
      })
      .eq('id', existing.id)
      .eq('user_id', userId);
    return {
      results: [{ name: existing.name, outcome: 'saved', characterId: existing.id, detail: 'Removed from Character Book.' }],
      summary: `Removed **${existing.name}** from your Character Book.`,
      metadata: { characterDeleted: true, characterId: existing.id, characterName: existing.name },
    };
  }

  const addNamed = text.match(
    /\b(?:add|save|put)\s+(.{1,80}?)\s+(?:to|in|into)\s+my\s+(?:character book|characters book)\b/i,
  );
  if (
    addNamed &&
    !/\b(them|these|him|her|it|everyone)\b/i.test(addNamed[1]) &&
    addNamed[1].trim().length >= 2
  ) {
    const name = cleanName(addNamed[1]);
    const existing = await findCharacterByName(userId, name);
    if (existing) {
      return {
        results: [{ name: existing.name, outcome: 'already_present', characterId: existing.id, detail: 'Already in your Character Book.' }],
        summary: `**${existing.name}** is already in your Character Book.`,
      };
    }
    const created = await createCharacterFromName(userId, name);
    if (!created) {
      return {
        results: [{ name, outcome: 'failed', detail: 'Save failed — please try again.' }],
        summary: `Couldn't save **${name}** to your Character Book.`,
      };
    }
    return {
      results: [{ name, outcome: 'saved', characterId: created.id, detail: 'Saved to your Character Book.' }],
      summary: `Added **${name}** to your Character Book.`,
      metadata: { characterCreated: true, characterId: created.id, characterName: name },
    };
  }

  return writeCastToCharacterBook(userId, message, threadId);
}

export async function writeCastToCharacterBook(
  userId: string,
  _message: string,
  threadId: string
): Promise<{ results: CharacterBookWriteOutcome[]; summary: string }> {
  const [{ members }, threadMessages] = await Promise.all([
    classifyCastForActiveStory(userId, threadId),
    (async () => {
      const { loadThreadMessages } = await import('../conversationCentered/threadContentService');
      return loadThreadMessages(userId, threadId);
    })(),
  ]);

  const conversationText = sourceText(threadMessages);
  const results: CharacterBookWriteOutcome[] = [];
  for (const member of members) {
    results.push(await writeOneMember(userId, member, conversationText));
  }

  return { results, summary: summarize(results) };
}
