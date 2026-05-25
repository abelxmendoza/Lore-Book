/**
 * ConversationTitleService
 *
 * Generates semantic, narrative-aware titles (and subtitles) for conversation threads.
 * A title is the first stable anchor of a conversation's identity.
 *
 * Principles:
 * - Titles are episode names, not truncated messages
 * - LLM path: gpt-4o-mini, single JSON call produces title + subtitle
 * - Keyword fallback if LLM is unavailable (billing 429, etc.)
 * - Never overwrites a user-renamed title (detected via titleSource flag)
 * - Called once after the first assistant response, never again unless explicitly triggered
 */

import { logger } from '../../logger';
import { openai } from '../../lib/openai';
import { supabaseAdmin } from '../supabaseClient';

export interface TitleInput {
  userId: string;
  threadId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Entity names detected by the ingestion pipeline, if available */
  entities?: string[];
  /** Mode the router chose (EMOTIONAL_EXISTENTIAL, MEMORY_RECALL, etc.) */
  modeDecision?: string;
}

export interface TitleOutput {
  title: string;
  subtitle?: string;
}

// Stop-words for keyword fallback
const STOP = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'it',
  'a', 'an', 'the', 'and', 'but', 'or', 'so', 'to', 'of', 'in', 'on',
  'at', 'for', 'with', 'is', 'was', 'are', 'were', 'be', 'been', 'have',
  'has', 'had', 'do', 'did', 'will', 'would', 'can', 'could', 'should',
  'this', 'that', 'it', 'its', 'what', 'how', 'why', 'when', 'if', 'not',
  'no', 'just', 'also', 'about', 'like', 'really', 'very', 'make', 'made',
  'get', 'got', 'from', 'up', 'out', 'there', 'here', 'then', 'than',
  'more', 'some', 'any', 'all', 'into', 'as', 'by', 'through', 'after',
]);

function keywordFallback(messages: TitleInput['messages']): string {
  const userText = messages
    .filter((m) => m.role === 'user')
    .slice(0, 2)
    .map((m) => m.content)
    .join(' ');

  const words = userText
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] ?? 0) + 1;

  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  return top.length >= 2 ? top.join(' ') : messages[0]?.content.slice(0, 40).trim() || 'New chat';
}

// Map mode decisions to human-readable subtitle categories
const MODE_SUBTITLE_MAP: Record<string, string> = {
  MEMORY_RECALL: 'Memory Recall',
  EMOTIONAL_EXISTENTIAL: 'Emotional Processing',
  ACTION_LOG: 'Log Entry',
  DEEP_REFLECTION: 'Deep Reflection',
  CONTINUITY_CHECK: 'Continuity Check',
  NARRATIVE_EXPANSION: 'Narrative Session',
  UNKNOWN: 'Open Conversation',
};

class ConversationTitleService {
  /**
   * Generate and persist a semantic title + optional subtitle for a thread.
   * Returns { title, subtitle } — caller should use these to update the sidebar optimistically.
   */
  async generateTitle(input: TitleInput): Promise<TitleOutput> {
    const { userId, threadId, messages, entities, modeDecision } = input;

    // Don't re-title user-renamed threads
    const { data: existing } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, title, metadata')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single();

    const row = existing as { id: string; title: string | null; metadata: Record<string, unknown> } | null;
    const existingMeta: Record<string, unknown> = (row?.metadata as Record<string, unknown>) ?? {};
    if (existingMeta.titleSource === 'user') {
      return { title: row?.title ?? 'New chat' };
    }

    // Only use the first 3 exchanges (6 messages max) to keep cost minimal
    const sample = messages.slice(0, 6);
    const conversation = sample
      .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 250)}`)
      .join('\n');

    const contextHints = [
      entities?.length ? `Key entities: ${entities.slice(0, 3).join(', ')}` : '',
      modeDecision ? `Conversation type: ${modeDecision.toLowerCase().replace(/_/g, ' ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    let title = '';
    let subtitle: string | undefined;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You generate titles and subtitles for conversations in a personal knowledge system. ' +
              'Respond with JSON: { "title": "...", "subtitle": "..." }. ' +
              'Title: 2–5 words, Title Case, no punctuation. Name the narrative episode, not the chat topic. ' +
              'Never use generic phrases like "Chat About", "Help With", "Discussion", "Question", "Conversation". ' +
              'Subtitle: 1–3 words, Title Case, category label only (e.g. "Architecture Session", "Character Reflection", ' +
              '"Memory Recall", "Design Sprint", "Emotional Processing", "Log Entry", "Strategy Review"). ' +
              'Think: what is this conversation\'s identity?',
          },
          {
            role: 'user',
            content: `${contextHints ? `${contextHints}\n\n` : ''}Conversation:\n${conversation}\n\nJSON:`,
          },
        ],
        max_tokens: 40,
        temperature: 0.6,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '';
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { title?: string; subtitle?: string };
          const candidateTitle = parsed.title?.trim() ?? '';
          const candidateSubtitle = parsed.subtitle?.trim() ?? '';
          if (candidateTitle && candidateTitle.length > 1 && candidateTitle.length < 80) {
            title = candidateTitle;
          }
          if (candidateSubtitle && candidateSubtitle.length > 1 && candidateSubtitle.length < 60) {
            subtitle = candidateSubtitle;
          }
        } catch {
          // Non-JSON response — ignore
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.debug({ threadId, err: errMsg }, 'Title LLM unavailable, using keyword fallback');
    }

    if (!title) {
      title = keywordFallback(messages);
      // Derive subtitle from mode if LLM failed
      if (!subtitle && modeDecision) {
        subtitle = MODE_SUBTITLE_MAP[modeDecision.toUpperCase()];
      }
    }

    const newMeta: Record<string, unknown> = { ...existingMeta, titleSource: 'auto' };
    if (subtitle) newMeta.subtitle = subtitle;

    await supabaseAdmin
      .from('conversation_sessions')
      .update({ title, metadata: newMeta, updated_at: new Date().toISOString() })
      .eq('id', threadId)
      .eq('user_id', userId);

    logger.debug({ threadId, title, subtitle }, 'Conversation title generated');
    return { title, subtitle };
  }

  /**
   * Rename a thread manually. Marks titleSource: 'user' so auto-generation is
   * permanently suppressed for this thread.
   */
  async renameTitle(userId: string, threadId: string, title: string): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('conversation_sessions')
      .select('metadata')
      .eq('id', threadId)
      .eq('user_id', userId)
      .single();

    const row = existing as { metadata: Record<string, unknown> } | null;
    const existingMeta: Record<string, unknown> = (row?.metadata as Record<string, unknown>) ?? {};
    await supabaseAdmin
      .from('conversation_sessions')
      .update({
        title,
        metadata: { ...existingMeta, titleSource: 'user' },
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)
      .eq('user_id', userId);
  }
}

export const conversationTitleService = new ConversationTitleService();
