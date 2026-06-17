import { logger } from '../../logger';
import { achievementService } from '../achievements/achievementService';
import { skillService } from '../skills/skillService';

/** Fire-and-forget XP + achievement checks after user confirms skills/quests. */
export const progressionTracker = {
  async afterSkillMaterialized(userId: string, skillId: string, suggestionId?: string): Promise<void> {
    try {
      await skillService.addXP(
        userId,
        skillId,
        25,
        'manual',
        suggestionId,
        'Skill confirmed from your story'
      );
      await achievementService.checkAchievements(userId);
    } catch (err) {
      logger.debug({ err, userId, skillId }, 'Progression after skill materialize failed');
    }
  },

  async afterQuestMaterialized(userId: string): Promise<void> {
    try {
      await achievementService.checkAchievements(userId);
    } catch (err) {
      logger.debug({ err, userId }, 'Progression after quest materialize failed');
    }
  },
};
