/**
 * Pure, deterministic conversation-durability checks (Thread Durability Sprint).
 * No DB — used by threadRecoveryService and the durability tests so detection
 * logic has a single source of truth.
 */

export interface DurableMessage {
  id: string;
  role: 'user' | 'assistant' | string;
  content: string;
  created_at: string;
}

/** Count user turns that never received an assistant reply (interleaved scan). */
export function countMissingAssistantTurns(msgs: Array<{ role: string }>): number {
  let missing = 0;
  for (let i = 0; i < msgs.length; i += 1) {
    if (msgs[i].role !== 'user') continue;
    let answered = false;
    for (let j = i + 1; j < msgs.length; j += 1) {
      if (msgs[j].role === 'assistant') { answered = true; break; }
      if (msgs[j].role === 'user') break; // next user turn started without a reply
    }
    if (!answered) missing += 1;
  }
  return missing;
}

/** A thread's updated_at is stale if it predates its last message (beyond tolerance). */
export function hasOrderingConflict(updatedAtIso: string, lastMessageIso: string, toleranceMs = 1000): boolean {
  return new Date(updatedAtIso).getTime() < new Date(lastMessageIso).getTime() - toleranceMs;
}

function fingerprint(role: string, content: string): string {
  return `${role}:${content.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/** Rank real DB ids above synthetic client ids when deduping. */
function sourceRank(id: string): number {
  return /^(meta-|user-|assistant-|temp-)/.test(id) ? 0 : 1;
}

/**
 * Merge message sources (canonical chat_messages + ingestion + snapshot + any
 * client-optimistic rows) into one ordered, de-duplicated list. Guarantees:
 *  - no duplicate (same role+content) message — fixes duplicate-send / multi-tab
 *  - a real DB row always wins over a synthetic optimistic row
 *  - chronological order, user-before-assistant on ties
 */
export function dedupeMessages(sources: DurableMessage[][]): DurableMessage[] {
  const byFingerprint = new Map<string, DurableMessage>();
  for (const source of sources) {
    for (const m of source) {
      if (!m.content.trim()) continue;
      const fp = fingerprint(m.role, m.content);
      const existing = byFingerprint.get(fp);
      if (!existing || sourceRank(m.id) > sourceRank(existing.id)) byFingerprint.set(fp, m);
    }
  }
  return [...byFingerprint.values()].sort((a, b) => {
    const dt = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (dt !== 0) return dt;
    if (a.role === b.role) return 0;
    return a.role === 'user' ? -1 : 1;
  });
}
