/**
 * Load source evidence for a place without deleting provenance.
 */

import { supabaseAdmin } from '../../supabaseClient';
import type { VisitEvidenceItem } from './placeVisitRecalculator';

export type PlaceEvidenceBundle = {
  placeId: string;
  placeName: string;
  items: VisitEvidenceItem[];
  evidenceIds: string[];
};

/**
 * Gather message / mention / metadata context for a place.
 * Best-effort across tables that may or may not exist for a given deploy.
 */
export async function loadPlaceEvidence(
  userId: string,
  placeId: string,
  placeName: string,
  metadata?: Record<string, unknown> | null,
): Promise<PlaceEvidenceBundle> {
  const items: VisitEvidenceItem[] = [];
  const evidenceIds: string[] = [];

  const metaContext = typeof metadata?.context === 'string' ? metadata.context : '';
  const metaDescription = typeof metadata?.description === 'string' ? metadata.description : '';
  if (metaContext) {
    items.push({ text: metaContext, sourceId: `meta:context:${placeId}`, source: String(metadata?.source ?? 'registry') });
  }
  if (metaDescription && metaDescription !== metaContext) {
    items.push({ text: metaDescription, sourceId: `meta:description:${placeId}`, source: String(metadata?.source ?? 'registry') });
  }

  const sourceMessageIds = Array.isArray(metadata?.source_message_ids)
    ? (metadata!.source_message_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];

  try {
    const { data: mentions } = await supabaseAdmin
      .from('entity_mentions')
      .select('id, message_id, snippet, content')
      .eq('user_id', userId)
      .eq('entity_type', 'location')
      .eq('entity_id', placeId)
      .limit(50);

    for (const row of mentions ?? []) {
      const text = String((row as any).snippet || (row as any).content || '').trim();
      if (!text) continue;
      const sourceId = String((row as any).message_id || (row as any).id);
      evidenceIds.push(sourceId);
      items.push({ text, sourceId, source: 'entity_mention' });
      if ((row as any).message_id) sourceMessageIds.push(String((row as any).message_id));
    }
  } catch {
    // Table may be missing in some environments.
  }

  const uniqueMessageIds = [...new Set(sourceMessageIds)].slice(0, 40);
  if (uniqueMessageIds.length > 0) {
    try {
      const { data: messages } = await supabaseAdmin
        .from('chat_messages')
        .select('id, content, role')
        .eq('user_id', userId)
        .in('id', uniqueMessageIds);

      for (const msg of messages ?? []) {
        const text = String((msg as any).content || '').trim();
        if (!text) continue;
        evidenceIds.push(String((msg as any).id));
        items.push({
          text,
          sourceId: String((msg as any).id),
          source: (msg as any).role === 'assistant' ? 'assistant' : 'chat',
        });
      }
    } catch {
      // ignore
    }
  }

  // Fallback: search recent user messages that contain the place name.
  if (items.length === 0 && placeName.trim().length >= 3) {
    try {
      const { data: recent } = await supabaseAdmin
        .from('chat_messages')
        .select('id, content')
        .eq('user_id', userId)
        .eq('role', 'user')
        .ilike('content', `%${placeName.slice(0, 48)}%`)
        .order('created_at', { ascending: false })
        .limit(15);

      for (const msg of recent ?? []) {
        const text = String((msg as any).content || '').trim();
        if (!text) continue;
        evidenceIds.push(String((msg as any).id));
        items.push({ text, sourceId: String((msg as any).id), source: 'chat_search' });
      }
    } catch {
      // ignore
    }
  }

  return {
    placeId,
    placeName,
    items,
    evidenceIds: [...new Set(evidenceIds)],
  };
}
