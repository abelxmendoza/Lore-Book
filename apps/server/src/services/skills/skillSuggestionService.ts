import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  type ExtractedSkillProfile,
  type SkillProfile,
  extractedToProfile,
  mergeSkillProfiles,
  readSkillProfile,
} from './skillProfile';
import { skillService, type SkillCategory, type Skill } from './skillService';
import { skillLoreService } from './skillLoreService';
import { skillRelationshipService } from './skillRelationshipService';
import { skillIndexService } from './skillIndexService';
import { normalizeSkillKey } from './skillIdentity';
import { progressionTracker } from '../progression/progressionTracker';

export type SkillSuggestionRow = {
  id: string;
  skill_name: string;
  skill_category: string;
  skill_type: string;
  monetization: string;
  proficiency: number;
  confidence: number;
  enjoyment: number;
  usage_frequency: string;
  trajectory: string;
  description?: string | null;
  origin_story?: string | null;
  first_learned_context?: string | null;
  related_jobs?: string[];
  related_projects?: string[];
  parent_skill_name?: string | null;
  related_skill_names?: string[];
  evidence?: Array<{ text: string } | string>;
  source?: 'chat' | 'journal' | 'learning_record' | 'llm_scan';
  source_message_id?: string | null;
};

export type MaterializeSkillInput = {
  skill_name: string;
  skill_category: SkillCategory;
  skill_type?: string;
  monetization?: string;
  proficiency?: number;
  confidence?: number;
  enjoyment?: number;
  usage_frequency?: string;
  trajectory?: string;
  description?: string | null;
  origin_story?: string | null;
  first_learned_context?: string | null;
  related_jobs?: string[];
  related_projects?: string[];
  parent_skill_name?: string | null;
  related_skill_names?: string[];
  evidence?: Array<{ text: string } | string>;
  suggestionId?: string;
  sourceMessageId?: string | null;
  source?: 'chat' | 'journal' | 'suggestion' | 'llm_scan';
};

function isTableMissing(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'PGRST205';
}

function evidenceToProfile(raw: MaterializeSkillInput['evidence']): SkillProfile['evidence'] {
  if (!raw) return [];
  return raw
    .map((e) => (typeof e === 'string' ? { text: e } : e))
    .filter((e) => e.text?.trim());
}

class SkillSuggestionService {
  async upsertFromExtraction(
    userId: string,
    extracted: ExtractedSkillProfile,
    opts: { sourceMessageId?: string; source?: 'chat' | 'journal' | 'llm_scan' } = {}
  ): Promise<void> {
    if (extracted.confidence < 0.45) return;

    const profile = extractedToProfile(extracted, opts.sourceMessageId);
    const payload = {
      user_id: userId,
      skill_name: extracted.skill_name.trim(),
      skill_category: extracted.skill_category,
      skill_type: profile.skill_type,
      monetization: profile.monetization,
      proficiency: profile.proficiency,
      confidence: extracted.confidence,
      enjoyment: profile.enjoyment,
      usage_frequency: profile.usage_frequency,
      trajectory: profile.trajectory,
      description: extracted.description ?? null,
      origin_story: profile.origin_story ?? null,
      first_learned_context: profile.first_learned_context ?? null,
      related_jobs: profile.related_jobs ?? [],
      related_projects: profile.related_projects ?? [],
      parent_skill_name: extracted.parent_skill_name ?? null,
      related_skill_names: extracted.related_skill_names ?? [],
      evidence: profile.evidence ?? [],
      source_message_id: opts.sourceMessageId ?? null,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('skill_suggestions')
      .upsert(payload, { onConflict: 'user_id,skill_name' });

    if (error && !isTableMissing(error)) {
      logger.warn({ error, userId, skill: extracted.skill_name }, 'Failed to upsert skill suggestion');
    }
  }

  async getPendingSuggestions(userId: string): Promise<SkillSuggestionRow[]> {
    const { data, error } = await supabaseAdmin
      .from('skill_suggestions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('confidence', { ascending: false })
      .limit(24);

    if (error) {
      if (isTableMissing(error)) return [];
      logger.warn({ error, userId }, 'Failed to load skill suggestions');
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      skill_name: row.skill_name,
      skill_category: row.skill_category,
      skill_type: row.skill_type,
      monetization: row.monetization,
      proficiency: row.proficiency,
      confidence: Number(row.confidence),
      enjoyment: row.enjoyment,
      usage_frequency: row.usage_frequency,
      trajectory: row.trajectory,
      description: row.description,
      origin_story: row.origin_story,
      first_learned_context: row.first_learned_context,
      related_jobs: row.related_jobs ?? [],
      related_projects: row.related_projects ?? [],
      parent_skill_name: row.parent_skill_name ?? null,
      related_skill_names: row.related_skill_names ?? [],
      evidence: row.evidence ?? [],
      source: row.source ?? 'chat',
      source_message_id: row.source_message_id,
    }));
  }

  async hasAnySuggestions(userId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from('skill_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) {
      if (isTableMissing(error)) return false;
      return false;
    }
    return (count ?? 0) > 0;
  }

  async rejectSuggestion(userId: string, suggestionId: string): Promise<void> {
    await supabaseAdmin
      .from('skill_suggestions')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', suggestionId);
  }

  async rejectByName(userId: string, skillName: string): Promise<void> {
    const key = normalizeSkillKey(skillName);
    const pending = await this.getPendingSuggestions(userId);
    const match = pending.find((p) => normalizeSkillKey(p.skill_name) === key);
    if (match) {
      await this.rejectSuggestion(userId, match.id);
      return;
    }
    const { error } = await supabaseAdmin.from('skill_suggestions').upsert(
      {
        user_id: userId,
        skill_name: skillName.trim(),
        skill_category: 'other',
        status: 'rejected',
        confidence: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,skill_name' }
    );
    if (error && !isTableMissing(error)) {
      logger.debug({ error, userId, skillName }, 'rejectByName upsert failed');
    }
  }

  /** Create or merge a confirmed skill with lore, history, relationships, and index. */
  async materializeSkill(userId: string, input: MaterializeSkillInput): Promise<Skill> {
    const profile: SkillProfile = {
      skill_type: (input.skill_type as SkillProfile['skill_type']) ?? 'professional',
      monetization: (input.monetization as SkillProfile['monetization']) ?? 'unpaid',
      proficiency: input.proficiency ?? 50,
      enjoyment: input.enjoyment ?? 50,
      usage_frequency: (input.usage_frequency as SkillProfile['usage_frequency']) ?? 'rarely',
      trajectory: (input.trajectory as SkillProfile['trajectory']) ?? 'unknown',
      origin_story: input.origin_story ?? undefined,
      first_learned_context: input.first_learned_context ?? undefined,
      related_jobs: input.related_jobs ?? [],
      related_projects: input.related_projects ?? [],
      evidence: evidenceToProfile(input.evidence),
      is_active: true,
      last_used_at: new Date().toISOString(),
    };

    const existing = (await skillService.getSkills(userId)).find(
      (s) => normalizeSkillKey(s.skill_name) === normalizeSkillKey(input.skill_name)
    );

    let skill: Skill;
    if (existing) {
      const merged = mergeSkillProfiles(readSkillProfile(existing.metadata), profile);
      skill = await skillService.updateSkillMetadata(userId, existing.id, {
        skill_profile: merged,
      });
    } else {
      skill = await skillService.createSkill(userId, {
        skill_name: input.skill_name.trim(),
        skill_category: input.skill_category,
        description: input.description ?? undefined,
        auto_detected: true,
        confidence_score: Number(input.confidence ?? 0.5),
        metadata: { skill_profile: profile },
      });
    }

    const lore = await skillLoreService.bootstrapFromProfile(
      userId,
      skill.id,
      skill.skill_name,
      readSkillProfile(skill.metadata) ?? profile,
      {
        suggestionId: input.suggestionId,
        sourceType: input.source === 'journal' ? 'journal' : input.source === 'chat' ? 'chat' : 'suggestion',
        sourceId: input.sourceMessageId ?? input.suggestionId,
        description: input.description ?? undefined,
      }
    );

    skill = await skillService.updateSkillMetadata(userId, skill.id, {
      ...skillLoreService.buildIdentityMetadata(skill.id, skill.skill_name, skill.metadata),
      skill_profile: lore.skill_profile,
      skill_history: lore.skill_history,
    });

    await skillRelationshipService.linkFromExtraction(userId, skill.id, {
      parent_skill_name: input.parent_skill_name ?? undefined,
      related_skill_names: input.related_skill_names,
      confidence: input.confidence,
    });

    if (input.suggestionId) {
      await supabaseAdmin
        .from('skill_suggestions')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', input.suggestionId);
    } else {
      try {
        await supabaseAdmin
          .from('skill_suggestions')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .ilike('skill_name', input.skill_name.trim());
      } catch {
        /* non-blocking */
      }
    }

    skillIndexService.invalidate(userId);
    await skillRelationshipService.resolvePendingParentLinks(userId);

    void progressionTracker.afterSkillMaterialized(userId, skill.id, input.suggestionId);

    return skill;
  }

  async confirmSuggestion(userId: string, suggestionId: string): Promise<Skill> {
    const { data: suggestion } = await supabaseAdmin
      .from('skill_suggestions')
      .select('*')
      .eq('user_id', userId)
      .eq('id', suggestionId)
      .single();

    if (!suggestion) throw new Error('Suggestion not found');

    return this.materializeSkill(userId, {
      skill_name: suggestion.skill_name,
      skill_category: suggestion.skill_category as SkillCategory,
      skill_type: suggestion.skill_type,
      monetization: suggestion.monetization,
      proficiency: suggestion.proficiency,
      confidence: Number(suggestion.confidence),
      enjoyment: suggestion.enjoyment,
      usage_frequency: suggestion.usage_frequency,
      trajectory: suggestion.trajectory,
      description: suggestion.description,
      origin_story: suggestion.origin_story,
      first_learned_context: suggestion.first_learned_context,
      related_jobs: suggestion.related_jobs ?? [],
      related_projects: suggestion.related_projects ?? [],
      parent_skill_name: suggestion.parent_skill_name,
      related_skill_names: suggestion.related_skill_names ?? [],
      evidence: suggestion.evidence ?? [],
      suggestionId,
      sourceMessageId: suggestion.source_message_id,
      source: suggestion.source ?? 'suggestion',
    });
  }
}

export const skillSuggestionService = new SkillSuggestionService();
