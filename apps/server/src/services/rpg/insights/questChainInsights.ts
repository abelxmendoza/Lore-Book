/**
 * Quest Chain Insight Generator
 * Converts quest chain stats to story connections
 * Never shows progress - only narrative flow
 */

import type { QuestChain } from '../questChainEngine';

export interface QuestChainInsight {
  text: string;
  chainId: string;
  chainName: string;
  type: 'connection' | 'progress' | 'continuation' | 'completion' | 'narrative' | 'temporal';
  suggestion?: string;
  storyContext?: {
    timeline?: string;
    evolution?: string;
    significance?: string;
  };
}

export class QuestChainInsightGenerator {
  /**
   * Generate insights for a quest chain with story-driven context
   */
  async generateInsights(userId: string, chain: QuestChain): Promise<QuestChainInsight[]> {
    const insights: QuestChainInsight[] = [];

    // Get chain context
    const chainContext = await this.getChainContext(userId, chain);
    const chainNarrative = this.buildChainNarrative(chain, chainContext);

    // Connection insights with narrative
    if (chain.quest_ids.length > 1) {
      const connectionNarrative = this.buildConnectionNarrative(chain, chainContext);
      insights.push({
        text: connectionNarrative.text,
        chainId: chain.chain_id,
        chainName: chain.chain_name,
        type: 'connection',
        storyContext: {
          significance: connectionNarrative.significance,
        },
      });
    }

    // Progress insights with story
    if (chain.storyline_progress >= 50 && chain.storyline_progress < 100) {
      const progressNarrative = this.buildProgressNarrative(chain, chainContext);
      insights.push({
        text: progressNarrative.text,
        chainId: chain.chain_id,
        chainName: chain.chain_name,
        type: 'progress',
        storyContext: {
          evolution: progressNarrative.evolution,
        },
      });
    } else if (chain.storyline_progress < 50) {
      const beginningText = `You're just beginning your ${chain.chain_name.toLowerCase()}${chainContext.timeline ? ` ${chainContext.timeline}` : ''}. ${chainNarrative.beginning || 'This is the start of an important journey'}.`;
      insights.push({
        text: beginningText,
        chainId: chain.chain_id,
        chainName: chain.chain_name,
        type: 'progress',
      });
    }

    // Continuation insights with context
    if (chain.storyline_progress < 100) {
      const continuationNarrative = this.buildContinuationNarrative(chain, chainContext);
      insights.push({
        text: continuationNarrative.text,
        chainId: chain.chain_id,
        chainName: chain.chain_name,
        type: 'continuation',
        storyContext: {
          evolution: continuationNarrative.hint,
        },
      });
    }

    // Completion insights with epic narrative
    if (chain.epic_completion) {
      const completionNarrative = this.buildCompletionNarrative(chain, chainContext);
      insights.push({
        text: completionNarrative.text,
        chainId: chain.chain_id,
        chainName: chain.chain_name,
        type: 'completion',
        storyContext: {
          significance: completionNarrative.significance,
        },
      });
    }

    // Narrative arc insights
    if (chainNarrative.hasArc) {
      insights.push({
        text: chainNarrative.arcText,
        chainId: chain.chain_id,
        chainName: chain.chain_name,
        type: 'narrative',
        storyContext: {
          evolution: chainNarrative.arcSummary,
        },
      });
    }

    return insights;
  }

  /**
   * Get chain context
   */
  private async getChainContext(userId: string, chain: QuestChain): Promise<{
    timeline: string;
    duration: string;
    questCount: string;
  }> {
    try {
      const { data: quests } = await supabaseAdmin
        .from('quests')
        .select('created_at, completed_at')
        .eq('user_id', userId)
        .in('id', chain.quest_ids)
        .order('created_at', { ascending: true });

      if (!quests || quests.length === 0) {
        return {
          timeline: '',
          duration: '',
          questCount: '',
        };
      }

      const firstQuest = quests[0];
      const lastQuest = quests[quests.length - 1];
      const startDate = new Date(firstQuest.created_at);
      const endDate = lastQuest.completed_at ? new Date(lastQuest.completed_at) : new Date();
      const days = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      let duration = '';
      if (days > 365) {
        const years = Math.floor(days / 365);
        duration = `${years} year${years > 1 ? 's' : ''}`;
      } else if (days > 90) {
        const months = Math.floor(days / 30);
        duration = `${months} month${months > 1 ? 's' : ''}`;
      }

      const questCount = chain.quest_ids.length >= 5
        ? 'a long journey'
        : chain.quest_ids.length >= 3
        ? 'a connected path'
        : '';

      return {
        timeline: duration ? `over ${duration}` : '',
        duration,
        questCount,
      };
    } catch (error) {
      return { timeline: '', duration: '', questCount: '' };
    }
  }

  /**
   * Build chain narrative
   */
  private buildChainNarrative(
    chain: QuestChain,
    context: { questCount: string }
  ): {
    hasArc: boolean;
    arcText: string;
    arcSummary: string;
    beginning: string;
  } {
    const hasArc = chain.quest_ids.length >= 3 || chain.epic_completion;

    const arcText = chain.epic_completion
      ? `This has been an epic journey spanning ${chain.quest_ids.length} connected goals. Your dedication and persistence have paid off.`
      : chain.quest_ids.length >= 5
      ? `This is ${context.questCount || 'a long journey'} with ${chain.quest_ids.length} connected goals. Your story is unfolding.`
      : '';

    const arcSummary = chain.epic_completion
      ? 'You\'ve completed a major life journey'
      : 'Your goals are connected in meaningful ways';

    const beginning = chain.quest_ids.length >= 3
      ? 'This is the start of an important journey with multiple connected goals'
      : 'This is the beginning of a meaningful path';

    return { hasArc, arcText, arcSummary, beginning };
  }

  /**
   * Build connection narrative
   */
  private buildConnectionNarrative(
    chain: QuestChain,
    context: { questCount: string }
  ): {
    text: string;
    significance: string;
  } {
    let text = `This goal connects to your larger journey`;
    
    if (context.questCount) {
      text += `, ${context.questCount} with ${chain.quest_ids.length} connected goals`;
    }

    const significance = chain.quest_ids.length >= 5
      ? 'These goals form an important part of your life story'
      : 'These connected goals show how your journey unfolds';

    return { text, significance };
  }

  /**
   * Build progress narrative
   */
  private buildProgressNarrative(
    chain: QuestChain,
    context: { timeline: string }
  ): {
    text: string;
    evolution: string;
  } {
    let text = `You're making steady progress on your ${chain.chain_name.toLowerCase()}`;
    
    if (context.timeline) {
      text += ` ${context.timeline}`;
    }

    const evolution = chain.storyline_progress >= 75
      ? 'You\'re in the final stages of this journey'
      : chain.storyline_progress >= 50
      ? 'You\'re making meaningful progress'
      : 'Your journey is unfolding';

    return { text, evolution };
  }

  /**
   * Build continuation narrative
   */
  private buildContinuationNarrative(
    chain: QuestChain,
    context: { timeline: string }
  ): {
    text: string;
    hint: string;
  } {
    let text = `What's next in your journey?`;
    
    const hint = chain.storyline_progress >= 75
      ? 'You\'re close to completing this important goal'
      : chain.storyline_progress >= 50
      ? 'You\'re making good progress toward your goal'
      : 'Your journey continues to unfold';

    return { text, hint };
  }

  /**
   * Build completion narrative
   */
  private buildCompletionNarrative(
    chain: QuestChain,
    context: { duration: string }
  ): {
    text: string;
    significance: string;
  } {
    let text = `You've completed an epic journey: ${chain.chain_name}`;
    
    if (context.duration) {
      text += `, ${context.duration} of dedicated effort`;
    }

    const significance = chain.quest_ids.length >= 5
      ? 'This represents a major accomplishment in your life story. Your persistence and dedication have paid off.'
      : 'This is a significant milestone in your journey';

    return { text, significance };
  }

  /**
   * Generate insights for all quest chains
   */
  async generateAllInsights(userId: string, chains: QuestChain[]): Promise<QuestChainInsight[]> {
    const allInsights: QuestChainInsight[] = [];

    for (const chain of chains) {
      const insights = await this.generateInsights(userId, chain);
      allInsights.push(...insights);
    }

    return allInsights;
  }
}

export const questChainInsightGenerator = new QuestChainInsightGenerator();
