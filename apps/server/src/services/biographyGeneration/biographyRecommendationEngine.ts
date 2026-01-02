/**
 * BiographyRecommendationEngine
 * 
 * Automatically detects user interests and preferences to recommend
 * top 4 lorebooks/biographies they should generate.
 * 
 * Always includes Full Life Story (with versions) as the main one.
 */

import { logger } from '../../logger';
import { memoryService } from '../memoryService';
import { buildAtomsFromTimeline } from './narrativeAtomBuilder';
import type { BiographySpec, Domain } from './types';

export interface BiographyRecommendation {
  id: string;
  title: string;
  description: string;
  spec: BiographySpec;
  reason: string; // Why this was recommended
  priority: number; // 1-4, where 1 is highest
  estimatedChapters: number;
}

export interface BiographyVersion {
  id: string;
  name: 'main' | 'safe' | 'explicit' | 'private';
  displayName: string;
  description: string;
  audience: BiographySpec['audience'];
  includeIntrospection: boolean;
  filterSensitive: boolean;
}

export const BIOGRAPHY_VERSIONS: BiographyVersion[] = [
  {
    id: 'main',
    name: 'main',
    displayName: 'Main Version',
    description: 'The default full life story',
    audience: 'self',
    includeIntrospection: true,
    filterSensitive: false
  },
  {
    id: 'safe',
    name: 'safe',
    displayName: 'Safe/Public Version',
    description: 'Clean version you can publish while living',
    audience: 'public',
    includeIntrospection: false,
    filterSensitive: true
  },
  {
    id: 'explicit',
    name: 'explicit',
    displayName: 'Explicit/Death Version',
    description: 'Honest version to publish after death',
    audience: 'self',
    includeIntrospection: true,
    filterSensitive: false
  },
  {
    id: 'private',
    name: 'private',
    displayName: 'Private Version',
    description: 'Complete version, never published',
    audience: 'self',
    includeIntrospection: true,
    filterSensitive: false
  }
];

export class BiographyRecommendationEngine {
  /**
   * Get top 4 recommended biographies for a user
   */
  async getRecommendations(userId: string): Promise<BiographyRecommendation[]> {
    try {
      // 1. Always include Full Life Story as #1
      const fullLifeStory: BiographyRecommendation = {
        id: 'full-life-story',
        title: 'My Full Life Story',
        description: 'Your complete biography from beginning to present',
        spec: {
          scope: 'full_life',
          tone: 'neutral',
          depth: 'detailed',
          audience: 'self',
          version: 'main' // Default version (build flag)
        },
        reason: 'Comprehensive narrative of your life',
        priority: 1,
        estimatedChapters: 0 // Will be calculated
      };

      // 2. Detect top 3 domain interests
      const domainInterests = await this.detectDomainInterests(userId);
      
      const recommendations: BiographyRecommendation[] = [fullLifeStory];

      // 3. Add top 3 domain-specific biographies
      domainInterests.slice(0, 3).forEach((interest, idx) => {
        recommendations.push({
          id: `domain-${interest.domain}`,
          title: this.getDomainTitle(interest.domain),
          description: this.getDomainDescription(interest.domain),
          spec: {
            scope: 'domain',
            domain: interest.domain,
            tone: 'neutral',
            depth: 'detailed',
            audience: 'self',
            version: 'main' // Default version
          },
          reason: `High activity and significance in ${interest.domain}`,
          priority: idx + 2, // 2, 3, 4
          estimatedChapters: interest.estimatedChapters
        });
      });

      // 4. Calculate estimated chapters for full life story
      const atoms = await buildAtomsFromTimeline(userId);
      fullLifeStory.estimatedChapters = Math.ceil(atoms.length / 15); // Rough estimate

      return recommendations;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate biography recommendations');
      // Return default recommendations on error
      return this.getDefaultRecommendations();
    }
  }

  /**
   * Detect user's top domain interests from their data
   */
  private async detectDomainInterests(userId: string): Promise<Array<{
    domain: Domain;
    score: number;
    reason: string;
    estimatedChapters: number;
  }>> {
    try {
      // Get timeline entries
      const entries = await memoryService.searchEntries(userId, { limit: 1000 });
      
      // Count domain mentions
      const domainScores: Record<Domain, { count: number; entries: any[] }> = {
        fighting: { count: 0, entries: [] },
        robotics: { count: 0, entries: [] },
        relationships: { count: 0, entries: [] },
        creative: { count: 0, entries: [] },
        professional: { count: 0, entries: [] },
        personal: { count: 0, entries: [] },
        health: { count: 0, entries: [] },
        education: { count: 0, entries: [] },
        family: { count: 0, entries: [] },
        friendship: { count: 0, entries: [] },
        romance: { count: 0, entries: [] }
      };

      // Analyze each entry
      for (const entry of entries) {
        const content = (entry.content || entry.summary || '').toLowerCase();
        const tags = (entry.tags || []).map((t: string) => t.toLowerCase());

        // Fighting domain
        if (content.includes('fight') || content.includes('bjj') || content.includes('martial') || 
            content.includes('training') || content.includes('gym') || tags.includes('fighting')) {
          domainScores.fighting.count++;
          domainScores.fighting.entries.push(entry);
        }

        // Robotics domain
        if (content.includes('robot') || content.includes('code') || content.includes('programming') || 
            content.includes('software') || content.includes('tech') || tags.includes('robotics') || tags.includes('coding')) {
          domainScores.robotics.count++;
          domainScores.robotics.entries.push(entry);
        }

        // Relationships domain
        if (content.includes('relationship') || content.includes('friend') || content.includes('partner') || 
            content.includes('love') || tags.includes('relationship')) {
          domainScores.relationships.count++;
          domainScores.relationships.entries.push(entry);
        }

        // Creative domain
        if (content.includes('art') || content.includes('creative') || content.includes('design') || 
            content.includes('music') || content.includes('write') || tags.includes('creative')) {
          domainScores.creative.count++;
          domainScores.creative.entries.push(entry);
        }

        // Professional domain
        if (content.includes('work') || content.includes('job') || content.includes('career') || 
            content.includes('business') || tags.includes('professional')) {
          domainScores.professional.count++;
          domainScores.professional.entries.push(entry);
        }

        // Health domain
        if (content.includes('health') || content.includes('fitness') || content.includes('wellness') || 
            content.includes('medical') || tags.includes('health')) {
          domainScores.health.count++;
          domainScores.health.entries.push(entry);
        }

        // Education domain
        if (content.includes('learn') || content.includes('study') || content.includes('school') || 
            content.includes('education') || tags.includes('education')) {
          domainScores.education.count++;
          domainScores.education.entries.push(entry);
        }

        // Family domain
        if (content.includes('family') || content.includes('parent') || content.includes('sibling') || 
            tags.includes('family')) {
          domainScores.family.count++;
          domainScores.family.entries.push(entry);
        }

        // Romance domain
        if (content.includes('romance') || content.includes('dating') || content.includes('partner') || 
            tags.includes('romance')) {
          domainScores.romance.count++;
          domainScores.romance.entries.push(entry);
        }
      }

      // Convert to array and sort by score
      const interests = Object.entries(domainScores)
        .filter(([_, data]) => data.count > 0) // Only domains with entries
        .map(([domain, data]) => ({
          domain: domain as Domain,
          score: data.count,
          reason: this.generateReason(domain as Domain, data.count, data.entries.length),
          estimatedChapters: Math.ceil(data.entries.length / 10) // Rough estimate
        }))
        .sort((a, b) => b.score - a.score); // Sort by score descending

      return interests;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect domain interests');
      return [];
    }
  }

  /**
   * Generate reason for recommendation
   */
  private generateReason(domain: Domain, score: number, entryCount: number): string {
    const domainNames: Record<Domain, string> = {
      fighting: 'fighting',
      robotics: 'robotics',
      relationships: 'relationships',
      creative: 'creative work',
      professional: 'professional career',
      personal: 'personal life',
      health: 'health & wellness',
      education: 'education & learning',
      family: 'family',
      friendship: 'friendships',
      romance: 'romance'
    };

    if (score > 50) {
      return `Strong focus on ${domainNames[domain]} (${entryCount} entries)`;
    } else if (score > 20) {
      return `Significant activity in ${domainNames[domain]} (${entryCount} entries)`;
    } else {
      return `Emerging interest in ${domainNames[domain]} (${entryCount} entries)`;
    }
  }

  /**
   * Get domain title
   */
  private getDomainTitle(domain: Domain): string {
    const titles: Record<Domain, string> = {
      fighting: 'My Fighting Journey',
      robotics: 'My Robotics & Coding Journey',
      relationships: 'My Relationships Story',
      creative: 'My Creative Journey',
      professional: 'My Professional Career',
      personal: 'My Personal Story',
      health: 'My Health & Wellness Journey',
      education: 'My Learning Journey',
      family: 'My Family Story',
      friendship: 'My Friendships',
      romance: 'My Love Story'
    };
    return titles[domain] || `My ${domain} Story`;
  }

  /**
   * Get domain description
   */
  private getDomainDescription(domain: Domain): string {
    const descriptions: Record<Domain, string> = {
      fighting: 'Your journey through martial arts, training, and combat',
      robotics: 'Your path in robotics, coding, and technology',
      relationships: 'Your connections, friendships, and bonds',
      creative: 'Your creative projects, art, and expression',
      professional: 'Your career, work, and professional growth',
      personal: 'Your personal experiences and growth',
      health: 'Your health, fitness, and wellness journey',
      education: 'Your learning, education, and knowledge journey',
      family: 'Your family relationships and history',
      friendship: 'Your friendships and social connections',
      romance: 'Your romantic relationships and love story'
    };
    return descriptions[domain] || `Your story in ${domain}`;
  }

  /**
   * Get default recommendations if detection fails
   */
  private getDefaultRecommendations(): BiographyRecommendation[] {
    return [
      {
        id: 'full-life-story',
        title: 'My Full Life Story',
        description: 'Your complete biography from beginning to present',
        spec: {
          scope: 'full_life',
          tone: 'neutral',
          depth: 'detailed',
          audience: 'self',
          includeIntrospection: true
        },
        reason: 'Your complete life narrative',
        priority: 1,
        estimatedChapters: 0
      }
    ];
  }
}

export const biographyRecommendationEngine = new BiographyRecommendationEngine();
