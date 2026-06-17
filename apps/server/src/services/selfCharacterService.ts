/**
 * Self Character Service
 *
 * Ensures the user's protagonist character exists, syncs knowledge from chat
 * threads, and aggregates profile data for the main character modal.
 */

import { logger } from '../logger';
import { entityFactsService } from './entityFactsService';
import { entityAttributeDetector, type DetectedAttribute } from './conversationCentered/entityAttributeDetector';
import { characterBlurbService } from './characters/characterBlurbService';
import { supabaseAdmin } from './supabaseClient';

export const SELF_REFERENCE_PATTERN =
  /\b(I|me|my|myself|I'm|I am|I've|I have|I don't|I didn't|I can't|I won't)\b/i;

export type SelfProfileStats = {
  messageCount: number;
  attributeCount: number;
  factCount: number;
  knowledgeClaimCount: number;
  lastSyncedAt: string | null;
};

export type SelfProfileMemory = {
  id: string;
  entry_id: string;
  date: string;
  summary: string | null;
  content: string;
  source: 'chat' | 'journal';
  tags: string[];
};

export type SelfProfile = {
  character: Record<string, unknown>;
  attributes: DetectedAttribute[];
  facts: Awaited<ReturnType<typeof entityFactsService.getEntityFacts>>;
  knowledgeClaims: Record<string, unknown>[];
  recentMemories: SelfProfileMemory[];
  stats: SelfProfileStats;
  profileSummary: string | null;
  realName: string | null;
  wittyTagline: string | null;
  roleTagline: string | null;
  contextHooks: string[];
};

type CharacterRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  metadata?: Record<string, unknown> | null;
  importance_level?: string | null;
  created_at?: string | null;
};

function normalizeIdentityKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function getUserIdentityNames(userId: string): Promise<string[]> {
  const names = new Set<string>();
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const meta = data.user?.user_metadata ?? {};
    const fullName = String(meta.full_name ?? meta.name ?? '').trim();
    if (fullName) {
      names.add(normalizeIdentityKey(fullName));
      fullName.split(/\s+/).filter((part) => part.length > 1).forEach((part) => names.add(normalizeIdentityKey(part)));
    }
  } catch {
    /* non-blocking */
  }
  try {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .maybeSingle();
    const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    if (profileName) {
      names.add(normalizeIdentityKey(profileName));
      profileName.split(/\s+/).filter((part) => part.length > 1).forEach((part) => names.add(normalizeIdentityKey(part)));
    }
  } catch {
    /* non-blocking */
  }
  return Array.from(names);
}

function nameMatchesUserIdentity(name: string, identityNames: string[]): boolean {
  if (!name.trim() || identityNames.length === 0) return false;
  const key = normalizeIdentityKey(name);
  return identityNames.some((identity) => key === identity || key.includes(identity) || identity.includes(key));
}

function isReservedSelfName(name: string): boolean {
  return /^(me|myself|self|you)$/i.test(name.trim());
}

function scoreSelfCandidate(character: CharacterRow, identityNames: string[]): number {
  const metadata = (character.metadata ?? {}) as Record<string, unknown>;
  if (metadata.distinct_from_self === true || metadata.confirmed_distinct === true) return -1000;

  let score = 0;
  const name = String(character.name ?? '');
  const realName = typeof metadata.real_name === 'string' ? metadata.real_name : '';

  if (isReservedSelfName(name)) score += 120;
  if (realName.trim()) score += 80;
  if (identityNames.length && nameMatchesUserIdentity(name, identityNames)) score += 90;
  if (realName && identityNames.length && nameMatchesUserIdentity(realName, identityNames)) score += 100;
  if (metadata.is_self === true) score += 40;
  if (metadata.is_user === true) score += 30;
  if (character.importance_level === 'protagonist') score += 15;

  if (!isReservedSelfName(name) && identityNames.length > 0 && !nameMatchesUserIdentity(name, identityNames)) {
    score -= 60;
  }
  if (name.includes(' / ')) score -= 20;

  return score;
}

async function getPreferredRealName(userId: string): Promise<string | null> {
  try {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .maybeSingle();
    const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    if (profileName) return profileName;
  } catch {
    /* non-blocking */
  }
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const fullName = String(data.user?.user_metadata?.full_name ?? data.user?.user_metadata?.name ?? '').trim();
    if (fullName) return fullName;
  } catch {
    /* non-blocking */
  }
  return null;
}

function buildProfileSummary(
  attributes: DetectedAttribute[],
  facts: Awaited<ReturnType<typeof entityFactsService.getEntityFacts>>
): string | null {
  const parts: string[] = [];

  const currentAttrs = attributes.filter(a => a.isCurrent);
  const attrLabels: Record<string, string> = {
    occupation: 'Works as',
    workplace: 'Works at',
    school: 'Attends',
    current_city: 'Lives in',
    hometown: 'From',
    employment_status: 'Employment',
    relationship_status: 'Relationship',
    living_situation: 'Living situation',
  };

  for (const attr of currentAttrs.slice(0, 6)) {
    const label = attrLabels[attr.attributeType] ?? attr.attributeType.replace(/_/g, ' ');
    parts.push(`${label}: ${attr.attributeValue}`);
  }

  for (const fact of facts.filter(f => f.status === 'active').slice(0, 4)) {
    parts.push(fact.fact);
  }

  if (parts.length === 0) return null;
  return parts.join(' · ');
}

class SelfCharacterService {
  /**
   * Fix corrupted protagonist identity — e.g. a third-party card (stage name) that
   * inherited `is_self` or absorbed the self row during a bad merge.
   */
  async repairSelfCharacterIdentity(userId: string): Promise<{ repaired: boolean; selfId: string | null }> {
    const { data: characters, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, first_name, last_name, metadata, importance_level, created_at')
      .eq('user_id', userId);

    if (error) {
      logger.warn({ error, userId }, 'repairSelfCharacterIdentity: failed to load characters');
      return { repaired: false, selfId: null };
    }

    const rows = (characters ?? []) as CharacterRow[];
    if (rows.length === 0) return { repaired: false, selfId: null };

    const identityNames = await getUserIdentityNames(userId);
    const candidates = rows.filter((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      if (metadata.distinct_from_self === true || metadata.confirmed_distinct === true) return false;
      return (
        metadata.is_self === true ||
        metadata.is_user === true ||
        isReservedSelfName(String(row.name ?? ''))
      );
    });

    let canonical = [...candidates].sort(
      (a, b) => scoreSelfCandidate(b, identityNames) - scoreSelfCandidate(a, identityNames)
    )[0];

    let repaired = false;

    const demoteSelfFlags = async (characterId: string) => {
      const row = rows.find((item) => item.id === characterId);
      if (!row) return;
      const metadata = {
        ...((row.metadata ?? {}) as Record<string, unknown>),
        is_self: false,
        is_user: false,
      };
      const { error: updateError } = await supabaseAdmin
        .from('characters')
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq('id', characterId)
        .eq('user_id', userId);
      if (!updateError) repaired = true;
    };

    for (const row of rows) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const flagged = metadata.is_self === true || metadata.is_user === true;
      if (!flagged) continue;
      if (!canonical || row.id !== canonical.id) {
        await demoteSelfFlags(row.id);
      }
    }

    if (!canonical || scoreSelfCandidate(canonical, identityNames) < 0) {
      if (canonical) await demoteSelfFlags(canonical.id);
      return { repaired, selfId: null };
    }

    const metadata = { ...((canonical.metadata ?? {}) as Record<string, unknown>) };
    const realName =
      (typeof metadata.real_name === 'string' && metadata.real_name.trim()) ||
      (await getPreferredRealName(userId));

    const canonicalName = String(canonical.name ?? '');
    const nameWasCorrupted =
      !isReservedSelfName(canonicalName) &&
      identityNames.length > 0 &&
      !nameMatchesUserIdentity(canonicalName, identityNames);

    const updatePayload: Record<string, unknown> = {
      metadata: {
        ...metadata,
        is_self: true,
        is_user: true,
        ...(realName ? { real_name: realName } : {}),
        ...(nameWasCorrupted ? { previous_primary_name: canonicalName } : {}),
      },
      importance_level: 'protagonist',
      archetype: 'protagonist',
      updated_at: new Date().toISOString(),
    };

    if (nameWasCorrupted) {
      updatePayload.name = 'Me';
      if (realName) {
        const parts = realName.split(/\s+/).filter(Boolean);
        updatePayload.first_name = parts[0] ?? realName;
        updatePayload.last_name = parts.length > 1 ? parts.slice(1).join(' ') : null;
      }
      repaired = true;
    }

    const { error: canonicalError } = await supabaseAdmin
      .from('characters')
      .update(updatePayload)
      .eq('id', canonical.id)
      .eq('user_id', userId);

    if (canonicalError) {
      logger.warn({ canonicalError, userId, characterId: canonical.id }, 'repairSelfCharacterIdentity: canonical update failed');
      return { repaired, selfId: canonical.id };
    }

    if (nameWasCorrupted) {
      logger.info(
        { userId, characterId: canonical.id, previousName: canonicalName, realName },
        'Repaired corrupted protagonist identity'
      );
    }

    return { repaired: repaired || nameWasCorrupted, selfId: canonical.id };
  }

  async ensureSelfCharacter(userId: string): Promise<Record<string, unknown> | null> {
    await this.repairSelfCharacterIdentity(userId);
    const ref = await entityAttributeDetector.ensureUserCharacter(userId);
    if (!ref) return null;

    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('id', ref.id)
      .eq('user_id', userId)
      .single();

    if (error || !character) {
      logger.warn({ error, userId }, 'Self character row missing after ensure');
      return null;
    }

    return character;
  }

  async syncFromConversations(
    userId: string,
    options?: { limit?: number; sinceDays?: number }
  ): Promise<{ processed: number; characterId: string | null }> {
    const limit = Math.min(options?.limit ?? 80, 200);
    const sinceDays = options?.sinceDays ?? 120;
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);

    const selfRef = await entityAttributeDetector.ensureUserCharacter(userId);
    if (!selfRef) return { processed: 0, characterId: null };

    const { data: messages, error } = await supabaseAdmin
      .from('chat_messages')
      .select('id, content, role, created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn({ error, userId }, 'Failed to load chat messages for self sync');
      return { processed: 0, characterId: selfRef.id };
    }

    let processed = 0;
    for (const msg of messages ?? []) {
      const text = typeof msg.content === 'string' ? msg.content.trim() : '';
      if (!text || !SELF_REFERENCE_PATTERN.test(text)) continue;

      try {
        await entityAttributeDetector.detectAttributes(userId, text, [], msg.id);
        await entityFactsService.extractAndPersistSelfFacts(userId, selfRef.id, text);
        processed++;
      } catch (err) {
        logger.warn({ err, messageId: msg.id }, 'Self sync message failed (non-blocking)');
      }
    }

    const summary = await this.refreshSelfSummary(userId, selfRef.id);

    const { data: existing } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', selfRef.id)
      .eq('user_id', userId)
      .single();

    const metadata = {
      ...((existing?.metadata as Record<string, unknown>) ?? {}),
      is_self: true,
      is_user: true,
      self_last_synced_at: new Date().toISOString(),
      self_messages_processed: processed,
    };

    await supabaseAdmin
      .from('characters')
      .update({
        metadata,
        ...(summary ? { summary } : {}),
        importance_level: 'protagonist',
        updated_at: new Date().toISOString(),
      })
      .eq('id', selfRef.id)
      .eq('user_id', userId);

    return { processed, characterId: selfRef.id };
  }

  async refreshSelfSummary(userId: string, characterId: string): Promise<string | null> {
    const attributes = await entityAttributeDetector.getEntityAttributes(
      userId,
      characterId,
      'character',
      true
    );
    const facts = await entityFactsService.getEntityFacts(userId, characterId, 'character');
    return buildProfileSummary(attributes, facts);
  }

  async getSelfProfile(userId: string): Promise<SelfProfile | null> {
    const character = await this.ensureSelfCharacter(userId);
    if (!character) return null;

    const characterId = character.id as string;
    let metadata = (character.metadata as Record<string, unknown>) ?? {};

    if (!metadata.witty_tagline && !metadata.character_blurb) {
      await characterBlurbService.refreshAndPersist(userId, characterId, { isSelf: true });
      const refreshed = await this.ensureSelfCharacter(userId);
      if (refreshed) {
        Object.assign(character, refreshed);
        metadata = (refreshed.metadata as Record<string, unknown>) ?? {};
      }
    }

    const [
      attributes,
      facts,
      { count: messageCount },
      { data: knowledgeClaims },
      { data: recentMessages },
      { data: recentEntries },
    ] = await Promise.all([
      entityAttributeDetector.getEntityAttributes(userId, characterId, 'character', true),
      entityFactsService.getEntityFacts(userId, characterId, 'character'),
      supabaseAdmin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('role', 'user'),
      supabaseAdmin
        .from('crystallized_knowledge')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('chat_messages')
        .select('id, content, created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(40),
      supabaseAdmin
        .from('journal_entries')
        .select('id, date, content, summary, tags, source')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(40),
    ]);

    const profileSummary =
      (typeof character.summary === 'string' && character.summary.trim()) ||
      (typeof metadata.profile_summary === 'string' ? metadata.profile_summary : null) ||
      buildProfileSummary(attributes, facts);

    const wittyTagline =
      (typeof metadata.witty_tagline === 'string' && metadata.witty_tagline) ||
      (typeof metadata.character_blurb === 'string' ? metadata.character_blurb : null);

    const realName =
      (typeof metadata.real_name === 'string' && metadata.real_name.trim()) ||
      [character.first_name, character.last_name].filter(Boolean).join(' ').trim() ||
      null;

    const roleTagline = (typeof character.role === 'string' && character.role.trim()) || null;
    const contextHooks = Array.isArray(metadata.context_hooks)
      ? (metadata.context_hooks as string[])
      : [];

    return {
      character: {
        ...character,
        importance_level: 'protagonist',
        summary: profileSummary ?? character.summary,
        memory_count: messageCount ?? 0,
        knowledge_count: facts.filter(f => f.status === 'active').length + (knowledgeClaims?.length ?? 0),
        metadata: {
          ...metadata,
          real_name: realName ?? metadata.real_name,
          witty_tagline: wittyTagline,
          character_blurb: wittyTagline,
        },
      },
      attributes,
      facts,
      knowledgeClaims: knowledgeClaims ?? [],
      recentMemories: [
        ...((recentEntries ?? []).map(entry => ({
          id: `entry-${entry.id}`,
          entry_id: entry.id,
          date: entry.date,
          summary: entry.summary ?? null,
          content: entry.content ?? entry.summary ?? '',
          source: 'journal' as const,
          tags: Array.isArray(entry.tags) ? entry.tags : [],
        }))),
        ...((recentMessages ?? []).map(message => ({
          id: `chat-${message.id}`,
          entry_id: message.id,
          date: message.created_at,
          summary: typeof message.content === 'string' ? message.content.slice(0, 140) : null,
          content: typeof message.content === 'string' ? message.content : '',
          source: 'chat' as const,
          tags: ['conversation'],
        }))),
      ]
        .filter(memory => memory.content.trim().length > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 40),
      stats: {
        messageCount: messageCount ?? 0,
        attributeCount: attributes.length,
        factCount: facts.filter(f => f.status === 'active').length,
        knowledgeClaimCount: knowledgeClaims?.length ?? 0,
        lastSyncedAt: (metadata.self_last_synced_at as string) ?? null,
      },
      profileSummary,
      realName,
      wittyTagline,
      roleTagline,
      contextHooks,
    };
  }

  async refreshCharacterBlurb(userId: string, characterId: string, isSelf = false) {
    return characterBlurbService.refreshAndPersist(userId, characterId, { isSelf });
  }
}

export const selfCharacterService = new SelfCharacterService();
