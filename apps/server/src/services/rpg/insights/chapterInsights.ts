/**
 * Chapter Insight Generator
 * Converts chapter stats to natural language narratives
 * Never shows numbers - only story flow
 */

import type { ChapterStats } from '../chapterEngine';

export interface ChapterInsight {
  text: string;
  chapterId: string | null;
  chapterTitle: string | null;
  type: 'summary' | 'reflection' | 'continuation' | 'completion' | 'narrative_arc' | 'temporal';
  suggestion?: string;
  storyContext?: {
    timeline?: string;
    evolution?: string;
    themes?: string;
    significance?: string;
  };
}

export class ChapterInsightGenerator {
  /**
   * Generate insights for a chapter with story-driven context
   */
  async generateInsights(userId: string, stats: ChapterStats): Promise<ChapterInsight[]> {
    const insights: ChapterInsight[] = [];

    const chapterTitle = stats.chapter_title || 'This chapter';

    // Get chapter context
    const chapterContext = await this.getChapterContext(userId, stats);
    const chapterThemes = await this.getChapterThemes(userId, stats.chapter_id);
    const chapterNarrative = this.buildChapterNarrative(stats, chapterContext, chapterThemes);

    // Chapter summary with narrative
    if (stats.chapter_title) {
      const summary = this.buildChapterSummary(stats, chapterContext, chapterThemes);
      insights.push({
        text: summary.text,
        chapterId: stats.chapter_id,
        chapterTitle: stats.chapter_title,
        type: 'summary',
        storyContext: {
          timeline: chapterContext.timeline,
          themes: chapterThemes.mainThemes,
          significance: summary.significance,
        },
      });
    }

    // Narrative arc insights
    if (chapterNarrative.hasArc) {
      insights.push({
        text: `${chapterTitle} represents ${chapterNarrative.arcDescription}. ${chapterNarrative.arcSummary}.`,
        chapterId: stats.chapter_id,
        chapterTitle: stats.chapter_title,
        type: 'narrative_arc',
        storyContext: {
          evolution: chapterNarrative.arcSummary,
          themes: chapterThemes.mainThemes,
        },
      });
    }

    // Reflection prompts with context
    if (stats.completion_status === 'completed' && stats.reflection_bonus === 0) {
      const reflectionContext = this.buildReflectionContext(stats, chapterThemes);
      insights.push({
        text: `Want to reflect on ${chapterTitle}? ${reflectionContext.why}`,
        chapterId: stats.chapter_id,
        chapterTitle: stats.chapter_title,
        type: 'reflection',
        suggestion: reflectionContext.suggestion,
      });
    }

    // Story continuation with context
    if (stats.completion_status === 'active') {
      const continuationContext = this.buildContinuationContext(stats, chapterThemes);
      insights.push({
        text: `What's happening next in your story? ${continuationContext.hint}`,
        chapterId: stats.chapter_id,
        chapterTitle: stats.chapter_title,
        type: 'continuation',
      });
    }

    // Completion celebration with narrative
    if (stats.completion_status === 'completed') {
      const completionNarrative = this.buildCompletionNarrative(stats, chapterContext, chapterThemes);
      insights.push({
        text: completionNarrative.text,
        chapterId: stats.chapter_id,
        chapterTitle: stats.chapter_title,
        type: 'completion',
        storyContext: {
          significance: completionNarrative.significance,
        },
      });
    }

    return insights;
  }

  /**
   * Get chapter context
   */
  private async getChapterContext(userId: string, stats: ChapterStats): Promise<{
    timeline: string;
    duration: string;
    period: string;
  }> {
    let timeline = '';
    let duration = '';
    let period = '';

    if (stats.chapter_period_start && stats.chapter_period_end) {
      const start = new Date(stats.chapter_period_start);
      const end = new Date(stats.chapter_period_end);
      const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (days > 365) {
        const years = Math.floor(days / 365);
        duration = `${years} year${years > 1 ? 's' : ''}`;
      } else if (days > 30) {
        const months = Math.floor(days / 30);
        duration = `${months} month${months > 1 ? 's' : ''}`;
      } else {
        duration = `${days} day${days > 1 ? 's' : ''}`;
      }

      timeline = `from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
      period = `This ${duration} period`;
    } else if (stats.chapter_period_start) {
      const start = new Date(stats.chapter_period_start);
      timeline = `starting ${start.toLocaleDateString()}`;
      period = 'This ongoing period';
    }

    return { timeline, duration, period };
  }

  /**
   * Get chapter themes
   */
  private async getChapterThemes(userId: string, chapterId: string | null): Promise<{
    mainThemes: string;
    themes: string[];
  }> {
    if (!chapterId) {
      return { mainThemes: '', themes: [] };
    }

    try {
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('tags')
        .eq('user_id', userId)
        .eq('chapter_id', chapterId)
        .not('tags', 'is', null);

      if (!entries || entries.length === 0) {
        return { mainThemes: '', themes: [] };
      }

      // Count tag frequency
      const tagCounts: Record<string, number> = {};
      for (const entry of entries) {
        const tags = entry.tags || [];
        for (const tag of tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }

      const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => tag);

      const mainThemes = sortedTags.length > 0
        ? `Themes of ${sortedTags.join(', ')}`
        : '';

      return {
        mainThemes,
        themes: sortedTags,
      };
    } catch (error) {
      return { mainThemes: '', themes: [] };
    }
  }

  /**
   * Build chapter narrative
   */
  private buildChapterNarrative(
    stats: ChapterStats,
    context: { period: string; duration: string },
    themes: { mainThemes: string }
  ): {
    hasArc: boolean;
    arcDescription: string;
    arcSummary: string;
  } {
    const hasArc = stats.quests_completed > 0 || stats.skills_gained.length > 0;

    let arcDescription = '';
    if (stats.growth_rating && stats.growth_rating >= 7) {
      arcDescription = 'a period of significant growth';
    } else if (stats.difficulty_rating && stats.difficulty_rating >= 7) {
      arcDescription = 'a challenging chapter';
    } else if (stats.enjoyment_rating && stats.enjoyment_rating >= 7) {
      arcDescription = 'a joyful period';
    } else {
      arcDescription = 'an important chapter';
    }

    const arcSummary = themes.mainThemes
      ? `${context.period} was marked by ${themes.mainThemes.toLowerCase()}`
      : `${context.period} was a significant time in your journey`;

    return {
      hasArc,
      arcDescription,
      arcSummary,
    };
  }

  /**
   * Build chapter summary
   */
  private buildChapterSummary(
    stats: ChapterStats,
    context: { period: string; timeline: string },
    themes: { mainThemes: string }
  ): {
    text: string;
    significance: string;
  } {
    let summary = stats.chapter_title || 'This chapter';
    
    const descriptors: string[] = [];
    if (stats.growth_rating && stats.growth_rating >= 7) {
      descriptors.push('a time of growth and discovery');
    }
    if (stats.difficulty_rating && stats.difficulty_rating >= 7) {
      descriptors.push('a challenging period');
    }
    if (stats.enjoyment_rating && stats.enjoyment_rating >= 7) {
      descriptors.push('a joyful time');
    }

    if (descriptors.length > 0) {
      summary += ` - ${descriptors.join(', ')}`;
    }

    if (context.timeline) {
      summary += ` (${context.timeline})`;
    }

    const significance = themes.mainThemes
      ? `This chapter was marked by ${themes.mainThemes.toLowerCase()}`
      : stats.quests_completed > 0
      ? `You completed ${stats.quests_completed} goal${stats.quests_completed > 1 ? 's' : ''} during this time`
      : '';

    return { text: summary, significance };
  }

  /**
   * Build reflection context
   */
  private buildReflectionContext(
    stats: ChapterStats,
    themes: { mainThemes: string }
  ): {
    why: string;
    suggestion: string;
  } {
    const why = themes.mainThemes
      ? `This chapter explored ${themes.mainThemes.toLowerCase()}`
      : stats.quests_completed > 0
      ? `You accomplished ${stats.quests_completed} goal${stats.quests_completed > 1 ? 's' : ''} during this time`
      : 'This was an important period in your journey';

    const suggestion = 'Reflecting on completed chapters helps you understand your journey and see how you\'ve grown';

    return { why, suggestion };
  }

  /**
   * Build continuation context
   */
  private buildContinuationContext(
    stats: ChapterStats,
    themes: { mainThemes: string }
  ): {
    hint: string;
  } {
    const hint = themes.mainThemes
      ? `You're currently exploring ${themes.mainThemes.toLowerCase()}`
      : stats.quests_completed > 0
      ? `You're working on ${stats.quests_completed} active goal${stats.quests_completed > 1 ? 's' : ''}`
      : 'Your story continues to unfold';

    return { hint };
  }

  /**
   * Build completion narrative
   */
  private buildCompletionNarrative(
    stats: ChapterStats,
    context: { period: string; duration: string },
    themes: { mainThemes: string }
  ): {
    text: string;
    significance: string;
  } {
    let text = `You've completed ${stats.chapter_title || 'this chapter'}`;
    
    if (context.duration) {
      text += `, a ${context.duration} journey`;
    }

    const significance = themes.mainThemes
      ? `This chapter explored ${themes.mainThemes.toLowerCase()} and marked an important period in your story`
      : stats.quests_completed > 0
      ? `During this time, you accomplished ${stats.quests_completed} goal${stats.quests_completed > 1 ? 's' : ''} and grew in meaningful ways`
      : 'This chapter represents an important period in your journey';

    return { text, significance };
  }

  /**
   * Generate insights for all chapters
   */
  async generateAllInsights(userId: string, statsList: ChapterStats[]): Promise<ChapterInsight[]> {
    const allInsights: ChapterInsight[] = [];

    for (const stats of statsList) {
      const insights = await this.generateInsights(userId, stats);
      allInsights.push(...insights);
    }

    return allInsights;
  }
}

export const chapterInsightGenerator = new ChapterInsightGenerator();
