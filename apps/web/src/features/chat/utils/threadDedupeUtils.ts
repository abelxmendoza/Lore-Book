import type { Message } from '../message/ChatMessage';
import { DRAFT_THREAD_TITLE, isGenericThreadTitle, resolveThreadDisplayTitle } from './threadTitleUtils';

export type DedupeableThread = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
};

function normalizeContent(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Stable fingerprint for a conversation — null when empty. */
export function conversationFingerprint(
  messages: Array<{ role: string; content: string }>
): string | null {
  const parts = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
    .map((m) => `${m.role === 'user' ? 'u' : 'a'}:${normalizeContent(m.content)}`);
  if (parts.length === 0) return null;
  return parts.join('\n');
}

function pickSurvivor(threads: DedupeableThread[]): DedupeableThread {
  return [...threads].sort((a, b) => {
    if (b.messages.length !== a.messages.length) return b.messages.length - a.messages.length;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  })[0];
}

/** Remove duplicate thread IDs and identical conversations; keep one empty draft. */
export function dedupeConversationThreads(threads: DedupeableThread[]): DedupeableThread[] {
  const byId = new Map<string, DedupeableThread>();
  for (const t of threads) byId.set(t.id, t);

  let unique = Array.from(byId.values());

  const byFingerprint = new Map<string, DedupeableThread[]>();
  for (const t of unique) {
    const fp = conversationFingerprint(t.messages);
    if (!fp) continue;
    const group = byFingerprint.get(fp) ?? [];
    group.push(t);
    byFingerprint.set(fp, group);
  }

  const dropIds = new Set<string>();
  for (const group of byFingerprint.values()) {
    if (group.length <= 1) continue;
    const survivor = pickSurvivor(group);
    for (const t of group) {
      if (t.id !== survivor.id) dropIds.add(t.id);
    }
  }

  const emptyDrafts = unique.filter(
    (t) => t.messages.length === 0 && isGenericThreadTitle(t.title)
  );
  if (emptyDrafts.length > 1) {
    const keep = pickSurvivor(emptyDrafts);
    for (const t of emptyDrafts) {
      if (t.id !== keep.id) dropIds.add(t.id);
    }
  }

  unique = unique.filter((t) => !dropIds.has(t.id));
  return unique.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Sidebar labels — disambiguate threads that share the same resolved title. */
export function disambiguateThreadTitles(threads: DedupeableThread[]): Map<string, string> {
  const labels = new Map<string, string>();
  const groups = new Map<string, DedupeableThread[]>();

  for (const t of threads) {
    const base = resolveThreadDisplayTitle(t);
    const key = base.trim().toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    if (group.length === 1) {
      labels.set(group[0].id, resolveThreadDisplayTitle(group[0]));
      continue;
    }
    const sorted = [...group].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    for (const t of sorted) {
      const base = resolveThreadDisplayTitle(t);
      const d = new Date(t.updatedAt);
      const stamp = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      labels.set(t.id, `${base} · ${stamp}`);
    }
  }

  return labels;
}

/** Pick a title that does not collide with other in-memory threads. */
export function ensureLocalUniqueTitle(
  title: string,
  threadId: string,
  threads: DedupeableThread[]
): string {
  const base = title.trim();
  if (!base) return base;
  const clash = threads.some(
    (t) => t.id !== threadId && t.title.trim().toLowerCase() === base.toLowerCase()
  );
  if (!clash) return base;
  const self = threads.find((t) => t.id === threadId);
  const stamp = new Date(self?.updatedAt ?? Date.now()).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  return `${base} · ${stamp}`;
}

export function isEmptyDraftThread(t: DedupeableThread): boolean {
  return t.messages.length === 0 && isGenericThreadTitle(t.title);
}
