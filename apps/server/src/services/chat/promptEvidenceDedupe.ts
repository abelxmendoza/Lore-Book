/**
 * Collapse duplicate canonical evidence before it reaches the answer prompt.
 * Same source id / same occurrence should appear once, with provenance.
 * Distinct perspectives (different source ids, different wording that is
 * not a paraphrase of the same event) are kept.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import type { WorkingMemoryItem } from './workingMemoryAssembler';

export type PromptEvidenceBlock = {
  id: string;
  title: string;
  content: string;
  source?: string;
  date?: string | null;
  confidence?: number;
  score?: number;
};

const SOURCE_ID_KEYS = ['sourceId', 'source_id', 'canonical_event_id', 'resolved_event_id', 'event_id'];

function canonicalKey(item: { id?: string; title?: string; content?: string; metadata?: Record<string, unknown> }): string {
  const meta = item.metadata ?? {};
  for (const key of SOURCE_ID_KEYS) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return `src:${value}`;
  }
  const sourceIds = meta.sourceIds ?? meta.source_ids;
  if (Array.isArray(sourceIds) && typeof sourceIds[0] === 'string') return `src:${sourceIds[0]}`;
  if (item.id?.startsWith('event:') || item.id?.startsWith('episode:')) return item.id;
  const contentKey = normalizeNameKey(`${item.title ?? ''} ${item.content ?? ''}`.slice(0, 180));
  return contentKey ? `text:${contentKey}` : `id:${item.id ?? ''}`;
}

export function dedupePromptEvidence<T extends { id?: string; title?: string; content?: string; metadata?: Record<string, unknown> }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = canonicalKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function workingMemoryItemsToUniqueBlocks(
  groups: WorkingMemoryItem[][],
): PromptEvidenceBlock[] {
  const merged = groups.flat();
  return dedupePromptEvidence(merged).map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    source: item.source,
    date: item.date ?? null,
    confidence: item.confidence,
    score: item.score,
  }));
}
