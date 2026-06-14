/**
 * Thread Explorer Service
 *
 * Fast traversal of chat threads using titles, entity chips, message text,
 * crystallized knowledge, and chat_messages recall.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type ThreadSnippet = {
  role: 'user' | 'assistant';
  excerpt: string;
  messageIndex?: number;
  messageId?: string;
};

export type ThreadKnowledgeHit = {
  id: string;
  claim: string;
  confidence: number;
  knowledgeType?: string;
};

export type ThreadExploreHit = {
  threadId: string;
  title: string;
  subtitle?: string;
  updatedAt: string;
  score: number;
  messageCount: number;
  matchReasons: string[];
  snippets: ThreadSnippet[];
  entities: string[];
  knowledge: ThreadKnowledgeHit[];
};

export type ThreadFacets = {
  entities: Array<{ name: string; count: number }>;
  subtitles: Array<{ label: string; count: number }>;
  totalThreads: number;
  totalMessages: number;
};

export type ThreadContext = {
  threadId: string;
  title: string;
  subtitle?: string;
  updatedAt: string;
  entities: string[];
  messageCount: number;
  messages: Array<{
    index: number;
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt?: string;
  }>;
  knowledge: ThreadKnowledgeHit[];
  extractedSummary: string[];
  keywords: string[];
};

type ParsedThread = {
  id: string;
  title: string;
  subtitle?: string;
  updatedAt: string;
  entities: string[];
  messages: Array<{ role: 'user' | 'assistant'; content: string; id?: string; createdAt?: string }>;
};

const STOP = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'have', 'from', 'about',
  'what', 'when', 'where', 'how', 'why', 'just', 'like', 'been', 'were', 'was', 'are',
  'chat', 'tell', 'know', 'remember', 'think', 'really', 'would', 'could', 'should',
]);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t));
}

function excerptAround(text: string, term: string, radius = 80): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + term.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function parseMetadataMessages(metadata: Record<string, unknown> | null | undefined): ParsedThread['messages'] {
  const raw = metadata?.messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: Record<string, unknown>, index) => {
      const content = typeof m.content === 'string' ? m.content : '';
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      return {
        role,
        content,
        id: typeof m.id === 'string' ? m.id : undefined,
        createdAt: typeof m.timestamp === 'string' ? m.timestamp : undefined,
      };
    })
    .filter(m => m.content.trim().length > 0);
}

function parseThread(row: {
  id: string;
  title: string | null;
  updated_at: string;
  metadata: Record<string, unknown> | null;
}): ParsedThread {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const entities = Array.isArray(meta.dominantEntities)
    ? (meta.dominantEntities as string[]).filter(Boolean)
    : [];
  return {
    id: row.id,
    title: row.title ?? 'New chat',
    subtitle: typeof meta.subtitle === 'string' ? meta.subtitle : undefined,
    updatedAt: row.updated_at,
    entities,
    messages: parseMetadataMessages(meta),
  };
}

function scoreThread(
  thread: ParsedThread,
  terms: string[],
  entityFilter?: string,
  knowledgeByThread?: Map<string, ThreadKnowledgeHit[]>
): { score: number; reasons: string[]; snippets: ThreadSnippet[] } {
  let score = 0;
  const reasons: string[] = [];
  const snippets: ThreadSnippet[] = [];
  const titleLower = thread.title.toLowerCase();
  const subtitleLower = thread.subtitle?.toLowerCase() ?? '';

  if (entityFilter) {
    const ef = entityFilter.toLowerCase();
    const entityHit = thread.entities.some(e => e.toLowerCase().includes(ef));
    const messageHit = thread.messages.some(m => m.content.toLowerCase().includes(ef));
    if (entityHit || messageHit) {
      score += 60;
      reasons.push(`entity:${entityFilter}`);
    } else {
      return { score: 0, reasons: [], snippets: [] };
    }
  }

  for (const term of terms) {
    if (titleLower.includes(term)) {
      score += 24;
      reasons.push('title');
    }
    if (subtitleLower.includes(term)) {
      score += 16;
      reasons.push('subtitle');
    }
    for (const entity of thread.entities) {
      if (entity.toLowerCase().includes(term)) {
        score += 28;
        reasons.push(`entity:${entity}`);
      }
    }
    thread.messages.forEach((m, index) => {
      if (m.content.toLowerCase().includes(term)) {
        score += 12;
        reasons.push('message');
        if (snippets.length < 4) {
          snippets.push({
            role: m.role,
            excerpt: excerptAround(m.content, term),
            messageIndex: index,
            messageId: m.id,
          });
        }
      }
    });
  }

  const linkedKnowledge = knowledgeByThread?.get(thread.id) ?? [];
  for (const k of linkedKnowledge) {
    const claimLower = k.claim.toLowerCase();
    if (terms.some(t => claimLower.includes(t))) {
      score += 18 + k.confidence * 10;
      reasons.push('knowledge');
    }
  }

  const ageDays = (Date.now() - new Date(thread.updatedAt).getTime()) / 86_400_000;
  score += Math.max(0, 12 - ageDays * 0.35);

  if (thread.messages.length > 0) score += Math.min(5, thread.messages.length * 0.2);

  return {
    score,
    reasons: [...new Set(reasons)],
    snippets,
  };
}

function topKeywords(threads: ParsedThread[], limit = 24): string[] {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    for (const entity of thread.entities) {
      const key = entity.trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const m of thread.messages.slice(0, 8)) {
      for (const term of tokenize(m.content)) {
        if (term.length < 4) continue;
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

class ThreadExplorerService {
  private async loadThreads(userId: string, max = 200): Promise<ParsedThread[]> {
    const { data, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, title, updated_at, metadata')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(max);

    if (error) {
      logger.warn({ error, userId }, 'Thread explorer failed to load sessions');
      return [];
    }

    const threads = (data ?? []).map(parseThread);

    // Merge chat_messages when metadata is empty but ingestion stored rows
    const sparseIds = threads.filter(t => t.messages.length === 0).map(t => t.id);
    if (sparseIds.length > 0) {
      const { data: chatRows } = await supabaseAdmin
        .from('chat_messages')
        .select('id, session_id, role, content, created_at')
        .eq('user_id', userId)
        .in('session_id', sparseIds)
        .order('created_at', { ascending: true });

      const bySession = new Map<string, ParsedThread['messages']>();
      for (const row of chatRows ?? []) {
        const sid = row.session_id as string;
        if (!bySession.has(sid)) bySession.set(sid, []);
        bySession.get(sid)!.push({
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: row.content ?? '',
          id: row.id,
          createdAt: row.created_at,
        });
      }

      for (const thread of threads) {
        if (thread.messages.length === 0 && bySession.has(thread.id)) {
          thread.messages = bySession.get(thread.id)!;
        }
      }
    }

    return threads;
  }

  private async loadKnowledgeForThreads(userId: string, threadIds: string[]): Promise<Map<string, ThreadKnowledgeHit[]>> {
    const result = new Map<string, ThreadKnowledgeHit[]>();
    if (threadIds.length === 0) return result;

    const { data: claims } = await supabaseAdmin
      .from('crystallized_knowledge')
      .select('id, human_readable_claim, confidence, knowledge_type, status')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .gte('confidence', 0.45)
      .order('confidence', { ascending: false })
      .limit(120);

    if (!claims?.length) return result;

    const claimIds = claims.map(c => c.id);
    const { data: links } = await supabaseAdmin
      .from('knowledge_evidence_links')
      .select('knowledge_id, evidence_id, evidence_type, evidence_summary')
      .eq('user_id', userId)
      .in('knowledge_id', claimIds);

    const claimById = new Map(claims.map(c => [c.id, c]));

    // Map session → message ids from metadata + chat_messages
    const sessionMessageIds = new Map<string, Set<string>>();
    const { data: sessions } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, metadata')
      .eq('user_id', userId)
      .in('id', threadIds);

    for (const s of sessions ?? []) {
      const ids = new Set<string>();
      for (const m of parseMetadataMessages(s.metadata as Record<string, unknown>)) {
        if (m.id) ids.add(m.id);
      }
      sessionMessageIds.set(s.id, ids);
    }

    const { data: chatMsgs } = await supabaseAdmin
      .from('chat_messages')
      .select('id, session_id')
      .eq('user_id', userId)
      .in('session_id', threadIds);

    for (const cm of chatMsgs ?? []) {
      const sid = cm.session_id as string;
      if (!sessionMessageIds.has(sid)) sessionMessageIds.set(sid, new Set());
      sessionMessageIds.get(sid)!.add(cm.id);
    }

    for (const link of links ?? []) {
      const evidenceId = link.evidence_id as string;
      const claim = claimById.get(link.knowledge_id);
      if (!claim) continue;

      for (const [threadId, msgIds] of sessionMessageIds) {
        if (!msgIds.has(evidenceId)) continue;
        const hit: ThreadKnowledgeHit = {
          id: claim.id,
          claim: claim.human_readable_claim,
          confidence: claim.confidence,
          knowledgeType: claim.knowledge_type,
        };
        if (!result.has(threadId)) result.set(threadId, []);
        const list = result.get(threadId)!;
        if (!list.some(k => k.id === hit.id)) list.push(hit);
      }
    }

    // Fallback: attach top claims to threads when searching by claim text (no evidence link)
    for (const threadId of threadIds) {
      if (!result.has(threadId)) result.set(threadId, []);
    }

    return result;
  }

  async explore(
    userId: string,
    options?: { q?: string; entity?: string; limit?: number; since?: string }
  ): Promise<{ hits: ThreadExploreHit[]; facets: ThreadFacets; query: string | null }> {
    const limit = Math.min(options?.limit ?? 25, 50);
    const q = options?.q?.trim() ?? '';
    const terms = tokenize(q);
    const since = options?.since ? new Date(options.since).getTime() : null;

    let threads = await this.loadThreads(userId);
    if (since) {
      threads = threads.filter(t => new Date(t.updatedAt).getTime() >= since);
    }

    const facets = this.buildFacets(threads);
    const threadIds = threads.map(t => t.id);
    const knowledgeByThread =
      terms.length > 0 || options?.entity
        ? await this.loadKnowledgeForThreads(userId, threadIds)
        : new Map<string, ThreadKnowledgeHit[]>();

    // Supplement knowledge hits by claim text match
    if (terms.length > 0) {
      const { data: claims } = await supabaseAdmin
        .from('crystallized_knowledge')
        .select('id, human_readable_claim, confidence, knowledge_type')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .gte('confidence', 0.5)
        .limit(80);

      for (const claim of claims ?? []) {
        const claimLower = claim.human_readable_claim.toLowerCase();
        if (!terms.some(t => claimLower.includes(t))) continue;
        const hit: ThreadKnowledgeHit = {
          id: claim.id,
          claim: claim.human_readable_claim,
          confidence: claim.confidence,
          knowledgeType: claim.knowledge_type,
        };
        for (const thread of threads) {
          const threadText = [
            thread.title,
            thread.subtitle ?? '',
            ...thread.entities,
            ...thread.messages.map(m => m.content),
          ].join(' ').toLowerCase();
          if (terms.some(t => threadText.includes(t))) {
            if (!knowledgeByThread.has(thread.id)) knowledgeByThread.set(thread.id, []);
            const list = knowledgeByThread.get(thread.id)!;
            if (!list.some(k => k.id === hit.id) && list.length < 3) list.push(hit);
          }
        }
      }
    }

    const hits: ThreadExploreHit[] = [];

    for (const thread of threads) {
      const { score, reasons, snippets } = scoreThread(
        thread,
        terms,
        options?.entity,
        knowledgeByThread
      );

      if (terms.length === 0 && !options?.entity) {
        hits.push({
          threadId: thread.id,
          title: thread.title,
          subtitle: thread.subtitle,
          updatedAt: thread.updatedAt,
          score: score || 1,
          messageCount: thread.messages.length,
          matchReasons: ['recent'],
          snippets: thread.messages.slice(-1).map((m, i) => ({
            role: m.role,
            excerpt: m.content.slice(0, 160),
            messageIndex: thread.messages.length - 1 - i,
            messageId: m.id,
          })),
          entities: thread.entities,
          knowledge: (knowledgeByThread.get(thread.id) ?? []).slice(0, 3),
        });
        continue;
      }

      if (score <= 0) continue;

      hits.push({
        threadId: thread.id,
        title: thread.title,
        subtitle: thread.subtitle,
        updatedAt: thread.updatedAt,
        score,
        messageCount: thread.messages.length,
        matchReasons: reasons,
        snippets,
        entities: thread.entities,
        knowledge: (knowledgeByThread.get(thread.id) ?? []).slice(0, 3),
      });
    }

    hits.sort((a, b) => b.score - a.score || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return {
      hits: hits.slice(0, limit),
      facets,
      query: q || null,
    };
  }

  buildFacets(threads: ParsedThread[]): ThreadFacets {
    const entityCounts = new Map<string, number>();
    const subtitleCounts = new Map<string, number>();
    let totalMessages = 0;

    for (const t of threads) {
      totalMessages += t.messages.length;
      for (const e of t.entities) {
        entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1);
      }
      if (t.subtitle) subtitleCounts.set(t.subtitle, (subtitleCounts.get(t.subtitle) ?? 0) + 1);
    }

    return {
      entities: [...entityCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count })),
      subtitles: [...subtitleCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([label, count]) => ({ name: label, count })),
      totalThreads: threads.length,
      totalMessages,
    };
  }

  async getFacets(userId: string): Promise<ThreadFacets & { keywords: string[] }> {
    const threads = await this.loadThreads(userId);
    return {
      ...this.buildFacets(threads),
      keywords: topKeywords(threads),
    };
  }

  async getThreadContext(userId: string, threadId: string): Promise<ThreadContext | null> {
    const { data: row, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, title, updated_at, metadata')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single();

    if (error || !row) return null;

    const thread = parseThread(row);

    if (thread.messages.length === 0) {
      const { data: chatRows } = await supabaseAdmin
        .from('chat_messages')
        .select('id, role, content, created_at')
        .eq('user_id', userId)
        .eq('session_id', threadId)
        .order('created_at', { ascending: true });
      thread.messages = (chatRows ?? []).map(r => ({
        role: r.role === 'assistant' ? 'assistant' : 'user',
        content: r.content ?? '',
        id: r.id,
        createdAt: r.created_at,
      }));
    }

    const knowledgeMap = await this.loadKnowledgeForThreads(userId, [threadId]);
    const knowledge = knowledgeMap.get(threadId) ?? [];

    // Extracted units summary via conversation_messages path
    const extractedSummary: string[] = [];
    const { data: convMsgs } = await supabaseAdmin
      .from('conversation_messages')
      .select('id')
      .eq('session_id', threadId)
      .eq('user_id', userId)
      .limit(40);

    if (convMsgs?.length) {
      const msgIds = convMsgs.map(m => m.id);
      const { data: utterances } = await supabaseAdmin
        .from('utterances')
        .select('id')
        .in('message_id', msgIds)
        .eq('user_id', userId)
        .limit(60);

      if (utterances?.length) {
        const { data: units } = await supabaseAdmin
          .from('extracted_units')
          .select('content, type, confidence')
          .in('utterance_id', utterances.map(u => u.id))
          .eq('user_id', userId)
          .order('confidence', { ascending: false })
          .limit(12);

        for (const u of units ?? []) {
          if (typeof u.content === 'string' && u.content.trim()) {
            extractedSummary.push(u.content.trim().slice(0, 200));
          }
        }
      }
    }

    return {
      threadId: thread.id,
      title: thread.title,
      subtitle: thread.subtitle,
      updatedAt: thread.updatedAt,
      entities: thread.entities,
      messageCount: thread.messages.length,
      messages: thread.messages.map((m, index) => ({
        index,
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
      knowledge,
      extractedSummary,
      keywords: topKeywords([thread], 12),
    };
  }
}

export const threadExplorerService = new ThreadExplorerService();
