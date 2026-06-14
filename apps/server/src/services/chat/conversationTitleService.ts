/**
 * ConversationTitleService
 *
 * Generates semantic, narrative-aware titles (and subtitles) for conversation threads.
 * A title is the first stable anchor of a conversation's identity.
 *
 * Principles:
 * - Titles are episode names, not truncated messages
 * - LLM path: gpt-5.4-mini, single JSON call produces title + subtitle
 * - Keyword fallback if LLM is unavailable (billing 429, etc.)
 * - Never overwrites a user-renamed title (detected via titleSource flag)
 * - Called once after the first assistant response, never again unless explicitly triggered
 */

import { logger } from '../../logger';
import { openai } from '../../lib/openai';
import { supabaseAdmin } from '../supabaseClient';
import {
  DRAFT_THREAD_TITLE,
  ensureNonGenericTitle,
  isGenericThreadTitle,
  deriveTitleFromFirstUserMessage,
} from '../../utils/threadTitleUtils';
import { ensureUniqueThreadTitle } from '../conversationCentered/threadDedupeService';

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
  dominantEntities?: string[];
}

// Map mode decisions to human-readable subtitle categories
function keywordFallback(messages: TitleInput['messages']): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return DRAFT_THREAD_TITLE;
  return ensureNonGenericTitle(deriveTitleFromFirstUserMessage(firstUser.content), messages);
}

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
      const userTitle = row?.title ?? DRAFT_THREAD_TITLE;
      return { title: isGenericThreadTitle(userTitle) ? ensureNonGenericTitle(userTitle, messages) : userTitle };
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
        model: 'gpt-5.4-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You generate titles and subtitles for conversations in a personal knowledge system. ' +
              'Respond with JSON: { "title": "...", "subtitle": "..." }. ' +
              'Title: 2–5 words, Title Case, no punctuation. Name the narrative episode, not the chat topic. ' +
              'Never use generic phrases like "Chat About", "Help With", "Discussion", "Question", "Conversation", "New Chat", or "New Thread". ' +
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
          if (candidateTitle && candidateTitle.length > 1 && candidateTitle.length < 80 && !isGenericThreadTitle(candidateTitle)) {
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

    title = ensureNonGenericTitle(title, messages);

    const uniqueTitle = await ensureUniqueThreadTitle(userId, threadId, title);
    title = uniqueTitle;

    const newMeta: Record<string, unknown> = { ...existingMeta, titleSource: 'auto' };
    if (subtitle) newMeta.subtitle = subtitle;

    // Persist entity chips — shown in thread list before the first response renders.
    // If caller didn't pass entities, query knowledge_units for this thread.
    // Merges with any previously stored entities so recurring names accumulate over time.
    let resolvedEntities: string[] = entities ?? [];
    if (resolvedEntities.length === 0) {
      try {
        // Traverse: conversation_sessions → conversation_messages → knowledge_units.entities
        const { data: msgs } = await supabaseAdmin
          .from('conversation_messages')
          .select('id')
          .eq('session_id', threadId)
          .limit(30);
        if (msgs && msgs.length > 0) {
          const msgIds = msgs.map((m: any) => m.id);
          const { data: kus } = await supabaseAdmin
            .from('knowledge_units')
            .select('entities')
            .in('utterance_id', msgIds)
            .not('entities', 'is', null)
            .limit(50);
          if (kus) {
            const names = new Set<string>();
            for (const ku of kus) {
              const ents: any[] = Array.isArray(ku.entities) ? ku.entities : [];
              for (const e of ents) {
                const n = e?.name ?? e?.text ?? (typeof e === 'string' ? e : null);
                if (n && typeof n === 'string' && n.length > 1) names.add(n);
              }
            }
            resolvedEntities = Array.from(names).slice(0, 8);
          }
        }
      } catch {
        // Non-critical — entity chips are best-effort
      }
    }
    if (resolvedEntities.length > 0) {
      const existing = Array.isArray(existingMeta.dominantEntities) ? existingMeta.dominantEntities as string[] : [];
      const merged = Array.from(new Set([...existing, ...resolvedEntities])).slice(0, 8);
      newMeta.dominantEntities = merged;
    }

    await supabaseAdmin
      .from('conversation_sessions')
      .update({ title, metadata: newMeta, updated_at: new Date().toISOString() })
      .eq('id', threadId)
      .eq('user_id', userId);

    const finalEntities = (newMeta.dominantEntities as string[] | undefined) ?? undefined;
    logger.debug({ threadId, title, subtitle, entityCount: finalEntities?.length ?? 0 }, 'Conversation title generated');
    return { title, subtitle, dominantEntities: finalEntities };
  }

  /**
   * Rename a thread manually. Marks titleSource: 'user' so auto-generation is
   * permanently suppressed for this thread.
   */
  async renameTitle(userId: string, threadId: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed || isGenericThreadTitle(trimmed)) {
      throw new Error('Thread title must be specific — generic placeholders are not allowed');
    }
    const uniqueTitle = await ensureUniqueThreadTitle(userId, threadId, trimmed);
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
        title: uniqueTitle,
        metadata: { ...existingMeta, titleSource: 'user' },
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)
      .eq('user_id', userId);
  }
}

export const conversationTitleService = new ConversationTitleService();
