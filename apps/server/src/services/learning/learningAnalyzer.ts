import { logger } from '../../logger';
import type { LearningRecord, LearningGap } from './types';

/**
 * Analyzes learning to identify patterns and gaps
 */
export class LearningAnalyzer {
  /**
   * Identify learning gaps
   */
  async identifyGaps(learning: LearningRecord[]): Promise<LearningGap[]> {
    const gaps: LearningGap[] = [];

    try {
      // Group by theme
      const themeGroups = this.groupByTheme(learning);

      // Common learning area combinations
      const relatedAreas: Record<string, string[]> = {
        programming: ['design', 'data', 'technical'],
        design: ['programming', 'creative', 'communication'],
        business: ['communication', 'data', 'technical'],
        data: ['programming', 'business', 'technical'],
        communication: ['business', 'creative', 'language'],
      };

      for (const [theme, records] of themeGroups.entries()) {
        const related = relatedAreas[theme] || [];
        
        for (const relatedTheme of related) {
          const relatedRecords = themeGroups.get(relatedTheme) || [];
          
          // If user has skills in related area but not in this area, it's a gap
          if (relatedRecords.length > 0 && records.length === 0) {
            const confidence = this.calculateGapConfidence(relatedRecords, theme);
            
            if (confidence > 0.5) {
              gaps.push({
                area: theme,
                missing_skills: this.suggestMissingSkills(theme),
                related_skills: relatedRecords.map(r => r.name),
                confidence,
              });
            }
          }
        }
      }

      logger.debug({ gaps: gaps.length }, 'Identified learning gaps');
    } catch (error) {
      logger.error({ error }, 'Failed to identify learning gaps');
    }

    return gaps;
  }

  /**
   * Group learning by theme
   */
  private groupByTheme(learning: LearningRecord[]): Map<string, LearningRecord[]> {
    const groups = new Map<string, LearningRecord[]>();

    for (const l of learning) {
      const themes = this.extractThemes(l);
      for (const theme of themes) {
        if (!groups.has(theme)) {
          groups.set(theme, []);
        }
        groups.get(theme)!.push(l);
      }
    }

    return groups;
  }

  /**
   * Extract themes from learning record
   */
  private extractThemes(record: LearningRecord): string[] {
    const themes: string[] = [];
    const lowerName = record.name.toLowerCase();
    const lowerDesc = record.description.toLowerCase();

    const themeKeywords: Record<string, string[]> = {
      programming: ['programming', 'code', 'coding', 'developer', 'software', 'algorithm'],
      design: ['design', 'ui', 'ux', 'interface', 'visual'],
      communication: ['communication', 'writing', 'speaking', 'presentation'],
      business: ['business', 'marketing', 'sales', 'strategy'],
      language: ['language', 'spanish', 'french', 'german'],
      data: ['data', 'analytics', 'analysis', 'statistics'],
      creative: ['creative', 'art', 'music', 'writing'],
      technical: ['technical', 'engineering', 'system'],
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(kw => lowerName.includes(kw) || lowerDesc.includes(kw))) {
        themes.push(theme);
      }
    }

    if (themes.length === 0) {
      themes.push(record.type);
    }

    return themes;
  }

  /**
   * Calculate gap confidence
   */
  private calculateGapConfidence(relatedRecords: LearningRecord[], missingArea: string): number {
    // Higher confidence if user has many related skills
    const skillCount = relatedRecords.length;
    const baseConfidence = Math.min(0.9, 0.5 + (skillCount * 0.1));
    
    // Boost if related skills are advanced
    const advancedCount = relatedRecords.filter(r => r.proficiency === 'advanced' || r.proficiency === 'expert').length;
    const proficiencyBoost = advancedCount * 0.1;
    
    return Math.min(0.9, baseConfidence + proficiencyBoost);
  }

  /**
   * Suggest missing skills for an area
   */
  private suggestMissingSkills(area: string): string[] {
    const suggestions: Record<string, string[]> = {
      programming: ['Version Control', 'Testing', 'Debugging', 'Code Review'],
      design: ['User Research', 'Prototyping', 'Design Systems', 'Accessibility'],
      communication: ['Public Speaking', 'Technical Writing', 'Negotiation', 'Active Listening'],
      business: ['Financial Analysis', 'Project Management', 'Customer Relations', 'Strategic Planning'],
      data: ['Data Visualization', 'Statistical Analysis', 'Database Design', 'Machine Learning'],
      creative: ['Storytelling', 'Visual Design', 'Content Creation', 'Branding'],
      technical: ['System Architecture', 'DevOps', 'Security', 'Performance Optimization'],
    };

    return suggestions[area] || [];
  }
}

