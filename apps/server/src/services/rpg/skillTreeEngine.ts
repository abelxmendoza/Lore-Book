/**
 * Skill Tree Engine
 * Extends skill service with tree structure, prerequisites, and synergies
 * All stats are hidden - only used for generating natural language insights
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Skill } from '../skills/skillService';

export interface SkillTree {
  skillId: string;
  skillName: string;
  category: string;
  currentLevel: number;
  prerequisites: string[]; // Skill IDs that must be learned first
  synergies: string[]; // Skill IDs that boost this skill
  specializationPath: string | null;
  masteryLevel: number; // Beyond level 10
  decayRate: number; // How fast skill decays if not practiced
}

export interface SkillSynergy {
  skillId1: string;
  skillId2: string;
  synergyBonus: number; // Hidden bonus when both skills are used
}

export class SkillTreeEngine {
  /**
   * Define skill prerequisites and dependencies
   */
  private readonly skillPrerequisites: Record<string, string[]> = {
    // Example: Advanced skills require basic skills
    'Advanced Writing': ['Writing', 'Communication'],
    'Public Speaking': ['Communication', 'Confidence'],
    'Leadership': ['Communication', 'Decision Making'],
  };

  /**
   * Define skill synergies
   */
  private readonly skillSynergies: Record<string, string[]> = {
    // Example: Skills that complement each other
    'Cooking': ['Hosting', 'Entertaining'],
    'Writing': ['Communication', 'Storytelling'],
    'Photography': ['Art', 'Creativity'],
  };

  /**
   * Build skill tree for a user
   */
  async buildSkillTree(userId: string): Promise<SkillTree[]> {
    try {
      // Get all user skills
      const { data: skills, error } = await supabaseAdmin
        .from('skills')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch skills');
        throw error;
      }

      const skillTrees: SkillTree[] = [];

      for (const skill of skills || []) {
        const tree = await this.buildSkillTreeForSkill(skill);
        skillTrees.push(tree);
      }

      return skillTrees;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to build skill tree');
      throw error;
    }
  }

  /**
   * Build skill tree for a single skill
   */
  private async buildSkillTreeForSkill(skill: Skill): Promise<SkillTree> {
    // Get prerequisites
    const prerequisites = this.getPrerequisites(skill.skill_name);

    // Get synergies
    const synergies = this.getSynergies(skill.skill_name);

    // Determine specialization path
    const specializationPath = this.determineSpecializationPath(skill);

    // Calculate mastery level (beyond level 10)
    const masteryLevel = this.calculateMasteryLevel(skill);

    // Calculate decay rate
    const decayRate = this.calculateDecayRate(skill);

    return {
      skillId: skill.id,
      skillName: skill.skill_name,
      category: skill.skill_category,
      currentLevel: skill.current_level,
      prerequisites,
      synergies,
      specializationPath,
      masteryLevel,
      decayRate,
    };
  }

  /**
   * Get prerequisites for a skill
   */
  private getPrerequisites(skillName: string): string[] {
    // Check if skill has defined prerequisites
    for (const [advanced, prereqs] of Object.entries(this.skillPrerequisites)) {
      if (skillName.toLowerCase().includes(advanced.toLowerCase())) {
        return prereqs;
      }
    }
    return [];
  }

  /**
   * Get synergies for a skill
   */
  private getSynergies(skillName: string): string[] {
    // Check if skill has defined synergies
    for (const [skill, synSkills] of Object.entries(this.skillSynergies)) {
      if (skillName.toLowerCase().includes(skill.toLowerCase())) {
        return synSkills;
      }
    }
    return [];
  }

  /**
   * Determine specialization path
   */
  private determineSpecializationPath(skill: Skill): string | null {
    // Specialization based on category and level
    if (skill.current_level >= 5) {
      return `${skill.skill_category} Specialist`;
    }
    return null;
  }

  /**
   * Calculate mastery level (beyond level 10)
   */
  private calculateMasteryLevel(skill: Skill): number {
    if (skill.current_level < 10) return 0;

    // Mastery levels: 10+ = Master, 15+ = Grandmaster, 20+ = Legendary
    const excessXP = skill.total_xp - this.calculateXPForLevel(10);
    const masteryXP = 1000; // XP needed per mastery level
    return Math.floor(excessXP / masteryXP);
  }

  /**
   * Calculate XP needed for a level (helper)
   */
  private calculateXPForLevel(level: number): number {
    const BASE_XP = 100;
    const MULTIPLIER = 1.5;
    if (level === 1) return 0;
    return Math.floor(BASE_XP * Math.pow(MULTIPLIER, level - 2));
  }

  /**
   * Calculate decay rate
   */
  private calculateDecayRate(skill: Skill): number {
    if (!skill.last_practiced_at) return 10; // High decay if never practiced

    const lastPracticed = new Date(skill.last_practiced_at);
    const daysSince = (Date.now() - lastPracticed.getTime()) / (1000 * 60 * 60 * 24);

    // Decay increases with time since last practice
    if (daysSince > 365) return 10; // High decay
    if (daysSince > 180) return 7; // Medium decay
    if (daysSince > 90) return 5; // Low decay
    return 1; // Minimal decay
  }

  /**
   * Calculate skill synergies (hidden bonus when related skills are used together)
   */
  async calculateSkillSynergies(userId: string, skillIds: string[]): Promise<SkillSynergy[]> {
    const synergies: SkillSynergy[] = [];

    // Check each pair of skills for synergy
    for (let i = 0; i < skillIds.length; i++) {
      for (let j = i + 1; j < skillIds.length; j++) {
        const skill1 = skillIds[i];
        const skill2 = skillIds[j];

        // Check if skills are in same category or have defined synergy
        const { data: skill1Data } = await supabaseAdmin
          .from('skills')
          .select('skill_name, skill_category')
          .eq('id', skill1)
          .single();

        const { data: skill2Data } = await supabaseAdmin
          .from('skills')
          .select('skill_name, skill_category')
          .eq('id', skill2)
          .single();

        if (skill1Data && skill2Data) {
          // Same category = synergy
          if (skill1Data.skill_category === skill2Data.skill_category) {
            synergies.push({
              skillId1: skill1,
              skillId2: skill2,
              synergyBonus: 10, // Hidden bonus
            });
          }

          // Check defined synergies
          const synSkills = this.getSynergies(skill1Data.skill_name);
          if (synSkills.includes(skill2Data.skill_name)) {
            synergies.push({
              skillId1: skill1,
              skillId2: skill2,
              synergyBonus: 15, // Higher bonus for defined synergies
            });
          }
        }
      }
    }

    return synergies;
  }

  /**
   * Check if skill prerequisites are met
   */
  async checkPrerequisites(userId: string, skillName: string): Promise<{ met: boolean; missing: string[] }> {
    const prerequisites = this.getPrerequisites(skillName);
    if (prerequisites.length === 0) {
      return { met: true, missing: [] };
    }

    // Get user's skills
    const { data: userSkills } = await supabaseAdmin
      .from('skills')
      .select('skill_name, current_level')
      .eq('user_id', userId)
      .eq('is_active', true);

    const skillNames = (userSkills || []).map(s => s.skill_name.toLowerCase());
    const missing: string[] = [];

    for (const prereq of prerequisites) {
      if (!skillNames.includes(prereq.toLowerCase())) {
        missing.push(prereq);
      }
    }

    return {
      met: missing.length === 0,
      missing,
    };
  }

  /**
   * Apply skill decay (reduce level if not practiced)
   */
  async applySkillDecay(userId: string, skillId: string): Promise<void> {
    try {
      const { data: skill } = await supabaseAdmin
        .from('skills')
        .select('*')
        .eq('id', skillId)
        .eq('user_id', userId)
        .single();

      if (!skill) return;

      const tree = await this.buildSkillTreeForSkill(skill as Skill);
      const decayRate = tree.decayRate;

      if (decayRate > 5 && skill.current_level > 1) {
        // Apply decay (reduce level)
        const newLevel = Math.max(1, skill.current_level - 1);
        await supabaseAdmin
          .from('skills')
          .update({
            current_level: newLevel,
            updated_at: new Date().toISOString(),
          })
          .eq('id', skillId);
      }
    } catch (error) {
      logger.error({ error, userId, skillId }, 'Failed to apply skill decay');
    }
  }

  /**
   * Get skill combinations (combo skills)
   */
  async getSkillCombinations(userId: string): Promise<Array<{ skills: string[]; comboName: string }>> {
    const { data: skills } = await supabaseAdmin
      .from('skills')
      .select('id, skill_name, current_level')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('current_level', 5); // Only high-level skills can combo

    if (!skills || skills.length < 2) return [];

    const combinations: Array<{ skills: string[]; comboName: string }> = [];

    // Find skills that can combine
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const skill1 = skills[i];
        const skill2 = skills[j];

        // Check if skills have synergy
        const synergies = await this.calculateSkillSynergies(userId, [skill1.id, skill2.id]);
        if (synergies.length > 0) {
          combinations.push({
            skills: [skill1.id, skill2.id],
            comboName: `${skill1.skill_name} + ${skill2.skill_name}`,
          });
        }
      }
    }

    return combinations;
  }
}

export const skillTreeEngine = new SkillTreeEngine();
