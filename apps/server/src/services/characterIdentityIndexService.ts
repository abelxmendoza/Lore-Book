import { normalizeNameKey } from '../utils/nameNormalization';

import { supabaseAdmin } from './supabaseClient';

export interface CharacterIdentityIndexRow {
  id: string;
  user_id: string;
  character_id: string;
  mention: string;
  mention_key: string;
  source: 'primary_name' | 'alias' | 'nickname' | 'mention' | 'manual' | 'imported';
  confidence: number;
  evidence_count: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  character?: {
    id: string;
    name: string;
    alias?: string[] | null;
    status?: string | null;
    role?: string | null;
    archetype?: string | null;
    summary?: string | null;
    metadata?: Record<string, unknown> | null;
  };
}

class CharacterIdentityIndexService {
  async list(
    userId: string,
    options: { search?: string; limit?: number } = {}
  ): Promise<CharacterIdentityIndexRow[]> {
    const limit = Math.min(Math.max(options.limit ?? 250, 1), 1000);
    const search = options.search?.trim();
    let query = supabaseAdmin
      .from('character_identity_index')
      .select(`
        *,
        character:characters (
          id,
          name,
          alias,
          status,
          role,
          archetype,
          summary,
          metadata
        )
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (search) {
      query = query.or(`mention.ilike.%${search}%,mention_key.eq.${normalizeNameKey(search)}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CharacterIdentityIndexRow[];
  }

  async rebuild(userId: string): Promise<{ indexed: number }> {
    const { data: characters, error } = await supabaseAdmin
      .from('characters')
      .select('id, user_id, name, alias, metadata')
      .eq('user_id', userId);
    if (error) throw error;

    await supabaseAdmin
      .from('character_identity_index')
      .delete()
      .eq('user_id', userId)
      .in('source', ['primary_name', 'alias']);

    const rows = (characters ?? []).flatMap(character => {
      const aliases = Array.isArray(character.alias) ? character.alias : [];
      const mentionCount = Number(character.metadata?.mention_count);
      const evidenceCount = Number.isFinite(mentionCount) && mentionCount > 0 ? Math.floor(mentionCount) : 1;
      const primaryKey = normalizeNameKey(character.name);
      const mentions = [
        {
          user_id: userId,
          character_id: character.id,
          mention: character.name,
          mention_key: primaryKey,
          source: 'primary_name',
          confidence: 1,
          evidence_count: evidenceCount,
          metadata: {},
        },
        ...aliases
          .map(alias => String(alias).trim())
          .filter(alias => alias.length > 0 && normalizeNameKey(alias) !== primaryKey)
          .map(alias => ({
            user_id: userId,
            character_id: character.id,
            mention: alias,
            mention_key: normalizeNameKey(alias),
            source: 'alias',
            confidence: 0.95,
            evidence_count: evidenceCount,
            metadata: {},
          })),
      ];

      const seen = new Set<string>();
      return mentions.filter(row => {
        const key = `${row.character_id}:${row.mention_key}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return row.mention_key.length > 0;
      });
    });

    if (rows.length === 0) return { indexed: 0 };

    const { error: upsertError } = await supabaseAdmin
      .from('character_identity_index')
      .upsert(rows, { onConflict: 'user_id,character_id,mention_key' });
    if (upsertError) throw upsertError;

    return { indexed: rows.length };
  }
}

export const characterIdentityIndexService = new CharacterIdentityIndexService();
