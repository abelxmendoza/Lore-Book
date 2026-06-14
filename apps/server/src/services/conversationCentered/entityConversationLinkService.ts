import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type EntityConversationType = 'character' | 'location' | 'organization' | 'skill' | 'event';
export type LinkKind = 'mention' | 'origin' | 'created';

export type EntityConversationLink = {
  id: string;
  entityType: EntityConversationType;
  entityId: string;
  sessionId: string;
  linkKind: LinkKind;
  mentionCount: number;
  firstLinkedAt: string;
  lastLinkedAt: string;
  sessionTitle?: string;
};

class EntityConversationLinkService {
  async linkEntity(
    userId: string,
    entityType: EntityConversationType,
    entityId: string,
    sessionId: string,
    options: { linkKind?: LinkKind; entityName?: string } = {}
  ): Promise<void> {
    if (!sessionId || !entityId) return;

    await this.ensureSessionExists(userId, sessionId);

    const linkKind = options.linkKind ?? 'mention';
    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('id, mention_count, link_kind')
      .eq('user_id', userId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existing) {
      const updates: Record<string, unknown> = {
        mention_count: (existing.mention_count ?? 1) + 1,
        last_linked_at: now,
      };
      // Never downgrade origin → mention
      if (linkKind === 'origin' && existing.link_kind !== 'origin') {
        updates.link_kind = 'origin';
      }
      await supabaseAdmin
        .from('entity_conversation_links')
        .update(updates)
        .eq('id', existing.id);
    } else {
      const { error } = await supabaseAdmin.from('entity_conversation_links').insert({
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
        session_id: sessionId,
        link_kind: linkKind,
        mention_count: 1,
        first_linked_at: now,
        last_linked_at: now,
        metadata: options.entityName ? { entity_name: options.entityName } : {},
      });
      if (error) {
        logger.warn({ error, entityType, entityId, sessionId }, 'Failed to insert entity conversation link');
        return;
      }
    }

    if (linkKind === 'origin' && entityType === 'character') {
      await this.setCharacterOriginThread(userId, entityId, sessionId);
    }
  }

  private async ensureSessionExists(userId: string, sessionId: string): Promise<void> {
    const { data } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.id) return;

    const now = new Date().toISOString();
    await supabaseAdmin.from('conversation_sessions').insert({
      id: sessionId,
      user_id: userId,
      title: 'Restored conversation',
      started_at: now,
      created_at: now,
      updated_at: now,
      metadata: { restored: true, messages: [] },
    });
  }

  private async setCharacterOriginThread(
    userId: string,
    characterId: string,
    sessionId: string
  ): Promise<void> {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!character) return;

    const meta = (character.metadata as Record<string, unknown>) ?? {};
    const threadIds = Array.isArray(meta.thread_ids)
      ? [...new Set([...(meta.thread_ids as string[]), sessionId])]
      : [sessionId];

    const updates: Record<string, unknown> = {
      metadata: {
        ...meta,
        origin_thread_id: meta.origin_thread_id ?? sessionId,
        thread_ids: threadIds,
      },
    };

    await supabaseAdmin.from('characters').update(updates).eq('id', characterId).eq('user_id', userId);
  }

  async linkResolvedEntities(
    userId: string,
    sessionId: string,
    entities: Array<{ id: string; type: string; primary_name?: string; name?: string }>,
    options: { markOrigin?: boolean } = {}
  ): Promise<void> {
    for (const entity of entities) {
      const mapped = this.mapEntityType(entity.type);
      if (!mapped) continue;
      const resolvedId = await this.resolveEntityId(userId, mapped, entity.id, entity.primary_name ?? entity.name);
      if (!resolvedId) continue;

      const hasOrigin = options.markOrigin
        ? await this.entityHasOriginLink(userId, mapped, resolvedId)
        : true;

      await this.linkEntity(userId, mapped, resolvedId, sessionId, {
        linkKind: options.markOrigin && !hasOrigin ? 'origin' : 'mention',
        entityName: entity.primary_name ?? entity.name,
      });
    }
  }

  private async entityHasOriginLink(
    userId: string,
    entityType: EntityConversationType,
    entityId: string
  ): Promise<boolean> {
    const { count } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('link_kind', 'origin');
    return (count ?? 0) > 0;
  }

  private mapEntityType(type: string): EntityConversationType | null {
    const t = type.toUpperCase();
    if (t === 'PERSON' || t === 'CHARACTER') return 'character';
    if (t === 'LOCATION') return 'location';
    if (t === 'ORG' || t === 'ORGANIZATION') return 'organization';
    if (t === 'SKILL') return 'skill';
    if (t === 'EVENT') return 'event';
    return null;
  }

  private async resolveEntityId(
    userId: string,
    entityType: EntityConversationType,
    omegaEntityId: string,
    name?: string
  ): Promise<string | null> {
    if (entityType === 'character') {
      const { data: byOmega } = await supabaseAdmin
        .from('characters')
        .select('id')
        .eq('user_id', userId)
        .eq('metadata->>omega_entity_id', omegaEntityId)
        .maybeSingle();
      if (byOmega?.id) return byOmega.id;

      if (name) {
        const { data: byName } = await supabaseAdmin
          .from('characters')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', name.trim())
          .maybeSingle();
        if (byName?.id) return byName.id;
      }
    }
    return omegaEntityId;
  }

  async getThreadsForEntity(
    userId: string,
    entityType: EntityConversationType,
    entityId: string
  ): Promise<EntityConversationLink[]> {
    const { data: links } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('*')
      .eq('user_id', userId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('first_linked_at', { ascending: true });

    if (!links?.length) {
      return this.fallbackFromCharacterMetadata(userId, entityType, entityId);
    }

    const sessionIds = links.map((l) => l.session_id);
    const { data: sessions } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, title, updated_at')
      .eq('user_id', userId)
      .in('id', sessionIds);

    const titleById = new Map((sessions ?? []).map((s) => [s.id, s.title ?? 'Conversation']));

    return links.map((l) => ({
      id: l.id,
      entityType: l.entity_type as EntityConversationType,
      entityId: l.entity_id,
      sessionId: l.session_id,
      linkKind: l.link_kind as LinkKind,
      mentionCount: l.mention_count ?? 1,
      firstLinkedAt: l.first_linked_at,
      lastLinkedAt: l.last_linked_at,
      sessionTitle: titleById.get(l.session_id),
    }));
  }

  private async fallbackFromCharacterMetadata(
    userId: string,
    entityType: EntityConversationType,
    entityId: string
  ): Promise<EntityConversationLink[]> {
    if (entityType !== 'character') return [];

    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', entityId)
      .eq('user_id', userId)
      .maybeSingle();

    const meta = (character?.metadata as Record<string, unknown>) ?? {};
    const originId = meta.origin_thread_id as string | undefined;
    const threadIds = (meta.thread_ids as string[]) ?? (originId ? [originId] : []);
    if (!threadIds.length) return [];

    const { data: sessions } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, title')
      .eq('user_id', userId)
      .in('id', threadIds);

    const titleById = new Map((sessions ?? []).map((s) => [s.id, s.title ?? 'Conversation']));

    return threadIds.map((sessionId, idx) => ({
      id: `meta-${sessionId}`,
      entityType: 'character' as const,
      entityId,
      sessionId,
      linkKind: sessionId === originId ? ('origin' as const) : ('mention' as const),
      mentionCount: 1,
      firstLinkedAt: new Date(0).toISOString(),
      lastLinkedAt: new Date(0).toISOString(),
      sessionTitle: titleById.get(sessionId) ?? 'Conversation',
    }));
  }
}

export const entityConversationLinkService = new EntityConversationLinkService();
