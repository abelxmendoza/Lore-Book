import type { Message } from '../message/ChatMessage';

/** Assistant protocol fields that must survive durable row hydration. */
const PROTOCOL_HOIST_KEYS = [
  'mentionedEntities',
  'creationOutcomes',
  'creationOutcomeSummary',
  'staleProjectionHints',
  'staleProjectionSummary',
] as const;

type ProtocolHoistKey = (typeof PROTOCOL_HOIST_KEYS)[number];

function hasProtocolValue(key: ProtocolHoistKey, value: Message[ProtocolHoistKey]): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

function mergeProtocolFields(preferred: Message, fallback: Message): Message {
  const merged = { ...preferred };
  for (const key of PROTOCOL_HOIST_KEYS) {
    if (!hasProtocolValue(key, merged[key]) && hasProtocolValue(key, fallback[key])) {
      (merged as Record<string, unknown>)[key] = fallback[key];
    }
  }
  return merged;
}

function fingerprint(role: string, content: string): string {
  return `${role}:${content.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

function sourceRank(id: string): number {
  return /^(meta-|user-|assistant-|temp-|error-|command-|authwall-|guestwall-|upload-assistant-|greeting-)/.test(id)
    ? 0
    : 1;
}

function mergePersistStatus(
  a?: Message['persistStatus'],
  b?: Message['persistStatus']
): Message['persistStatus'] | undefined {
  if (a === 'saved' || b === 'saved') return 'saved';
  if (a === 'failed' || b === 'failed') return 'failed';
  return a ?? b;
}

function toRow(m: Message) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    created_at: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp ?? new Date().toISOString()),
    message: m,
  };
}

/**
 * Merge local (optimistic/streaming) and server messages without dropping assistant turns.
 * Real DB ids win over synthetic client ids for the same role+content fingerprint.
 */
export function mergeThreadMessages(local: Message[], server: Message[]): Message[] {
  const byFingerprint = new Map<string, ReturnType<typeof toRow>>();

  for (const m of [...local, ...server]) {
    if (!m.content?.trim() && !m.isStreaming) continue;
    const row = toRow(m);
    const fp = fingerprint(row.role, row.content || ' ');
    const existing = byFingerprint.get(fp);
    if (!existing || sourceRank(row.id) > sourceRank(existing.id)) {
      const message =
        existing && sourceRank(row.id) > sourceRank(existing.id)
          ? mergeProtocolFields(row.message, existing.message)
          : row.message;
      byFingerprint.set(fp, {
        ...row,
        message: {
          ...message,
          persistStatus: mergePersistStatus(message.persistStatus, existing?.message.persistStatus),
        },
      });
    } else {
      const merged = mergeProtocolFields(existing.message, row.message);
      if (merged !== existing.message || row.message.persistStatus === 'saved') {
        byFingerprint.set(fp, {
          ...existing,
          message: {
            ...merged,
            persistStatus: mergePersistStatus(merged.persistStatus, row.message.persistStatus),
          },
        });
      }
    }
  }

  // Keep in-flight streaming assistant rows even when content is still empty.
  for (const m of local) {
    if (m.isStreaming && m.role === 'assistant') {
      const fp = `streaming:${m.id}`;
      byFingerprint.set(fp, toRow(m));
    }
  }

  return [...byFingerprint.values()]
    .sort((a, b) => {
      const dt = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (dt !== 0) return dt;
      if (a.role === b.role) return 0;
      return a.role === 'user' ? -1 : 1;
    })
    .map((row) => row.message);
}

export function countMissingAssistantTurns(messages: Message[]): number {
  let missing = 0;
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].role !== 'user') continue;
    let answered = false;
    for (let j = i + 1; j < messages.length; j += 1) {
      if (messages[j].role === 'assistant' && (messages[j].content?.trim() || messages[j].isStreaming)) {
        answered = true;
        break;
      }
      if (messages[j].role === 'user') break;
    }
    if (!answered) missing += 1;
  }
  return missing;
}
