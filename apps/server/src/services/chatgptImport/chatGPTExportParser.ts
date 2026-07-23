import { createHash } from 'crypto';

import JSZip from 'jszip';

export type ChatGPTExportRole = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';

export type ChatGPTExportMessage = {
  id: string;
  role: ChatGPTExportRole;
  text: string;
  createdAt: string | null;
};

export type ChatGPTExportConversation = {
  id: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  messages: ChatGPTExportMessage[];
};

export type ChatGPTExportConversationSummary = {
  id: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  preview: string;
};

export type ChatGPTExportInventory = {
  conversations: ChatGPTExportConversationSummary[];
  conversationCount: number;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  earliestAt: string | null;
  latestAt: string | null;
  sourceFiles: string[];
};

type RawMessage = {
  id?: unknown;
  author?: { role?: unknown };
  create_time?: unknown;
  content?: { parts?: unknown[]; text?: unknown };
};

type RawNode = {
  id?: unknown;
  parent?: unknown;
  children?: unknown[];
  message?: RawMessage | null;
};

type RawConversation = {
  id?: unknown;
  conversation_id?: unknown;
  title?: unknown;
  create_time?: unknown;
  update_time?: unknown;
  current_node?: unknown;
  mapping?: Record<string, RawNode>;
  messages?: unknown[];
};

function isoFromEpoch(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const millis = value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function textFromPart(part: unknown): string {
  if (typeof part === 'string') return part;
  if (!part || typeof part !== 'object') return '';
  const record = part as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;
  return '';
}

function messageText(message: RawMessage): string {
  const parts = message.content?.parts;
  if (Array.isArray(parts)) return parts.map(textFromPart).filter(Boolean).join('\n').trim();
  return typeof message.content?.text === 'string' ? message.content.text.trim() : '';
}

function roleOf(value: unknown): ChatGPTExportRole {
  return value === 'user' || value === 'assistant' || value === 'system' || value === 'tool'
    ? value
    : 'unknown';
}

function activeBranchNodes(conversation: RawConversation): RawNode[] {
  const mapping = conversation.mapping ?? {};
  const currentId = typeof conversation.current_node === 'string' ? conversation.current_node : null;
  if (currentId && mapping[currentId]) {
    const branch: RawNode[] = [];
    const visited = new Set<string>();
    let nodeId: string | null = currentId;
    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node: RawNode = mapping[nodeId];
      branch.push(node);
      nodeId = typeof node.parent === 'string' ? node.parent : null;
    }
    return branch.reverse();
  }
  return Object.values(mapping).sort((a, b) => {
    const left = typeof a.message?.create_time === 'number' ? a.message.create_time : 0;
    const right = typeof b.message?.create_time === 'number' ? b.message.create_time : 0;
    return left - right;
  });
}

function parseConversation(raw: RawConversation, index: number): ChatGPTExportConversation {
  const rawMessages =
    raw.mapping && Object.keys(raw.mapping).length > 0
      ? activeBranchNodes(raw).map((node) => node.message).filter(Boolean)
      : Array.isArray(raw.messages)
        ? raw.messages
        : [];
  const messages: ChatGPTExportMessage[] = [];

  for (const [messageIndex, candidate] of rawMessages.entries()) {
    if (!candidate || typeof candidate !== 'object') continue;
    const message = candidate as RawMessage;
    const text = messageText(message);
    if (!text) continue;
    messages.push({
      id:
        typeof message.id === 'string'
          ? message.id
          : `message-${index}-${messageIndex}-${createHash('sha1').update(text).digest('hex').slice(0, 10)}`,
      role: roleOf(message.author?.role),
      text,
      createdAt: isoFromEpoch(message.create_time),
    });
  }

  const fallbackId = createHash('sha256')
    .update(`${String(raw.title ?? '')}:${messages.map((message) => message.id).join(':')}`)
    .digest('hex')
    .slice(0, 24);

  return {
    id:
      typeof raw.id === 'string'
        ? raw.id
        : typeof raw.conversation_id === 'string'
          ? raw.conversation_id
          : `chatgpt-${fallbackId}`,
    title:
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : `Untitled conversation ${index + 1}`,
    createdAt: isoFromEpoch(raw.create_time) ?? messages[0]?.createdAt ?? null,
    updatedAt: isoFromEpoch(raw.update_time) ?? messages.at(-1)?.createdAt ?? null,
    messages,
  };
}

function conversationArrays(value: unknown): RawConversation[] {
  if (Array.isArray(value)) return value.filter((item): item is RawConversation => !!item && typeof item === 'object');
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['conversations', 'items', 'data']) {
    if (Array.isArray(record[key])) return conversationArrays(record[key]);
  }
  return [];
}

async function jsonSources(
  buffer: Buffer,
  filename: string,
): Promise<Array<{ filename: string; value: unknown }>> {
  const isZip = filename.toLowerCase().endsWith('.zip') || buffer.subarray(0, 2).toString() === 'PK';
  if (!isZip) {
    return [{ filename, value: JSON.parse(buffer.toString('utf8')) }];
  }

  const archive = await JSZip.loadAsync(buffer);
  const candidates = Object.values(archive.files)
    .filter(
      (entry) =>
        !entry.dir &&
        /(?:^|\/)conversations(?:-\d+)?\.json$/i.test(entry.name),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (candidates.length === 0) {
    throw new Error('This ZIP does not contain conversations.json or numbered conversation JSON files.');
  }
  return Promise.all(
    candidates.map(async (entry) => ({
      filename: entry.name,
      value: JSON.parse(await entry.async('string')),
    })),
  );
}

export async function parseChatGPTExport(
  buffer: Buffer,
  filename: string,
): Promise<{ conversations: ChatGPTExportConversation[]; inventory: ChatGPTExportInventory }> {
  const sources = await jsonSources(buffer, filename);
  const byId = new Map<string, ChatGPTExportConversation>();
  let index = 0;
  for (const source of sources) {
    for (const raw of conversationArrays(source.value)) {
      const parsed = parseConversation(raw, index++);
      const existing = byId.get(parsed.id);
      if (!existing || parsed.messages.length > existing.messages.length) byId.set(parsed.id, parsed);
    }
  }

  const conversations = [...byId.values()].sort((a, b) =>
    String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')),
  );
  const timestamps = conversations
    .flatMap((conversation) => [conversation.createdAt, conversation.updatedAt])
    .filter((value): value is string => !!value)
    .sort();
  const summaries = conversations.map((conversation) => {
    const userMessages = conversation.messages.filter((message) => message.role === 'user');
    const assistantMessages = conversation.messages.filter((message) => message.role === 'assistant');
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      preview: (userMessages[0]?.text ?? conversation.messages[0]?.text ?? '').slice(0, 180),
    };
  });

  return {
    conversations,
    inventory: {
      conversations: summaries,
      conversationCount: summaries.length,
      messageCount: summaries.reduce((sum, item) => sum + item.messageCount, 0),
      userMessageCount: summaries.reduce((sum, item) => sum + item.userMessageCount, 0),
      assistantMessageCount: summaries.reduce((sum, item) => sum + item.assistantMessageCount, 0),
      earliestAt: timestamps[0] ?? null,
      latestAt: timestamps.at(-1) ?? null,
      sourceFiles: sources.map((source) => source.filename),
    },
  };
}
