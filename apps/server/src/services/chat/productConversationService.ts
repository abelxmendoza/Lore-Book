/**
 * Captures and recalls what the user has said about LoreBook (the product).
 * Stored on conversation_messages — separate from biography/journal extraction.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

const MAX_OBSERVATIONS = 12;
const MAX_SNIPPET_CHARS = 220;

export type ProductObservation = {
  messageId: string;
  threadId: string;
  content: string;
  createdAt: string;
};

export async function tagProductObservation(
  userId: string,
  messageId: string,
  threadId: string,
  rawText: string,
  scope: 'product_only' | 'mixed'
): Promise<void> {
  const snippet = rawText.trim().slice(0, MAX_SNIPPET_CHARS);
  if (!snippet) return;

  try {
    const { error } = await supabaseAdmin
      .from('conversation_messages')
      .update({
        metadata: {
          ingestion_scope: scope,
          product_observation: true,
          product_snippet: snippet,
          thread_id: threadId,
        },
      })
      .eq('id', messageId)
      .eq('user_id', userId);

    if (error) {
      logger.debug({ err: error, userId, messageId }, 'productConversationService.tag failed');
    }
  } catch (err) {
    logger.debug({ err, userId, messageId }, 'productConversationService.tag threw');
  }
}

export async function loadUserProductObservations(userId: string): Promise<ProductObservation[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('conversation_messages')
      .select('id, session_id, content, created_at, metadata')
      .eq('user_id', userId)
      .eq('role', 'user')
      .contains('metadata', { product_observation: true })
      .order('created_at', { ascending: false })
      .limit(MAX_OBSERVATIONS);

    if (error || !data) {
      logger.debug({ err: error, userId }, 'productConversationService.load failed');
      return [];
    }

    return data.map((row) => ({
      messageId: String(row.id),
      threadId: String(row.session_id),
      content: String(row.content ?? '').trim().slice(0, MAX_SNIPPET_CHARS),
      createdAt: String(row.created_at ?? ''),
    }));
  } catch (err) {
    logger.debug({ err, userId }, 'productConversationService.load threw');
    return [];
  }
}

export function formatUserProductLoreBlock(observations: ProductObservation[]): string | null {
  if (observations.length === 0) return null;

  const lines = observations.map((o) => {
    const date = o.createdAt ? o.createdAt.slice(0, 10) : 'recent';
    return `• [${date}] "${o.content}"`;
  });

  return [
    '**WHAT YOU HAVE TOLD LOREBOOK ABOUT THE PRODUCT (from your past messages — not biography):**',
    ...lines,
    'Use these when the user asks what they said about LoreBook, the app, or its features. Do not treat them as life memories.',
  ].join('\n');
}
