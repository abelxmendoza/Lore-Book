/**
 * Signal-to-Noise Analysis Service
 * 
 * Separates significant entries from routine/insignificant ones:
 * - Scores entries by significance
 * - Extracts themes
 * - Filters noise (routine entries)
 * - Identifies signal (meaningful entries)
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';
import type { MemoryEntry } from '../../types';

export interface SignalAnalysis {
  signal_entries: string[]; // Significant entry IDs
  noise_entries: string[]; // Routine/insignificant entry IDs
  signal_ratio: number; // Signal / Total entries
  themes: Array<{
    theme: string;
    entry_ids: string[];
    frequency: number;
  }>;
  significance_scores: Record<string, number>; // Entry ID -> significance score
}

export interface ThemeExtraction {
  themes: Array<{
    theme: string;
    description: string;
    entry_ids: string[];
    frequency: number;
    time_span: {
      start: string;
      end: string;
    };
  }>;
  dominant_themes: string[]; // Top 5 themes
}

class SignalNoiseAnalysisService {
  /**
   * Analyze signal-to-noise ratio for user's entries
   */
  async analyzeSignalNoise(
    userId: string,
    days: number = 90
  ): Promise<SignalAnalysis> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Get entries
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, created_at, mood, tags')
        .eq('user_id', userId)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        throw error;
      }

      if (!entries || entries.length === 0) {
        return {
          signal_entries: [],
          noise_entries: [],
          signal_ratio: 0,
          themes: [],
          significance_scores: {},
        };
      }

      // Score entries by significance
      const significanceScores: Record<string, number> = {};
      const signalEntries: string[] = [];
      const noiseEntries: string[] = [];

      for (const entry of entries) {
        const score = await this.calculateSignificance(entry);
        significanceScores[entry.id] = score;

        if (score >= 0.5) {
          signalEntries.push(entry.id);
        } else {
          noiseEntries.push(entry.id);
        }
      }

      // Extract themes
      const themes = await this.extractThemes(entries);

      const signalRatio = signalEntries.length / entries.length;

      return {
        signal_entries: signalEntries,
        noise_entries: noiseEntries,
        signal_ratio: signalRatio,
        themes,
        significance_scores: significanceScores,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to analyze signal-to-noise');
      throw error;
    }
  }

  /**
   * Calculate significance score for an entry
   */
  private async calculateSignificance(entry: MemoryEntry): Promise<number> {
    let score = 0.5; // Base score

    // Length factor (longer entries often more significant)
    if (entry.content.length > 500) score += 0.1;
    if (entry.content.length < 50) score -= 0.2;

    // Emotional intensity (strong emotions = more significant)
    const strongEmotions = ['angry', 'sad', 'excited', 'grateful', 'anxious', 'joyful'];
    if (entry.mood && strongEmotions.includes(entry.mood.toLowerCase())) {
      score += 0.15;
    }

    // Tags (entries with tags often more significant)
    if (entry.tags && entry.tags.length > 0) {
      score += 0.1;
    }

    // Keyword indicators of significance
    const significantKeywords = [
      'important', 'significant', 'major', 'breakthrough', 'milestone',
      'decided', 'realized', 'understood', 'changed', 'transition',
    ];
    const hasSignificantKeywords = significantKeywords.some(kw =>
      entry.content.toLowerCase().includes(kw)
    );
    if (hasSignificantKeywords) {
      score += 0.1;
    }

    // Routine indicators (negative score)
    const routineKeywords = [
      'had coffee', 'went to work', 'watched tv', 'ate lunch',
      'went to bed', 'woke up', 'brushed teeth',
    ];
    const hasRoutineKeywords = routineKeywords.some(kw =>
      entry.content.toLowerCase().includes(kw)
    );
    if (hasRoutineKeywords && entry.content.length < 100) {
      score -= 0.3;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Extract themes from entries
   */
  private async extractThemes(
    entries: Array<{ id: string; content: string; created_at: string }>
  ): Promise<SignalAnalysis['themes']> {
    try {
      // Use LLM to extract themes
      const contents = entries.map(e => e.content).join('\n\n');
      const prompt = `Extract the main themes from these journal entries:

${contents.slice(0, 4000)} // Limit to avoid token limits

Respond with JSON:
{
  "themes": [
    {
      "theme": "theme name",
      "entry_ids": ["id1", "id2"],
      "frequency": number
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.themes || [];
    } catch (error) {
      logger.warn({ err: error }, 'LLM theme extraction failed, using keyword extraction');
      return this.basicThemeExtraction(entries);
    }
  }

  /**
   * Basic theme extraction using keywords
   */
  private basicThemeExtraction(
    entries: Array<{ id: string; content: string }>
  ): SignalAnalysis['themes'] {
    const themeKeywords: Record<string, string[]> = {
      'work': ['work', 'job', 'career', 'office', 'boss', 'colleague'],
      'relationships': ['friend', 'partner', 'family', 'relationship', 'love', 'dating'],
      'health': ['health', 'doctor', 'exercise', 'diet', 'illness', 'pain'],
      'creative': ['creative', 'art', 'music', 'writing', 'project', 'design'],
      'travel': ['travel', 'trip', 'vacation', 'flight', 'hotel', 'destination'],
      'learning': ['learn', 'study', 'course', 'book', 'education', 'skill'],
    };

    const themes: SignalAnalysis['themes'] = [];

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      const matchingEntries = entries.filter(entry =>
        keywords.some(kw => entry.content.toLowerCase().includes(kw))
      );

      if (matchingEntries.length > 0) {
        themes.push({
          theme,
          entry_ids: matchingEntries.map(e => e.id),
          frequency: matchingEntries.length,
        });
      }
    }

    return themes.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Extract themes with time spans
   */
  async extractThemesWithTimeSpan(
    userId: string,
    days: number = 90
  ): Promise<ThemeExtraction> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, created_at')
        .eq('user_id', userId)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: true })
        .limit(500);

      if (error || !entries || entries.length === 0) {
        return { themes: [], dominant_themes: [] };
      }

      const themes = await this.extractThemes(entries);

      // Add time spans to themes
      const themesWithTimeSpan = themes.map(theme => {
        const themeEntries = entries.filter(e => theme.entry_ids.includes(e.id));
        const dates = themeEntries.map(e => new Date(e.created_at));
        const start = new Date(Math.min(...dates.map(d => d.getTime())));
        const end = new Date(Math.max(...dates.map(d => d.getTime())));

        return {
          theme: theme.theme,
          description: `Appears in ${theme.frequency} entries`,
          entry_ids: theme.entry_ids,
          frequency: theme.frequency,
          time_span: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
        };
      });

      const dominantThemes = themesWithTimeSpan
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5)
        .map(t => t.theme);

      return {
        themes: themesWithTimeSpan,
        dominant_themes: dominantThemes,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract themes with time span');
      return { themes: [], dominant_themes: [] };
    }
  }
}

export const signalNoiseAnalysisService = new SignalNoiseAnalysisService();
