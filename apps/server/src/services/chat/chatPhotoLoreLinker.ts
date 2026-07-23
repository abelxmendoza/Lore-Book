/**
 * After chat vision enrichment: place photos into the user's lore graph —
 * characters/cast, locations, conversation context, and sibling media from the same thread.
 */
import { logger } from '../../logger';
import { characterFoundationService } from '../characterFoundationService';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';
import type { VisionSummaryResult } from './chatVisionSummaryService';

export type LoreCastMember = {
  id: string;
  name: string;
  type: string;
};

export type ChatPhotoLoreContext = {
  threadEntities?: LoreCastMember[];
  chatFocus?: { entityId: string; entityName: string; entityType: string };
  /** Short recent turns for narrative continuity (already truncated). */
  recentTurns?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type ChatPhotoAttachmentRef = {
  photoId?: string;
  journalEntryId?: string;
  url?: string;
  storagePath?: string;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/^@/, '');
}

function namesOverlap(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Build a text block so ingestion can relate photos to the open conversation. */
export function buildConversationLoreContextBlock(ctx?: ChatPhotoLoreContext | null): string {
  if (!ctx) return '';
  const lines: string[] = [];
  const cast = (ctx.threadEntities ?? []).filter((e) => e.name?.trim());
  if (cast.length) {
    const castLine = cast
      .map((e) => `${e.name} (${e.type})`)
      .slice(0, 12)
      .join(', ');
    lines.push(`Thread cast: ${castLine}`);
  }
  if (ctx.chatFocus?.entityName) {
    lines.push(
      `Conversation focus: ${ctx.chatFocus.entityName} (${ctx.chatFocus.entityType || 'entity'})`,
    );
  }
  const recent = (ctx.recentTurns ?? [])
    .slice(-4)
    .map((t) => `${t.role}: ${t.content.trim().slice(0, 220)}`)
    .filter((l) => l.length > 8);
  if (recent.length) {
    lines.push(`Recent conversation:\n${recent.join('\n')}`);
  }
  if (!lines.length) return '';
  return `[Conversation lore context]\n${lines.join('\n')}`;
}

async function resolveCharacterMatches(
  userId: string,
  visionPeople: string[],
  cast: LoreCastMember[],
  focus?: ChatPhotoLoreContext['chatFocus'],
): Promise<Array<{ id: string; name: string; reason: string }>> {
  const out = new Map<string, { id: string; name: string; reason: string }>();

  const castCharacters = cast.filter((e) => e.type === 'character' || e.type === 'CHARACTER');
  for (const c of castCharacters) {
    out.set(c.id, { id: c.id, name: c.name, reason: 'thread_cast' });
  }
  if (focus?.entityType === 'character' && focus.entityId) {
    out.set(focus.entityId, {
      id: focus.entityId,
      name: focus.entityName,
      reason: 'conversation_focus',
    });
  }

  const unresolved = visionPeople.filter(
    (p) => !castCharacters.some((c) => namesOverlap(c.name, p)) && !namesOverlap(focus?.entityName ?? '', p),
  );

  if (unresolved.length) {
    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias')
      .eq('user_id', userId)
      .limit(200);

    for (const person of unresolved) {
      const hit = (characters ?? []).find((ch) => {
        if (namesOverlap(ch.name ?? '', person)) return true;
        const aliases = Array.isArray(ch.alias) ? ch.alias : [];
        return aliases.some((a: unknown) => typeof a === 'string' && namesOverlap(a, person));
      });
      if (hit?.id) {
        out.set(hit.id, { id: hit.id, name: hit.name, reason: `vision_person:${person}` });
      }
    }
  }

  // Also match vision people onto cast by name (even if already in cast — reinforces reason)
  for (const person of visionPeople) {
    const castHit = castCharacters.find((c) => namesOverlap(c.name, person));
    if (castHit) {
      out.set(castHit.id, {
        id: castHit.id,
        name: castHit.name,
        reason: `vision_matches_cast:${person}`,
      });
    }
  }

  return [...out.values()];
}

async function resolveLocationMatches(
  userId: string,
  visionPlaces: string[],
  cast: LoreCastMember[],
  focus?: ChatPhotoLoreContext['chatFocus'],
): Promise<Array<{ id: string; name: string; reason: string }>> {
  const out = new Map<string, { id: string; name: string; reason: string }>();

  for (const loc of cast.filter((e) => e.type === 'location' || e.type === 'LOCATION')) {
    out.set(loc.id, { id: loc.id, name: loc.name, reason: 'thread_cast' });
  }
  if (focus?.entityType === 'location' && focus.entityId) {
    out.set(focus.entityId, {
      id: focus.entityId,
      name: focus.entityName,
      reason: 'conversation_focus',
    });
  }

  if (!visionPlaces.length) return [...out.values()];

  const { data: locations } = await supabaseAdmin
    .from('locations')
    .select('id, name')
    .eq('user_id', userId)
    .limit(200);

  for (const place of visionPlaces) {
    const castHit = cast.find(
      (e) => (e.type === 'location' || e.type === 'LOCATION') && namesOverlap(e.name, place),
    );
    if (castHit) {
      out.set(castHit.id, { id: castHit.id, name: castHit.name, reason: `vision_matches_cast:${place}` });
      continue;
    }
    const hit = (locations ?? []).find((l) => namesOverlap(l.name ?? '', place));
    if (hit?.id) {
      out.set(hit.id, { id: hit.id, name: hit.name, reason: `vision_place:${place}` });
    }
  }

  return [...out.values()];
}

async function findSiblingSessionPhotoIds(
  userId: string,
  sessionId: string,
  excludePhotoIds: string[],
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('journal_entries')
    .select('metadata')
    .eq('user_id', userId)
    .eq('source', 'photo')
    .contains('metadata', { sessionId })
    .order('created_at', { ascending: false })
    .limit(40);

  const exclude = new Set(excludePhotoIds);
  const siblingIds: string[] = [];
  for (const row of data ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const photoId = typeof meta.photoId === 'string' ? meta.photoId : null;
    if (!photoId || exclude.has(photoId)) continue;
    siblingIds.push(photoId);
    if (siblingIds.length >= 12) break;
  }
  return siblingIds;
}

/**
 * Update album rows with vision text and link them into cast / locations / session lore.
 */
export async function linkChatPhotosToLore(params: {
  userId: string;
  sessionId: string;
  chatMessageId: string;
  ingestText: string;
  vision: VisionSummaryResult | null;
  attachments: ChatPhotoAttachmentRef[];
  loreContext?: ChatPhotoLoreContext | null;
}): Promise<{
  albumUpdated: number;
  charactersLinked: number;
  locationsLinked: number;
  siblingPhotos: number;
}> {
  const { userId, sessionId, chatMessageId, ingestText, vision, attachments, loreContext } = params;
  const journalIds = attachments
    .map((a) => a.journalEntryId)
    .filter((id): id is string => Boolean(id));

  if (!journalIds.length) {
    return { albumUpdated: 0, charactersLinked: 0, locationsLinked: 0, siblingPhotos: 0 };
  }

  const cast = loreContext?.threadEntities ?? [];
  const characters = await resolveCharacterMatches(
    userId,
    vision?.people ?? [],
    cast,
    loreContext?.chatFocus,
  );
  const locations = await resolveLocationMatches(
    userId,
    vision?.places ?? [],
    cast,
    loreContext?.chatFocus,
  );

  const photoIds = attachments.map((a) => a.photoId).filter((id): id is string => Boolean(id));
  let siblingPhotos: string[] = [];
  try {
    siblingPhotos = await findSiblingSessionPhotoIds(userId, sessionId, photoIds);
  } catch (err) {
    logger.debug({ err, sessionId }, 'sibling photo lookup failed');
  }

  let albumUpdated = 0;
  for (const journalEntryId of journalIds) {
    try {
      const { data: existing } = await supabaseAdmin
        .from('journal_entries')
        .select('metadata, tags')
        .eq('id', journalEntryId)
        .eq('user_id', userId)
        .maybeSingle();

      const prevMeta = (existing?.metadata as Record<string, unknown> | null) ?? {};
      const prevTags = Array.isArray(existing?.tags) ? (existing!.tags as string[]) : [];
      const tags = Array.from(
        new Set([
          ...prevTags,
          'photo',
          'chat',
          'lore_linked',
          ...(vision?.platforms ?? []).map((p) => `platform:${p}`),
          ...(vision?.mediaKinds ?? []).map((k) => `media:${k}`),
        ]),
      );

      await memoryService.updateEntry(userId, journalEntryId, {
        content: ingestText.slice(0, 12000),
        summary: vision?.summary?.slice(0, 500),
        tags,
        metadata: {
          ...prevMeta,
          sessionId,
          chatMessageId,
          loreLinkedAt: new Date().toISOString(),
          visionPeople: vision?.people ?? [],
          visionPlaces: vision?.places ?? [],
          mediaKinds: vision?.mediaKinds ?? [],
          platforms: vision?.platforms ?? [],
          transcripts: vision?.transcripts ?? [],
          linkedCharacterIds: characters.map((c) => c.id),
          linkedLocationIds: locations.map((l) => l.id),
          threadCast: cast.map((c) => ({ id: c.id, name: c.name, type: c.type })),
          conversationFocus: loreContext?.chatFocus ?? null,
          relatedSessionPhotoIds: siblingPhotos,
          relatedChatMessageId: chatMessageId,
        },
      });
      albumUpdated += 1;
    } catch (err) {
      logger.warn({ err, journalEntryId, userId }, 'Failed to update chat photo album lore');
    }
  }

  let charactersLinked = 0;
  for (const character of characters) {
    try {
      const n = await characterFoundationService.linkCharacterToMemories(
        userId,
        character.id,
        journalIds,
      );
      charactersLinked += n;
    } catch (err) {
      logger.warn({ err, characterId: character.id }, 'Failed to link chat photos to character');
    }
  }

  let locationsLinked = 0;
  for (const journalEntryId of journalIds) {
    for (const location of locations) {
      try {
        const { error } = await supabaseAdmin.from('photo_location_links').upsert(
          {
            user_id: userId,
            journal_entry_id: journalEntryId,
            location_id: location.id,
            confidence: location.reason.startsWith('conversation_focus') ? 0.95 : 0.8,
            detection_reason: location.reason,
            auto_detected: true,
          },
          { onConflict: 'journal_entry_id,location_id' },
        );
        if (!error) locationsLinked += 1;
      } catch (err) {
        logger.debug({ err, journalEntryId, locationId: location.id }, 'photo location link failed');
      }
    }
  }

  // Persist resolved entity ids on the chat message for graph continuity.
  try {
    const { data: msg } = await supabaseAdmin
      .from('chat_messages')
      .select('metadata')
      .eq('id', chatMessageId)
      .eq('user_id', userId)
      .maybeSingle();
    const prev = (msg?.metadata as Record<string, unknown> | null) ?? {};
    await supabaseAdmin
      .from('chat_messages')
      .update({
        metadata: {
          ...prev,
          entity_ids: Array.from(
            new Set([
              ...((Array.isArray(prev.entity_ids) ? prev.entity_ids : []) as string[]),
              ...characters.map((c) => c.id),
            ]),
          ),
          location_ids: Array.from(
            new Set([
              ...((Array.isArray(prev.location_ids) ? prev.location_ids : []) as string[]),
              ...locations.map((l) => l.id),
            ]),
          ),
          lore_photo_links: {
            characterIds: characters.map((c) => c.id),
            locationIds: locations.map((l) => l.id),
            journalEntryIds: journalIds,
            siblingPhotoIds: siblingPhotos,
          },
        },
      })
      .eq('id', chatMessageId)
      .eq('user_id', userId);
  } catch (err) {
    logger.debug({ err, chatMessageId }, 'Failed to stamp lore_photo_links on chat message');
  }

  logger.info(
    {
      userId,
      chatMessageId,
      albumUpdated,
      charactersLinked,
      locationsLinked,
      siblingPhotos: siblingPhotos.length,
      characterNames: characters.map((c) => c.name),
      locationNames: locations.map((l) => l.name),
    },
    'Chat photos linked into lore graph',
  );

  return {
    albumUpdated,
    charactersLinked,
    locationsLinked,
    siblingPhotos: siblingPhotos.length,
  };
}
