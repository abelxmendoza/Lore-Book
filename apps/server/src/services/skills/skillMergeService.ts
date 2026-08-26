/**
 * Consolidate duplicate skill cards into one survivor.
 */

import { logger } from '../../logger';
import { collectNameKeys, flagMergedTextSnippets, withMergeReviewMetadata } from '../../utils/mergeReview';
import { supabaseAdmin } from '../supabaseClient';
import { skillIndexService } from './skillIndexService';
import { skillLoreService } from './skillLoreService';
import {
  archivedMergeMetadata,
  foldSkillSurvivor,
  readSkillAliases,
  uniqSkillNames,
} from './skillMerge';
import { mergeSkillProfiles, readSkillProfile, type SkillProfile } from './skillProfile';
import { getSkillsDbSchema } from './skillSchemaAdapter';
import { skillService, type Skill } from './skillService';
import { normalizeSkillKey } from './skillIdentity';

export type SkillMergeReport = {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  aliases: string[];
  relationshipsMoved: number;
  reviewFlags: string[];
};

function isTableMissing(error: unknown): boolean {
  return (error as { code?: string })?.code === 'PGRST205';
}

async function persistSurvivor(userId: string, skillId: string, folded: ReturnType<typeof foldSkillSurvivor>): Promise<Skill> {
  const schema = await getSkillsDbSchema();
  const now = new Date().toISOString();
  const patch =
    schema === 'legacy'
      ? {
          description: folded.description,
          metadata: {
            ...folded.metadata,
            total_xp: folded.total_xp,
            current_level: folded.current_level,
            xp_to_next_level: folded.xp_to_next_level,
            practice_count: folded.practice_count,
            last_practiced_at: folded.last_practiced_at,
            first_mentioned_at: folded.first_mentioned_at,
            confidence_score: folded.confidence_score,
          },
          updated_at: now,
        }
      : {
          description: folded.description,
          total_xp: folded.total_xp,
          current_level: folded.current_level,
          xp_to_next_level: folded.xp_to_next_level,
          practice_count: folded.practice_count,
          last_practiced_at: folded.last_practiced_at,
          first_mentioned_at: folded.first_mentioned_at,
          confidence_score: folded.confidence_score,
          metadata: folded.metadata,
          updated_at: now,
        };

  const { data, error } = await supabaseAdmin
    .from('skills')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', skillId)
    .select()
    .single();

  if (error) throw error;
  return data as Skill;
}

async function archiveSource(userId: string, source: Skill, target: Skill, reason?: string): Promise<void> {
  const metadata = archivedMergeMetadata(source, target, reason);
  const schema = await getSkillsDbSchema();
  const now = new Date().toISOString();
  const patch =
    schema === 'legacy'
      ? { metadata, updated_at: now }
      : { is_active: false, metadata, updated_at: now };

  const { error } = await supabaseAdmin
    .from('skills')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', source.id);
  if (error) throw error;
}

async function rePointRelationships(userId: string, sourceId: string, targetId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('skill_relationships')
    .select('id, from_skill_id, to_skill_id, relationship_type, confidence, strength, metadata')
    .eq('user_id', userId)
    .or(`from_skill_id.eq.${sourceId},to_skill_id.eq.${sourceId}`);

  if (error) {
    if (!isTableMissing(error)) {
      logger.debug({ error, userId, sourceId }, 'skill relationship re-point read failed');
    }
    return 0;
  }

  let moved = 0;
  for (const rel of data ?? []) {
    const from = rel.from_skill_id === sourceId ? targetId : rel.from_skill_id;
    const to = rel.to_skill_id === sourceId ? targetId : rel.to_skill_id;
    if (from === to) continue;
    const { error: upsertErr } = await supabaseAdmin.from('skill_relationships').upsert(
      {
        user_id: userId,
        from_skill_id: from,
        to_skill_id: to,
        relationship_type: rel.relationship_type,
        confidence: rel.confidence ?? 0.6,
        strength: rel.strength ?? 0.5,
        metadata: rel.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,from_skill_id,to_skill_id,relationship_type' },
    );
    if (!upsertErr) moved += 1;
  }

  await supabaseAdmin
    .from('skill_relationships')
    .delete()
    .eq('user_id', userId)
    .or(`from_skill_id.eq.${sourceId},to_skill_id.eq.${sourceId}`);

  return moved;
}

async function confirmSuggestionsForNames(userId: string, names: string[]): Promise<void> {
  const keys = uniqSkillNames(names);
  if (keys.length === 0) return;
  for (const name of keys) {
    await supabaseAdmin
      .from('skill_suggestions')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .ilike('skill_name', name);
  }
}

class SkillMergeService {
  async merge(
    userId: string,
    sourceId: string,
    targetId: string,
    opts: { reason?: string; extraAlias?: string } = {},
  ): Promise<{ skill: Skill; report: SkillMergeReport }> {
    if (sourceId === targetId) {
      throw new Error('Cannot merge a skill into itself');
    }

    const [source, target] = await Promise.all([
      skillService.getSkill(userId, sourceId),
      skillService.getSkill(userId, targetId),
    ]);
    if (!source || !target) {
      throw new Error('Skill not found');
    }

    const folded = foldSkillSurvivor(target, source, opts.extraAlias ? [opts.extraAlias] : []);
    const sourceKeys = collectNameKeys(source.skill_name, normalizeSkillKey(source.skill_name), readSkillAliases(source.metadata));
    const survivorKeys = collectNameKeys(target.skill_name, normalizeSkillKey(target.skill_name), folded.aliases);
    const reviewFlags = flagMergedTextSnippets(
      [source.description, source.metadata?.origin_story as string | undefined, folded.skill_profile.origin_story],
      sourceKeys,
      survivorKeys,
    );
    folded.metadata = withMergeReviewMetadata(folded.metadata, reviewFlags);
    folded.metadata.skill_history = skillLoreService.appendHistory(target.metadata ?? {}, {
      event_type: 'confirmed',
      summary: `Merged “${source.skill_name}” into this skill`,
      source_type: 'manual',
    });

    const skill = await persistSurvivor(userId, target.id, folded);
    const relationshipsMoved = await rePointRelationships(userId, source.id, target.id);
    await archiveSource(userId, source, target, opts.reason);
    await confirmSuggestionsForNames(userId, [source.skill_name, ...readSkillAliases(source.metadata)]);
    skillIndexService.invalidate(userId);

    return {
      skill,
      report: {
        sourceId: source.id,
        sourceName: source.skill_name,
        targetId: target.id,
        targetName: target.skill_name,
        aliases: folded.aliases,
        relationshipsMoved,
        reviewFlags,
      },
    };
  }

  async absorbName(
    userId: string,
    targetId: string,
    incomingName: string,
    incomingProfile: SkillProfile,
    opts: { description?: string | null; suggestionId?: string; reason?: string } = {},
  ): Promise<Skill> {
    const target = await skillService.getSkill(userId, targetId);
    if (!target) throw new Error('Skill not found');

    const aliases = uniqSkillNames(
      readSkillAliases(target.metadata),
      incomingName,
    ).filter((name) => normalizeSkillKey(name) !== normalizeSkillKey(target.skill_name));

    const mergedProfile = mergeSkillProfiles(readSkillProfile(target.metadata), incomingProfile);
    const description = [target.description, opts.description]
      .map((value) => value?.trim())
      .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
      .join('\n\n') || target.description;

    const history = skillLoreService.appendHistory(target.metadata ?? {}, {
      event_type: 'confirmed',
      summary: `Merged “${incomingName.trim()}” into this skill`,
      source_type: 'suggestion',
      source_id: opts.suggestionId,
    });

    const schema = await getSkillsDbSchema();
    const now = new Date().toISOString();
    const metadata = {
      ...(target.metadata ?? {}),
      aliases,
      skill_profile: mergedProfile,
      skill_history: history,
      skill_book_visible: true,
    };
    const patch =
      schema === 'legacy'
        ? { description, metadata, updated_at: now }
        : { description, metadata, updated_at: now };

    const { data, error } = await supabaseAdmin
      .from('skills')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', targetId)
      .select()
      .single();
    if (error) throw error;

    if (opts.suggestionId) {
      await supabaseAdmin
        .from('skill_suggestions')
        .update({ status: 'confirmed', updated_at: now })
        .eq('user_id', userId)
        .eq('id', opts.suggestionId);
    } else {
      await confirmSuggestionsForNames(userId, [incomingName]);
    }

    skillIndexService.invalidate(userId);
    return data as Skill;
  }
}

export const skillMergeService = new SkillMergeService();
