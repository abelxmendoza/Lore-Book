import { logger } from '../../logger';
import { skillExtractionService } from '../skills/skillExtractionService';
import { supabaseAdmin } from '../supabaseClient';

import type { Quest } from './types';

type RewardEvent = 'created' | 'progress' | 'completed' | 'paused' | 'abandoned';

type RewardResult = {
  skillXp: number;
  achievements: string[];
};

class QuestRewardService {
  private scoreQuest(quest: Quest): number {
    const priority = quest.priority ?? 5;
    const importance = quest.importance ?? 5;
    const impact = quest.impact ?? 5;
    const difficulty = quest.difficulty ?? 5;
    return priority * 0.25 + importance * 0.3 + impact * 0.3 + difficulty * 0.15;
  }

  private calculateSkillXp(event: RewardEvent, quest: Quest, progressDelta = 0): number {
    const score = this.scoreQuest(quest);
    const typeBonus: Record<string, number> = {
      main: 18,
      side: 10,
      daily: 6,
      achievement: 14,
    };
    const sourceBonus = quest.source === 'extracted' || quest.source === 'suggested' ? 5 : 0;

    switch (event) {
      case 'created':
        return Math.round(10 + score * 2 + (typeBonus[quest.quest_type] ?? 8) + sourceBonus);
      case 'progress':
        return Math.max(5, Math.min(80, Math.round(progressDelta * (0.55 + score / 18))));
      case 'completed':
        return Math.round(45 + score * 8 + (typeBonus[quest.quest_type] ?? 8) * 2 + sourceBonus);
      case 'paused':
        return 5;
      case 'abandoned':
        return 0;
      default:
        return 0;
    }
  }

  private rarityForXp(xp: number): 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' {
    if (xp >= 175) return 'legendary';
    if (xp >= 125) return 'epic';
    if (xp >= 80) return 'rare';
    if (xp >= 35) return 'uncommon';
    return 'common';
  }

  private async unlockAchievementOnce(
    userId: string,
    achievement: {
      name: string;
      description: string;
      type?: 'milestone' | 'growth' | 'reflection' | 'other';
      icon?: string;
      xp: number;
      criteria: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }
  ): Promise<string | null> {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('achievements')
      .select('id')
      .eq('user_id', userId)
      .eq('achievement_name', achievement.name)
      .limit(1);

    if (existingError) throw existingError;
    if (existing && existing.length > 0) return null;

    const { error } = await supabaseAdmin
      .from('achievements')
      .insert({
        user_id: userId,
        achievement_name: achievement.name,
        achievement_type: achievement.type ?? 'growth',
        description: achievement.description,
        icon_name: achievement.icon ?? 'trophy',
        criteria_met: achievement.criteria,
        unlocked_at: new Date().toISOString(),
        xp_reward: achievement.xp,
        skill_xp_rewards: {},
        rarity: this.rarityForXp(achievement.xp),
        metadata: {
          source: 'quest_reward_service',
          ...achievement.metadata,
        },
      });

    if (error) throw error;
    return achievement.name;
  }

  private async grantSkillXp(userId: string, quest: Quest, xp: number, reason: string): Promise<void> {
    if (xp <= 0) return;
    await skillExtractionService.processQuestForSkills(
      userId,
      quest.id,
      `${quest.title}\n${quest.description ?? ''}\n${quest.category ?? ''}\n${(quest.tags ?? []).join(', ')}`,
      { completed: quest.status === 'completed', xpOverride: xp, reason }
    );
  }

  async awardCreated(userId: string, quest: Quest): Promise<RewardResult> {
    const skillXp = this.calculateSkillXp('created', quest);
    const achievements = await this.collectAchievements([
      this.unlockAchievementOnce(userId, {
        name: 'Quest Accepted',
        description: 'Added your first quest to the log.',
        icon: 'sparkles',
        xp: 25,
        criteria: { quest_id: quest.id, event: 'created' },
      }),
    ]);

    await this.grantSkillXp(userId, quest, skillXp, 'Accepted a quest');
    return { skillXp, achievements };
  }

  async awardProgress(userId: string, quest: Quest, previousProgress: number, nextProgress: number): Promise<RewardResult> {
    const progressDelta = Math.max(0, nextProgress - previousProgress);
    if (progressDelta <= 0) return { skillXp: 0, achievements: [] };

    const skillXp = this.calculateSkillXp('progress', quest, progressDelta);
    const achievements = await this.collectAchievements([
      previousProgress === 0 && nextProgress > 0
        ? this.unlockAchievementOnce(userId, {
            name: 'Momentum Started',
            description: 'Logged progress on a quest.',
            icon: 'trending-up',
            xp: 20,
            criteria: { quest_id: quest.id, event: 'progress_update', progress: nextProgress },
          })
        : Promise.resolve(null),
      previousProgress < 50 && nextProgress >= 50
        ? this.unlockAchievementOnce(userId, {
            name: `Halfway There: ${quest.title}`.slice(0, 120),
            description: `Reached at least 50% on "${quest.title}".`,
            icon: 'target',
            xp: 35,
            criteria: { quest_id: quest.id, event: 'progress_update', threshold: 50 },
          })
        : Promise.resolve(null),
    ]);

    await this.grantSkillXp(userId, quest, skillXp, `Quest progress advanced by ${progressDelta}%`);
    return { skillXp, achievements };
  }

  async awardCompleted(userId: string, quest: Quest): Promise<RewardResult> {
    const skillXp = this.calculateSkillXp('completed', quest);
    const achievementXp = Math.round(skillXp * 0.75);
    const achievements = await this.collectAchievements([
      this.unlockAchievementOnce(userId, {
        name: 'Quest Complete',
        description: 'Completed your first quest.',
        icon: 'check-circle',
        xp: 50,
        criteria: { quest_id: quest.id, event: 'completed' },
      }),
      this.unlockAchievementOnce(userId, {
        name: `Completed: ${quest.title}`.slice(0, 120),
        description: `Finished "${quest.title}".`,
        icon: quest.quest_type === 'main' ? 'trophy' : 'check-circle',
        xp: achievementXp,
        criteria: {
          quest_id: quest.id,
          event: 'completed',
          quest_type: quest.quest_type,
          priority: quest.priority,
          importance: quest.importance,
          impact: quest.impact,
          difficulty: quest.difficulty ?? 5,
        },
        metadata: { quest_type: quest.quest_type },
      }),
    ]);

    await this.grantSkillXp(userId, quest, skillXp, 'Completed a quest');
    return { skillXp, achievements };
  }

  async awardPaused(userId: string, quest: Quest): Promise<RewardResult> {
    const skillXp = this.calculateSkillXp('paused', quest);
    const achievements = await this.collectAchievements([
      this.unlockAchievementOnce(userId, {
        name: 'Strategic Pause',
        description: 'Paused a quest instead of letting it go stale.',
        icon: 'pause',
        xp: 10,
        type: 'reflection',
        criteria: { quest_id: quest.id, event: 'paused' },
      }),
    ]);
    await this.grantSkillXp(userId, quest, skillXp, 'Maintained quest focus by pausing intentionally');
    return { skillXp, achievements };
  }

  async awardAbandoned(userId: string, quest: Quest): Promise<RewardResult> {
    const achievements = await this.collectAchievements([
      this.unlockAchievementOnce(userId, {
        name: 'Clear Pivot',
        description: 'Closed a quest that no longer matched your direction.',
        icon: 'flag',
        xp: 10,
        type: 'reflection',
        criteria: { quest_id: quest.id, event: 'abandoned' },
      }),
    ]);
    return { skillXp: 0, achievements };
  }

  private async collectAchievements(promises: Array<Promise<string | null>>): Promise<string[]> {
    const settled = await Promise.allSettled(promises);
    return settled.flatMap(result => {
      if (result.status === 'fulfilled' && result.value) return [result.value];
      if (result.status === 'rejected') {
        logger.debug({ err: result.reason }, 'Quest achievement unlock skipped');
      }
      return [];
    });
  }
}

export const questRewardService = new QuestRewardService();
