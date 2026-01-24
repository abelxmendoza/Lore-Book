/**
 * Quest Chain Engine
 * Builds quest chains, tracks dependencies, and calculates consequences
 * All stats are hidden - only used for generating natural language insights
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Quest } from '../quests/types';

export interface QuestChain {
  id: string;
  user_id: string;
  chain_id: string;
  chain_name: string;
  chain_description: string | null;
  quest_ids: string[];
  dependencies: Array<{ quest_id: string; depends_on: string; type: string }>;
  branching_points: Array<{ quest_id: string; branches: string[] }>;
  consequences: Array<{ quest_id: string; affects: string[]; type: string }>;
  storyline_progress: number;
  epic_completion: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class QuestChainEngine {
  /**
   * Build quest chains from quest relationships
   */
  async buildQuestChains(userId: string): Promise<QuestChain[]> {
    try {
      // Get all quests
      const { data: quests, error } = await supabaseAdmin
        .from('quests')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'completed', 'paused']);

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch quests');
        throw error;
      }

      // Group quests by chain_id
      const chainsMap = new Map<string, Quest[]>();
      for (const quest of quests || []) {
        if (quest.quest_chain_id) {
          if (!chainsMap.has(quest.quest_chain_id)) {
            chainsMap.set(quest.quest_chain_id, []);
          }
          chainsMap.get(quest.quest_chain_id)!.push(quest);
        }
      }

      // Also create chains from parent-child relationships
      const parentChildChains = this.buildChainsFromParentChild(quests || []);
      for (const [chainId, chainQuests] of parentChildChains.entries()) {
        if (!chainsMap.has(chainId)) {
          chainsMap.set(chainId, []);
        }
        chainsMap.get(chainId)!.push(...chainQuests);
      }

      // Build chain stats for each chain
      const chains: QuestChain[] = [];
      for (const [chainId, chainQuests] of chainsMap.entries()) {
        const chain = await this.buildChainStats(userId, chainId, chainQuests);
        chains.push(chain);
      }

      return chains;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to build quest chains');
      throw error;
    }
  }

  /**
   * Build chains from parent-child quest relationships
   */
  private buildChainsFromParentChild(quests: Quest[]): Map<string, Quest[]> {
    const chains = new Map<string, Quest[]>();

    // Find root quests (no parent)
    const rootQuests = quests.filter(q => !q.parent_quest_id);

    for (const root of rootQuests) {
      const chainId = root.quest_chain_id || `chain_${root.id}`;
      const chainQuests = this.collectChildQuests(root, quests);
      chains.set(chainId, chainQuests);
    }

    return chains;
  }

  /**
   * Collect all child quests recursively
   */
  private collectChildQuests(parent: Quest, allQuests: Quest[]): Quest[] {
    const result = [parent];
    const children = allQuests.filter(q => q.parent_quest_id === parent.id);
    for (const child of children) {
      result.push(...this.collectChildQuests(child, allQuests));
    }
    return result;
  }

  /**
   * Build chain stats
   */
  async buildChainStats(userId: string, chainId: string, quests: Quest[]): Promise<QuestChain> {
    // Get or create chain name
    const chainName = this.generateChainName(quests);
    const chainDescription = this.generateChainDescription(quests);

    // Get quest IDs
    const questIds = quests.map(q => q.id);

    // Build dependencies
    const dependencies = this.buildDependencies(quests);

    // Identify branching points
    const branchingPoints = this.identifyBranchingPoints(quests);

    // Calculate consequences
    const consequences = this.calculateConsequences(quests);

    // Calculate storyline progress
    const storylineProgress = this.calculateStorylineProgress(quests);

    // Check epic completion
    const epicCompletion = this.checkEpicCompletion(quests);

    // Upsert chain
    const chain: Partial<QuestChain> = {
      user_id: userId,
      chain_id: chainId,
      chain_name: chainName,
      chain_description: chainDescription,
      quest_ids: questIds,
      dependencies,
      branching_points: branchingPoints,
      consequences,
      storyline_progress: storylineProgress,
      epic_completion: epicCompletion,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('quest_chains')
      .upsert(chain, {
        onConflict: 'user_id,chain_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, userId, chainId }, 'Failed to upsert quest chain');
      throw error;
    }

    return data as QuestChain;
  }

  /**
   * Generate chain name
   */
  private generateChainName(quests: Quest[]): string {
    if (quests.length === 0) return 'Unknown Chain';

    // Use category or type from first quest
    const firstQuest = quests[0];
    if (firstQuest.category) {
      return `${firstQuest.category} Journey`;
    }
    if (firstQuest.quest_type === 'main') {
      return 'Main Quest Line';
    }
    return 'Quest Chain';
  }

  /**
   * Generate chain description
   */
  private generateChainDescription(quests: Quest[]): string {
    if (quests.length === 0) return null;

    const completed = quests.filter(q => q.status === 'completed').length;
    return `${completed} of ${quests.length} quests completed`;
  }

  /**
   * Build dependencies
   */
  private buildDependencies(quests: Quest[]): Array<{ quest_id: string; depends_on: string; type: string }> {
    const dependencies: Array<{ quest_id: string; depends_on: string; type: string }> = [];

    for (const quest of quests) {
      if (quest.parent_quest_id) {
        dependencies.push({
          quest_id: quest.id,
          depends_on: quest.parent_quest_id,
          type: 'blocks', // Child quest blocked by parent
        });
      }

      // Check quest dependencies table
      // This would query quest_dependencies table if it exists
    }

    return dependencies;
  }

  /**
   * Identify branching points
   */
  private identifyBranchingPoints(quests: Quest[]): Array<{ quest_id: string; branches: string[] }> {
    const branchingPoints: Array<{ quest_id: string; branches: string[] }> = [];

    // Find quests with multiple children (branching)
    for (const quest of quests) {
      const children = quests.filter(q => q.parent_quest_id === quest.id);
      if (children.length > 1) {
        branchingPoints.push({
          quest_id: quest.id,
          branches: children.map(c => c.id),
        });
      }
    }

    return branchingPoints;
  }

  /**
   * Calculate consequences
   */
  private calculateConsequences(quests: Quest[]): Array<{ quest_id: string; affects: string[]; type: string }> {
    const consequences: Array<{ quest_id: string; affects: string[]; type: string }> = [];

    // Completed quests affect future quests
    for (const quest of quests) {
      if (quest.status === 'completed') {
        const affectedQuests = quests.filter(q => 
          q.parent_quest_id === quest.id || 
          (q.related_goal_id && quest.related_goal_id === q.related_goal_id)
        );

        if (affectedQuests.length > 0) {
          consequences.push({
            quest_id: quest.id,
            affects: affectedQuests.map(q => q.id),
            type: 'enables', // Completed quest enables future quests
          });
        }
      }
    }

    return consequences;
  }

  /**
   * Calculate storyline progress (0-100)
   */
  private calculateStorylineProgress(quests: Quest[]): number {
    if (quests.length === 0) return 0;

    const completed = quests.filter(q => q.status === 'completed').length;
    const progress = (completed / quests.length) * 100;

    // Also factor in progress percentage of active quests
    const activeQuests = quests.filter(q => q.status === 'active');
    const avgProgress = activeQuests.length > 0
      ? activeQuests.reduce((sum, q) => sum + q.progress_percentage, 0) / activeQuests.length
      : 0;

    const weightedProgress = (completed / quests.length) * 100 + (avgProgress * activeQuests.length / quests.length);
    return Math.min(100, Math.max(0, Math.round(weightedProgress)));
  }

  /**
   * Check epic completion
   */
  private checkEpicCompletion(quests: Quest[]): boolean {
    // Epic completion: all quests completed and chain has significant length
    const allCompleted = quests.every(q => q.status === 'completed');
    const isLongChain = quests.length >= 5;
    return allCompleted && isLongChain;
  }

  /**
   * Get all quest chains for a user
   */
  async getQuestChains(userId: string): Promise<QuestChain[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('quest_chains')
        .select('*')
        .eq('user_id', userId)
        .order('storyline_progress', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch quest chains');
        throw error;
      }

      return (data || []) as QuestChain[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get quest chains');
      throw error;
    }
  }

  /**
   * Update quest chains when quests change
   */
  async updateOnQuestChange(userId: string): Promise<void> {
    try {
      await this.buildQuestChains(userId);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update quest chains on quest change');
    }
  }
}

export const questChainEngine = new QuestChainEngine();
