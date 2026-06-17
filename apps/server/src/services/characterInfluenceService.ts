/**
 * Character influence scoring — who matters most in the user's story.
 *
 * Combines interaction_count, episode_count, relationship_count,
 * event_count, and recent_mentions into influence_score.
 */

import { supabaseAdmin } from './supabaseClient';

export type CharacterInfluence = {
  characterId: string;
  name: string;
  interactionCount: number;
  episodeCount: number;
  relationshipCount: number;
  eventCount: number;
  recentMentions: number;
  influenceScore: number;
  /** Days since last mention (lower = more recent). */
  daysSinceLastMention: number | null;
};

class CharacterInfluenceService {
  computeScore(input: Omit<CharacterInfluence, 'influenceScore' | 'daysSinceLastMention'> & { daysSinceLastMention: number | null }): number {
    const recencyBoost = input.daysSinceLastMention == null
      ? 0
      : Math.max(0, 30 - input.daysSinceLastMention) / 30 * 15;

    return Math.round(
      input.interactionCount * 2 +
      input.episodeCount * 4 +
      input.relationshipCount * 6 +
      input.eventCount * 3 +
      input.recentMentions * 5 +
      recencyBoost
    );
  }

  async computeForUser(userId: string, limit = 50): Promise<CharacterInfluence[]> {
    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);

    if (!characters?.length) return [];

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const results: CharacterInfluence[] = [];

    for (const char of characters) {
      const meta = (char.metadata ?? {}) as Record<string, unknown>;
      const mentionCount = Number(meta.mention_count ?? 0);

      const [memRes, relRes, eventRes, recentMemRes] = await Promise.all([
        supabaseAdmin
          .from('character_memories')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('character_id', char.id),
        supabaseAdmin
          .from('character_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .or(`source_character_id.eq.${char.id},target_character_id.eq.${char.id}`),
        supabaseAdmin
          .from('character_timeline_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('character_id', char.id),
        supabaseAdmin
          .from('character_memories')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('character_id', char.id)
          .gte('created_at', since30d),
      ]);

      const episodeCount = memRes.count ?? 0;
      const relationshipCount = relRes.count ?? 0;
      const eventCount = eventRes.count ?? 0;
      const recentMentions = recentMemRes.count ?? 0;

      let daysSinceLastMention: number | null = null;
      const { data: lastMem } = await supabaseAdmin
        .from('character_memories')
        .select('created_at')
        .eq('user_id', userId)
        .eq('character_id', char.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (lastMem?.[0]?.created_at) {
        daysSinceLastMention = Math.floor(
          (Date.now() - new Date(lastMem[0].created_at).getTime()) / (24 * 60 * 60 * 1000)
        );
      }

      const partial = {
        characterId: char.id,
        name: char.name,
        interactionCount: mentionCount,
        episodeCount,
        relationshipCount,
        eventCount,
        recentMentions,
        daysSinceLastMention,
      };

      const influenceScore = this.computeScore(partial);
      results.push({ ...partial, influenceScore });

      // Persist score on character metadata (best-effort)
      await supabaseAdmin
        .from('characters')
        .update({
          metadata: {
            ...meta,
            influence_score: influenceScore,
            influence_computed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', char.id)
        .eq('user_id', userId);
    }

    return results.sort((a, b) => b.influenceScore - a.influenceScore).slice(0, limit);
  }

  async getTopInfluencers(userId: string, limit = 10): Promise<CharacterInfluence[]> {
    return this.computeForUser(userId, limit);
  }

  async getDriftingAway(userId: string, minPriorMentions = 3, daysSilent = 60): Promise<CharacterInfluence[]> {
    const all = await this.computeForUser(userId, 200);
    return all.filter(
      c => c.interactionCount >= minPriorMentions &&
        c.daysSinceLastMention != null &&
        c.daysSinceLastMention >= daysSilent
    );
  }
}

export const characterInfluenceService = new CharacterInfluenceService();
