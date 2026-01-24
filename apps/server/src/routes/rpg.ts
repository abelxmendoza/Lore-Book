/**
 * RPG Routes
 * Story-driven endpoints that return natural language insights only
 * No numbers, stats, or game terminology visible to users
 */

import { Router } from 'express';
import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { companionEngine } from '../services/rpg/companionEngine';
import { locationEngine } from '../services/rpg/locationEngine';
import { factionEngine } from '../services/rpg/factionEngine';
import { chapterEngine } from '../services/rpg/chapterEngine';
import { challengeEngine } from '../services/rpg/challengeEngine';
import { skillTreeEngine } from '../services/rpg/skillTreeEngine';
import { resourceEngine } from '../services/rpg/resourceEngine';
import { questChainEngine } from '../services/rpg/questChainEngine';
import { companionInsightGenerator } from '../services/rpg/insights/companionInsights';
import { locationInsightGenerator } from '../services/rpg/insights/locationInsights';
import { factionInsightGenerator } from '../services/rpg/insights/factionInsights';
import { chapterInsightGenerator } from '../services/rpg/insights/chapterInsights';
import { challengeInsightGenerator } from '../services/rpg/insights/challengeInsights';
import { skillInsightGenerator } from '../services/rpg/insights/skillInsights';
import { resourceInsightGenerator } from '../services/rpg/insights/resourceInsights';
import { questChainInsightGenerator } from '../services/rpg/insights/questChainInsights';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

/**
 * GET /api/rpg/companions
 * Returns "People in Your Life" with insights
 */
router.get('/companions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await companionEngine.getCompanionStats(userId);
    const insights = await companionInsightGenerator.generateAllInsights(userId, stats);

    // Get character names for display
    const characterIds = stats.map(s => s.character_id);
    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, name, summary')
      .eq('user_id', userId)
      .in('id', characterIds);

    const companions = stats.map(stat => {
      const character = characters?.find(c => c.id === stat.character_id);
      const characterInsights = insights.filter(i => i.characterId === stat.character_id);

      return {
        id: stat.character_id,
        name: character?.name || 'Unknown',
        summary: character?.summary || null,
        insights: characterInsights.map(i => ({
          text: i.text,
          type: i.type,
          suggestion: i.suggestion,
        })),
      };
    });

    res.json({
      companions,
      summary: `You have ${companions.length} important people in your life`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get companions');
    res.status(500).json({ error: 'Failed to get companions' });
  }
});

/**
 * GET /api/rpg/locations
 * Returns "Places That Matter" with stories
 */
router.get('/locations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const stats = await locationEngine.getLocationStats(userId);
    const insights = await locationInsightGenerator.generateAllInsights(userId, stats);

    // Get location names for display
    const locationIds = stats.map(s => s.location_id);
    const { data: locations } = await supabaseAdmin
      .from('locations')
      .select('id, name, type')
      .eq('user_id', userId)
      .in('id', locationIds);

    const places = stats.map(stat => {
      const location = locations?.find(l => l.id === stat.location_id);
      const locationInsights = insights.filter(i => i.locationId === stat.location_id);

      return {
        id: stat.location_id,
        name: location?.name || 'Unknown',
        type: location?.type || null,
        insights: locationInsights.map(i => ({
          text: i.text,
          type: i.type,
          suggestion: i.suggestion,
        })),
      };
    });

    res.json({
      places,
      summary: `You have ${places.length} meaningful places in your story`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get locations');
    res.status(500).json({ error: 'Failed to get locations' });
  }
});

/**
 * GET /api/rpg/social-world
 * Returns "Your Social World" with relationship insights
 */
router.get('/social-world', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const stats = await factionEngine.getFactionStats(userId);
    const insights = await factionInsightGenerator.generateAllInsights(userId, stats);

    const factions = stats.map(stat => {
      const factionInsights = insights.filter(i => i.factionName === stat.faction_name);

      return {
        name: stat.faction_name,
        type: stat.faction_type,
        insights: factionInsights.map(i => ({
          text: i.text,
          type: i.type,
        })),
      };
    });

    res.json({
      factions,
      summary: `You're part of ${factions.length} social groups`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get social world');
    res.status(500).json({ error: 'Failed to get social world' });
  }
});

/**
 * GET /api/rpg/life-story
 * Returns "Your Life Story" with chapters
 */
router.get('/life-story', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const stats = await chapterEngine.getChapterStats(userId);
    const insights = await chapterInsightGenerator.generateAllInsights(userId, stats);

    const chapters = stats.map(stat => {
      const chapterInsights = insights.filter(i => i.chapterId === stat.chapter_id);

      return {
        id: stat.chapter_id,
        title: stat.chapter_title || 'Untitled Chapter',
        period: {
          start: stat.chapter_period_start,
          end: stat.chapter_period_end,
        },
        status: stat.completion_status,
        insights: chapterInsights.map(i => ({
          text: i.text,
          type: i.type,
          suggestion: i.suggestion,
        })),
      };
    });

    res.json({
      chapters,
      summary: `Your life story has ${chapters.length} chapters`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get life story');
    res.status(500).json({ error: 'Failed to get life story' });
  }
});

/**
 * GET /api/rpg/growth
 * Returns "Your Growth Journey" with challenge stories
 */
router.get('/growth', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const stats = await challengeEngine.getChallengeStats(userId);
    const insights = await challengeInsightGenerator.generateAllInsights(userId, stats);

    const challenges = stats.map(stat => {
      const challengeInsights = insights.filter(i => i.challengeName === stat.challenge_name);

      return {
        name: stat.challenge_name,
        type: stat.challenge_type,
        outcome: stat.outcome,
        period: {
          start: stat.challenge_start_date,
          end: stat.challenge_end_date,
        },
        insights: challengeInsights.map(i => ({
          text: i.text,
          type: i.type,
          suggestion: i.suggestion,
        })),
      };
    });

    res.json({
      challenges,
      summary: `You've navigated ${challenges.length} challenges in your journey`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get growth journey');
    res.status(500).json({ error: 'Failed to get growth journey' });
  }
});

/**
 * GET /api/rpg/skills
 * Returns "Your Skills & Growth" with narratives
 */
router.get('/skills', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const trees = await skillTreeEngine.buildSkillTree(userId);
    const insights = await skillInsightGenerator.generateAllInsights(userId, trees);

    const skills = trees.map(tree => {
      const skillInsights = insights.filter(i => i.skillId === tree.skillId);

      return {
        id: tree.skillId,
        name: tree.skillName,
        category: tree.category,
        insights: skillInsights.map(i => ({
          text: i.text,
          type: i.type,
        })),
      };
    });

    res.json({
      skills,
      summary: `You're developing ${skills.length} skills`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get skills');
    res.status(500).json({ error: 'Failed to get skills' });
  }
});

/**
 * GET /api/rpg/wellbeing
 * Returns "Your Wellbeing" with resource insights
 */
router.get('/wellbeing', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const stats = await resourceEngine.getResourceStats(
      userId,
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      new Date()
    );
    const insights = await resourceInsightGenerator.generateAllInsights(userId, stats);

    res.json({
      insights: insights.map(i => ({
        text: i.text,
        type: i.type,
        suggestion: i.suggestion,
      })),
      summary: 'Your wellbeing patterns and insights',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get wellbeing');
    res.status(500).json({ error: 'Failed to get wellbeing' });
  }
});

/**
 * GET /api/rpg/goals
 * Returns "Your Goals & Projects" with quest chains
 */
router.get('/goals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const chains = await questChainEngine.getQuestChains(userId);
    const insights = await questChainInsightGenerator.generateAllInsights(userId, chains);

    const goals = chains.map(chain => {
      const chainInsights = insights.filter(i => i.chainId === chain.chain_id);

      return {
        id: chain.chain_id,
        name: chain.chain_name,
        description: chain.chain_description,
        insights: chainInsights.map(i => ({
          text: i.text,
          type: i.type,
          suggestion: i.suggestion,
        })),
      };
    });

    res.json({
      goals,
      summary: `You have ${goals.length} ongoing goals in your journey`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get goals');
    res.status(500).json({ error: 'Failed to get goals' });
  }
});

export default router;
