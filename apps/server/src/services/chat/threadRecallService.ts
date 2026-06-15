/**
 * Sprint AH — Thread Recall Layer (Phase 2)
 *
 * Answers "what did I say earlier?" from the CURRENT THREAD first.
 * Never falls through to empty journal search when thread context exists.
 */

import { supabaseAdmin } from '../supabaseClient';
import { buildConversationSummaryWithRosterFallback } from './conversationSummaryBuilder';

type HistoryMessage = { role: string; content: string };

export const THREAD_RECALL_RE =
  /\b(what did i (just )?(say|tell|mention|share)|what were we (talking|discussing) about|what happened in this (conversation|chat|thread)|do you remember what i (just )?(said|told|mentioned)|what did you (just )?hear|what have i (said|told|shared) (so far|today|here|in this)|what was i (saying|talking about)|remind me what i (said|told)|recap (this )?(conversation|chat|thread))\b/i;

function extractPeople(text: string): string[] {
  const names = text.match(/\b[A-ZÁÉÍÓÚÑ][a-z]+(?:\s+(?:de|del|la|T[ií]o|T[ií]a)\s+)?[A-ZÁÉÍÓÚÑ][a-z]+(?:\s+[A-ZÁÉÍÓÚÑ][a-z]+)*/g) ?? [];
  return [...new Set(names)].slice(0, 12);
}

function extractPlaces(text: string): string[] {
  const places = new Set<string>();
  for (const m of text.matchAll(/\b(?:at|in|from|near)\s+(?:the\s+)?([A-Z][\w\s.'-]{2,40})/g)) {
    const p = m[1]?.trim();
    if (p && p.length > 2) places.add(p);
  }
  return [...places].slice(0, 8);
}

function extractEvents(text: string): string[] {
  const events: string[] = [];
  const patterns = [
    /\b(graduation|party|wedding|funeral|birthday|concert|meeting|interview|trip|vacation|dinner|lunch)\b/gi,
    /\b(went to|attended|celebrated|visited)\s+[^.!?]{5,60}/gi,
  ];
  for (const pat of patterns) {
    for (const m of text.matchAll(pat)) {
      events.push(m[0].trim());
    }
  }
  return [...new Set(events)].slice(0, 6);
}

async function loadThreadHistory(
  userId: string,
  threadId: string | undefined,
  clientHistory: HistoryMessage[]
): Promise<HistoryMessage[]> {
  if (!threadId) return clientHistory;

  const { data: rows } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .eq('session_id', threadId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (!rows?.length) return clientHistory;

  const dbHistory = rows.map((r) => ({
    role: r.role as string,
    content: r.content as string,
  }));

  // Prefer DB history when it is richer than the client slice
  return dbHistory.length >= clientHistory.length ? dbHistory : clientHistory;
}

function formatUserSaidBlock(history: HistoryMessage[]): string {
  const userMessages = history.filter((m) => m.role === 'user');
  if (userMessages.length === 0) return '';

  const lines = ['**What you said in this thread:**', ''];
  for (const msg of userMessages.slice(-8)) {
    const preview = msg.content.replace(/\s+/g, ' ').trim();
    lines.push(`• ${preview.slice(0, 280)}${preview.length > 280 ? '…' : ''}`);
  }
  return lines.join('\n');
}

export function matchesThreadRecallQuery(message: string): boolean {
  return THREAD_RECALL_RE.test(message.trim());
}

export async function buildThreadRecall(
  userId: string,
  message: string,
  options: {
    conversationHistory: HistoryMessage[];
    threadId?: string;
  }
): Promise<{ content: string; hasContent: boolean; confidence: number }> {
  const history = await loadThreadHistory(
    userId,
    options.threadId,
    options.conversationHistory
  );

  if (history.length === 0) {
    return {
      content: 'This thread is empty so far — nothing to recall yet.',
      hasContent: false,
      confidence: 0.3,
    };
  }

  const userText = history
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  const people = extractPeople(userText);
  const places = extractPlaces(userText);
  const events = extractEvents(userText);

  const parts: string[] = [];

  const saidBlock = formatUserSaidBlock(history);
  if (saidBlock) parts.push(saidBlock);

  const summary = await buildConversationSummaryWithRosterFallback(userId, history);
  if (summary && !summary.includes('No messages in this conversation')) {
    parts.push(summary);
  }

  const extracted: string[] = [];
  if (people.length) extracted.push(`**People:** ${people.join(', ')}`);
  if (places.length) extracted.push(`**Places:** ${places.join(', ')}`);
  if (events.length) extracted.push(`**Events/topics:** ${events.join('; ')}`);
  if (extracted.length) {
    parts.push('', '**Extracted from this thread:**', ...extracted);
  }

  const content = parts.filter(Boolean).join('\n\n').trim();
  const hasContent = userText.trim().length > 20;

  return {
    content: content || saidBlock || 'I have this thread open but no substantive user messages yet.',
    hasContent,
    confidence: hasContent ? 0.95 : 0.4,
  };
}
