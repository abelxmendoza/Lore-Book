/**
 * Explicit Quest Log writes from chat — create / rename / delete / status.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { questService } from '../quests/questService';
import { questStorage } from '../quests/questStorage';
import type { QuestStatus } from '../quests/types';

export type QuestWriteResult = {
  summary: string;
  operation: 'create' | 'rename' | 'delete' | 'status';
  questId: string | null;
  questTitle: string;
};

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapStatus(raw: string): QuestStatus {
  const s = raw.toLowerCase().replace(/\s+/g, '_');
  if (s === 'done' || s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'abandoned') return 'abandoned';
  if (s === 'paused' || s === 'blocked') return 'paused';
  return 'active';
}

async function findQuestByTitle(userId: string, title: string) {
  const key = normalizeNameKey(title);
  const quests = await questStorage.getQuests(userId, {});
  return quests.find((q) => normalizeNameKey(q.title) === key) ?? null;
}

export async function writeQuestFromChat(userId: string, message: string): Promise<QuestWriteResult> {
  const text = message.trim();

  const status = text.match(
    /\b(?:mark|set)\s+(?:the\s+)?quest\s+(.{1,60}?)\s+(?:as\s+)?(active|blocked|done|completed|cancelled|paused)\b/i,
  );
  if (status) {
    const title = cleanName(status[1]);
    const next = mapStatus(status[2]);
    const existing = await findQuestByTitle(userId, title);
    if (!existing) throw new Error(`I couldn't find a quest named "${title}".`);
    await questService.updateQuest(userId, existing.id, { status: next });
    return {
      summary: `Marked quest **${existing.title}** as ${next}.`,
      operation: 'status',
      questId: existing.id,
      questTitle: existing.title,
    };
  }

  const rename = text.match(/\b(?:rename)\s+(?:the\s+)?quest\s+(.{1,60}?)\s+to\s+(.{1,60})$/i);
  if (rename) {
    const from = cleanName(rename[1]);
    const to = cleanName(rename[2]);
    const existing = await findQuestByTitle(userId, from);
    if (!existing) throw new Error(`I couldn't find a quest named "${from}".`);
    await questService.updateQuest(userId, existing.id, { title: to });
    return {
      summary: `Renamed the quest **${existing.title}** to **${to}**.`,
      operation: 'rename',
      questId: existing.id,
      questTitle: to,
    };
  }

  const del = text.match(
    /\b(?:delete|remove)\s+(?:the\s+)?quest\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+(?:my\s+)?quests?(?:\s+log)?\b/i,
  );
  if (del) {
    const title = cleanName(del[1] || del[2] || '');
    const existing = await findQuestByTitle(userId, title);
    if (!existing) throw new Error(`I couldn't find a quest named "${title}".`);
    await questStorage.deleteQuest(userId, existing.id);
    return {
      summary: `Deleted **${existing.title}** from the Quest Log.`,
      operation: 'delete',
      questId: existing.id,
      questTitle: existing.title,
    };
  }

  const create = text.match(
    /\b(?:add|save|put|create)\s+(.{1,80}?)\s+(?:as|to|into)\s+(?:a\s+|an\s+|my\s+)?quest(?:\s+log)?\b/i,
  );
  if (create) {
    const title = cleanName(create[1]);
    const existing = await findQuestByTitle(userId, title);
    if (existing) {
      return {
        summary: `**${existing.title}** is already in the Quest Log.`,
        operation: 'create',
        questId: existing.id,
        questTitle: existing.title,
      };
    }
    const quest = await questService.createQuest(userId, {
      title,
      description: 'Created via chat QUEST_WRITE',
      quest_type: 'side',
      source: 'manual',
    });
    return {
      summary: `Added **${quest.title}** to the Quest Log.`,
      operation: 'create',
      questId: quest.id,
      questTitle: quest.title,
    };
  }

  throw new Error(
    'Try “add Ship MemoVault as a quest”, “mark the quest X as done”, or “delete the quest X”.',
  );
}
