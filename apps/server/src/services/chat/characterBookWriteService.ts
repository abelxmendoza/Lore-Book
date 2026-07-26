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
