import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';

export type SkillCategory = 'professional' | 'creative' | 'physical' | 'social' | 'intellectual' | 'emotional' | 'practical' | 'artistic' | 'technical' | 'other';

export interface Skill {
  id: string;
  user_id: string;
  skill_name: string;
  skill_category: SkillCategory;
  current_level: number;
  total_xp: number;
  xp_to_next_level: number;
  description: string | null;
  first_mentioned_at: string;
  last_practiced_at: string | null;
  practice_count: number;
  auto_detected: boolean;
  confidence_score: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateSkillInput {
  skill_name: string;
  skill_category: SkillCategory;
  description?: string;
  auto_detected?: boolean;
  confidence_score?: number;
}

export interface UpdateSkillInput {
  skill_name?: string;
  skill_category?: SkillCategory;
  description?: string;
  is_active?: boolean;
}

export interface SkillProgress {
  id: string;
  skill_id: string;
  user_id: string;
  xp_gained: number;
  level_before: number;
  level_after: number;
  source_type: 'memory' | 'achievement' | 'manual';
  source_id: string | null;
  notes: string | null;
  timestamp: string;
  created_at: string;
}

/**
 * Skill Service
 * Manages user skills, XP tracking, and level progression
 */
class SkillService {
  private readonly BASE_XP_PER_LEVEL = 100;
  private readonly XP_MULTIPLIER = 1.5; // Each level requires 1.5x more XP

  /**
   * Calculate XP needed for a level
   */
  private calculateXPForLevel(level: number): number {
    if (level === 1) return 0;
    return Math.floor(this.BASE_XP_PER_LEVEL * Math.pow(this.XP_MULTIPLIER, level - 2));
  }

  /**
   * Calculate level from total XP
   */
  private calculateLevelFromXP(totalXP: number): number {
    if (totalXP < this.BASE_XP_PER_LEVEL) return 1;
    
    let level = 1;
    let xpNeeded = 0;
    
    while (xpNeeded <= totalXP) {
      level++;
      xpNeeded += this.calculateXPForLevel(level);
      if (xpNeeded > totalXP) {
        level--;
        break;
      }
    }
    
    return Math.max(1, level);
  }

  /**
   * Create a new skill
   */
  async createSkill(userId: string, input: CreateSkillInput): Promise<Skill> {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await supabaseAdmin
        .from('skills')
        .insert({
          user_id: userId,
          skill_name: input.skill_name,
          skill_category: input.skill_category,
          description: input.description || null,
          auto_detected: input.auto_detected ?? false,
          confidence_score: input.confidence_score ?? 0.5,
          first_mentioned_at: now,
          current_level: 1,
          total_xp: 0,
          xp_to_next_level: this.BASE_XP_PER_LEVEL,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, input }, 'Failed to create skill');
        throw error;
      }

      return data as Skill;
    } catch (error) {
      logger.error({ error, userId, input }, 'Failed to create skill');
      throw error;
    }
  }

  /**
   * Get all skills for a user
   */
  async getSkills(userId: string, filters?: { active_only?: boolean; category?: SkillCategory }): Promise<Skill[]> {
    try {
      let query = supabaseAdmin
        .from('skills')
        .select('*')
        .eq('user_id', userId)
        .order('total_xp', { ascending: false });

      if (filters?.active_only) {
        query = query.eq('is_active', true);
      }

      if (filters?.category) {
        query = query.eq('skill_category', filters.category);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId }, 'Failed to get skills');
        throw error;
      }

      return (data || []) as Skill[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get skills');
      throw error;
    }
  }

  /**
   * Get a single skill
   */
  async getSkill(userId: string, skillId: string): Promise<Skill | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('skills')
        .select('*')
        .eq('id', skillId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        logger.error({ error, userId, skillId }, 'Failed to get skill');
        throw error;
      }

      return data as Skill;
    } catch (error) {
      logger.error({ error, userId, skillId }, 'Failed to get skill');
      throw error;
    }
  }

  /**
   * Update a skill
   */
  async updateSkill(userId: string, skillId: string, input: UpdateSkillInput): Promise<Skill> {
    try {
      const { data, error } = await supabaseAdmin
        .from('skills')
        .update({
          ...input,
          updated_at: new Date().toISOString()
        })
        .eq('id', skillId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, skillId, input }, 'Failed to update skill');
        throw error;
      }

      return data as Skill;
    } catch (error) {
      logger.error({ error, userId, skillId, input }, 'Failed to update skill');
      throw error;
    }
  }

  /**
   * Add XP to a skill (and handle level ups)
   */
  async addXP(
    userId: string,
    skillId: string,
    xpAmount: number,
    sourceType: 'memory' | 'achievement' | 'manual',
    sourceId?: string,
    notes?: string
  ): Promise<{ skill: Skill; leveledUp: boolean; newLevel?: number }> {
    try {
      const skill = await this.getSkill(userId, skillId);
      if (!skill) {
        throw new Error('Skill not found');
      }

      const levelBefore = skill.current_level;
      const newTotalXP = skill.total_xp + xpAmount;
      const newLevel = this.calculateLevelFromXP(newTotalXP);
      const leveledUp = newLevel > levelBefore;

      // Calculate XP needed for next level
      const currentLevelXP = this.calculateXPForLevel(newLevel);
      const nextLevelXP = this.calculateXPForLevel(newLevel + 1);
      const xpInCurrentLevel = newTotalXP - currentLevelXP;
      const xpToNextLevel = nextLevelXP - newTotalXP;

      // Update skill
      const { data: updatedSkill, error: updateError } = await supabaseAdmin
        .from('skills')
        .update({
          total_xp: newTotalXP,
          current_level: newLevel,
          xp_to_next_level: Math.max(0, xpToNextLevel),
          last_practiced_at: new Date().toISOString(),
          practice_count: skill.practice_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', skillId)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) {
        logger.error({ updateError, userId, skillId }, 'Failed to update skill XP');
        throw updateError;
      }

      // Record progress history
      await supabaseAdmin
        .from('skill_progress')
        .insert({
          skill_id: skillId,
          user_id: userId,
          xp_gained: xpAmount,
          level_before: levelBefore,
          level_after: newLevel,
          source_type: sourceType,
          source_id: sourceId || null,
          notes: notes || null,
          timestamp: new Date().toISOString()
        });

      return {
        skill: updatedSkill as Skill,
        leveledUp,
        newLevel: leveledUp ? newLevel : undefined
      };
    } catch (error) {
      logger.error({ error, userId, skillId, xpAmount }, 'Failed to add XP to skill');
      throw error;
    }
  }

  /**
   * Get skill progress history
   */
  async getSkillProgress(userId: string, skillId?: string, limit: number = 50): Promise<SkillProgress[]> {
    try {
      let query = supabaseAdmin
        .from('skill_progress')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (skillId) {
        query = query.eq('skill_id', skillId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId, skillId }, 'Failed to get skill progress');
        throw error;
      }

      return (data || []) as SkillProgress[];
    } catch (error) {
      logger.error({ error, userId, skillId }, 'Failed to get skill progress');
      throw error;
    }
  }

  /**
   * Delete a skill
   */
  async deleteSkill(userId: string, skillId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('skills')
        .delete()
        .eq('id', skillId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ error, userId, skillId }, 'Failed to delete skill');
        throw error;
      }
    } catch (error) {
      logger.error({ error, userId, skillId }, 'Failed to delete skill');
      throw error;
    }
  }
}

export const skillService = new SkillService();
