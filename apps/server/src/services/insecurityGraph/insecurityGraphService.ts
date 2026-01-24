/**
 * Insecurity Graph Service
 * 
 * Tracks recurring insecurity patterns without moralizing.
 * Pattern matching, not analysis.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ThoughtClassification } from '../thoughtClassification/thoughtClassificationService';

export interface InsecurityPattern {
  id: string;
  user_id: string;
  theme: string;
  domain: string;
  frequency: number;
  first_seen_at: string;
  last_seen_at: string;
  intensity_trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  average_intensity: number;
  related_themes: string[];
  context_patterns: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InsecurityMatch {
  pattern: InsecurityPattern;
  match_confidence: number;
  extracted_comparison?: string; // "behind who"
  extracted_domain?: string;
}

class InsecurityGraphService {
  /**
   * Find matching insecurity patterns for a thought
   */
  async findMatchingPatterns(
    userId: string,
    thought: ThoughtClassification
  ): Promise<InsecurityMatch[]> {
    try {
      // Get all user's insecurity patterns
      const { data: patterns, error } = await supabaseAdmin
        .from('insecurity_patterns')
        .select('*')
        .eq('user_id', userId)
        .order('frequency', { ascending: false });

      if (error || !patterns || patterns.length === 0) {
        return [];
      }

      const matches: InsecurityMatch[] = [];
      const thoughtText = thought.thought_text.toLowerCase();

      for (const pattern of patterns) {
        const matchConfidence = this.calculateMatch(thoughtText, pattern);
        
        if (matchConfidence > 0.3) {
          const extracted = this.extractContext(thought.thought_text, pattern);
          
          matches.push({
            pattern: pattern as InsecurityPattern,
            match_confidence: matchConfidence,
            extracted_comparison: extracted.comparison,
            extracted_domain: extracted.domain,
          });
        }
      }

      // Sort by match confidence
      matches.sort((a, b) => b.match_confidence - a.match_confidence);

      return matches;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to find matching patterns');
      return [];
    }
  }

  /**
   * Calculate match confidence between thought and pattern
   */
  private calculateMatch(
    thoughtText: string,
    pattern: InsecurityPattern
  ): number {
    const theme = pattern.theme.toLowerCase();
    const thoughtLower = thoughtText.toLowerCase();

    // Exact theme match
    if (thoughtLower.includes(theme)) {
      return 0.9;
    }

    // Domain keywords
    const domainKeywords: Record<string, string[]> = {
      career: ['work', 'job', 'career', 'boss', 'colleague', 'promotion', 'salary'],
      money: ['money', 'salary', 'income', 'debt', 'savings', 'rich', 'poor'],
      age: ['age', 'old', 'young', 'timeline', 'milestone', 'years'],
      relationships: ['relationship', 'partner', 'dating', 'single', 'married', 'friend'],
      status: ['status', 'success', 'achievement', 'accomplishment', 'recognition'],
      health: ['health', 'fitness', 'weight', 'exercise', 'diet'],
    };

    const keywords = domainKeywords[pattern.domain] || [];
    const keywordMatches = keywords.filter(kw => thoughtLower.includes(kw)).length;
    const keywordScore = keywordMatches / keywords.length;

    // Theme similarity (simple word overlap)
    const themeWords = theme.split(/\s+/);
    const thoughtWords = thoughtLower.split(/\s+/);
    const overlap = themeWords.filter(tw => thoughtWords.includes(tw)).length;
    const similarityScore = overlap / Math.max(themeWords.length, 1);

    return Math.max(keywordScore * 0.6, similarityScore * 0.4);
  }

  /**
   * Extract context from thought (comparison target, domain)
   */
  private extractContext(
    thoughtText: string,
    pattern: InsecurityPattern
  ): { comparison?: string; domain?: string } {
    const text = thoughtText.toLowerCase();
    
    // Extract comparison target
    const comparisonPatterns = [
      /behind (who|whom|everyone|others|people|my peers|my friends)/gi,
      /compared to ([a-z\s]+)/gi,
      /(everyone|others|people) (is|are) (better|ahead|smarter)/gi,
    ];

    let comparison: string | undefined;
    for (const pattern of comparisonPatterns) {
      const match = text.match(pattern);
      if (match) {
        comparison = match[0];
        break;
      }
    }

    return {
      comparison,
      domain: pattern.domain,
    };
  }

  /**
   * Record or update insecurity pattern
   */
  async recordInsecurity(
    userId: string,
    thought: ThoughtClassification,
    matches: InsecurityMatch[]
  ): Promise<InsecurityPattern> {
    try {
      // Extract theme and domain from thought
      const { theme, domain } = this.extractThemeAndDomain(thought.thought_text);

      // Check if pattern exists
      const { data: existing } = await supabaseAdmin
        .from('insecurity_patterns')
        .select('*')
        .eq('user_id', userId)
        .eq('theme', theme)
        .single();

      let pattern: InsecurityPattern;

      if (existing) {
        // Update existing pattern
        const newFrequency = existing.frequency + 1;
        
        // Calculate intensity trend
        const intensityTrend = this.calculateIntensityTrend(
          existing.average_intensity,
          existing.intensity_trend,
          newFrequency
        );

        const { data, error } = await supabaseAdmin
          .from('insecurity_patterns')
          .update({
            frequency: newFrequency,
            last_seen_at: new Date().toISOString(),
            intensity_trend: intensityTrend,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        pattern = data as InsecurityPattern;
      } else {
        // Create new pattern
        const { data, error } = await supabaseAdmin
          .from('insecurity_patterns')
          .insert({
            user_id: userId,
            theme,
            domain,
            frequency: 1,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            intensity_trend: 'stable',
            average_intensity: 0.5,
            related_themes: matches.map(m => m.pattern.theme),
          })
          .select()
          .single();

        if (error) throw error;
        pattern = data as InsecurityPattern;
      }

      // Create instance record
      await supabaseAdmin
        .from('insecurity_instances')
        .insert({
          user_id: userId,
          pattern_id: pattern.id,
          thought_id: thought.id,
          intensity: 0.5, // Would calculate from thought
          domain: pattern.domain,
          metadata: {},
        });

      return pattern;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to record insecurity');
      throw error;
    }
  }

  /**
   * Extract theme and domain from thought text
   */
  private extractThemeAndDomain(thoughtText: string): { theme: string; domain: string } {
    const text = thoughtText.toLowerCase();

    // Domain detection
    const domains: Record<string, string[]> = {
      career: ['work', 'job', 'career', 'boss', 'colleague', 'promotion'],
      money: ['money', 'salary', 'income', 'debt', 'savings'],
      age: ['age', 'old', 'young', 'timeline', 'milestone'],
      relationships: ['relationship', 'partner', 'dating', 'friend'],
      status: ['status', 'success', 'achievement'],
      health: ['health', 'fitness', 'weight'],
    };

    let detectedDomain = 'general';
    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(kw => text.includes(kw))) {
        detectedDomain = domain;
        break;
      }
    }

    // Theme extraction (simplified - would use NLP in production)
    let theme = 'general comparison';
    if (text.includes('behind')) {
      theme = `${detectedDomain} comparison`;
    } else if (text.includes('not enough')) {
      theme = `${detectedDomain} adequacy`;
    } else if (text.includes('worse than')) {
      theme = `${detectedDomain} comparison`;
    }

    return { theme, domain: detectedDomain };
  }

  /**
   * Calculate intensity trend
   */
  private calculateIntensityTrend(
    currentAverage: number,
    currentTrend: string,
    frequency: number
  ): 'increasing' | 'decreasing' | 'stable' | 'volatile' {
    // Simplified - would track actual intensity over time
    if (frequency < 3) return 'stable';
    if (frequency > 10) return 'increasing';
    return currentTrend as any;
  }

  /**
   * Get insecurity patterns for user
   */
  async getUserPatterns(
    userId: string,
    domain?: string
  ): Promise<InsecurityPattern[]> {
    try {
      let query = supabaseAdmin
        .from('insecurity_patterns')
        .select('*')
        .eq('user_id', userId)
        .order('frequency', { ascending: false });

      if (domain) {
        query = query.eq('domain', domain);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []) as InsecurityPattern[];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get user patterns');
      return [];
    }
  }
}

export const insecurityGraphService = new InsecurityGraphService();
