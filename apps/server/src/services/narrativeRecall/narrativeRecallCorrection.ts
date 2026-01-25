/**
 * Phase 4.5 — Narrative Recall + Correction
 * Recall expansion ("the whole thing"), correction intent and application,
 * and narrative fallback from journal when story DB is empty.
 */

import { correctionService } from '../correctionService';
import { memoryService } from '../memoryService';

const EXPAND_PHRASES = [
  'the whole thing',
  'full account',
  'everything you remember',
  'tell me the whole story',
  'all of it',
  'the full version',
];

const CORRECTION_PHRASES = [
  'actually',
  "that's wrong",
  'that\'s wrong',
  'no, it was',
  'correction',
  'edit:',
  'i meant',
  'fix that',
];

export function shouldExpandRecall(userMessage: string): boolean {
  const t = userMessage.toLowerCase().trim();
  return EXPAND_PHRASES.some((p) => t.includes(p));
}

export async function expandRecallFromContext(
  userId: string,
  recallSources: Array<{ entry_id: string }>
): Promise<{ mode: string; narrative: string; sources: string[] } | null> {
  const entryIds = recallSources.map((s) => s.entry_id).filter(Boolean);
  if (entryIds.length === 0) return null;

  const entries = await memoryService.getEntriesByIds(userId, entryIds);
  if (entries.length === 0) return null;

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const narrative = entries.map((e) => e.content).join('\n\n');

  return {
    mode: 'FULL_ACCOUNT',
    narrative,
    sources: entryIds,
  };
}

export async function narrativeFromJournalFallback(
  userId: string,
  query: string
): Promise<{ narrative: string; derived_from: string } | null> {
  const entries = await memoryService.semanticSearchEntries(userId, query, 10);
  if (entries.length === 0) return null;

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const narrative = entries.map((e) => e.content).join('\n\n');

  return {
    narrative,
    derived_from: 'journal_entries',
  };
}

export function isCorrectionIntent(
  userMessage: string,
  lastAssistantMessage: { metadata?: { recall_sources?: unknown[] } }
): boolean {
  if (!lastAssistantMessage?.metadata?.recall_sources?.length) return false;
  const t = userMessage.toLowerCase().trim();
  return CORRECTION_PHRASES.some((p) => t.includes(p));
}

export async function applyRecallCorrection(
  userId: string,
  userMessage: string,
  recallSources: Array<{ entry_id: string }>
): Promise<{ confirmation: string; entry_id: string } | null> {
  const targetEntryId = recallSources[0]?.entry_id;
  if (!targetEntryId) return null;

  try {
    await correctionService.addCorrection(userId, targetEntryId, {
      correctedContent: userMessage,
      reason: 'User correction via recall',
    });
    return {
      confirmation: 'Correction applied.',
      entry_id: targetEntryId,
    };
  } catch {
    return null;
  }
}

export interface FollowupRecallContext {
  userId: string;
  userMessage: string;
  lastAssistantMessage: {
    content: string;
    metadata?: { recall_sources?: Array<{ entry_id: string }> };
  };
}

export async function handleFollowupAfterRecall(
  ctx: FollowupRecallContext
): Promise<{ content: string; response_mode: string; metadata?: object } | null> {
  const sources = ctx.lastAssistantMessage.metadata?.recall_sources ?? [];

  if (shouldExpandRecall(ctx.userMessage)) {
    const r = await expandRecallFromContext(ctx.userId, sources);
    if (r)
      return {
        content: r.narrative,
        response_mode: 'FULL_ACCOUNT',
        metadata: { mode: r.mode, sources: r.sources },
      };
  }

  if (isCorrectionIntent(ctx.userMessage, ctx.lastAssistantMessage)) {
    const r = await applyRecallCorrection(ctx.userId, ctx.userMessage, sources);
    if (r)
      return {
        content: r.confirmation,
        response_mode: 'CORRECTION_APPLIED',
        metadata: { entry_id: r.entry_id },
      };
  }

  return null;
}
