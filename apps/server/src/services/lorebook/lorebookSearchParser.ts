/**
 * Lorebook Search Parser
 * 
 * Intelligently parses natural language queries to extract:
 * - Timeline criteria (dates, periods, years)
 * - Characters (names, relationships)
 * - Events (specific events, event types)
 * - Locations (places, venues)
 * - Skills (domains, abilities)
 * - Themes and topics
 */

import { logger } from '../../logger';
import type { BiographySpec, Domain } from '../biographyGeneration/types';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';

export interface ParsedLorebookQuery {
  scope: 'full_life' | 'domain' | 'time_range' | 'thematic' | 'character' | 'location' | 'event' | 'skill';
  domain?: Domain;
  timeRange?: {
    start: string;
    end: string;
  };
  themes?: string[];
  characterIds?: string[];
  locationIds?: string[];
  eventIds?: string[];
  skillIds?: string[];
  tone?: 'neutral' | 'dramatic' | 'reflective' | 'mythic' | 'professional';
  depth?: 'summary' | 'detailed' | 'epic';
  audience?: 'self' | 'public' | 'professional';
  version?: 'main' | 'safe' | 'explicit' | 'private';
  includeIntrospection?: boolean;
}

export class LorebookSearchParser {
  /**
   * Parse natural language query into structured lorebook spec
   */
  async parseQuery(userId: string, query: string): Promise<ParsedLorebookQuery> {
    const lowerQuery = query.toLowerCase().trim();
    
    // Default spec
    const spec: ParsedLorebookQuery = {
      scope: 'thematic',
      tone: 'neutral',
      depth: 'detailed',
      audience: 'self',
      version: 'main',
      includeIntrospection: true,
    };

    // 1. Check for full life story
    if (this.isFullLifeQuery(lowerQuery)) {
      spec.scope = 'full_life';
      return spec;
    }

    // 2. Extract timeline criteria
    const timeRange = await this.extractTimeRange(lowerQuery);
    if (timeRange) {
      spec.scope = 'time_range';
      spec.timeRange = timeRange;
    }

    // 3. Extract domain
    const domain = this.extractDomain(lowerQuery);
    if (domain) {
      spec.scope = 'domain';
      spec.domain = domain;
    }

    // 4. Extract character references
    const characterIds = await this.extractCharacters(userId, query);
    if (characterIds && characterIds.length > 0) {
      spec.scope = 'character';
      spec.characterIds = characterIds;
    }

    // 5. Extract location references
    const locationIds = await this.extractLocations(userId, query);
    if (locationIds && locationIds.length > 0) {
      spec.scope = 'location';
      spec.locationIds = locationIds;
    }

    // 6. Extract event references
    const eventIds = await this.extractEvents(userId, query);
    if (eventIds && eventIds.length > 0) {
      spec.scope = 'event';
      spec.eventIds = eventIds;
    }

    // 7. Extract skill references
    const skillIds = await this.extractSkills(userId, query);
    if (skillIds && skillIds.length > 0) {
      spec.scope = 'skill';
      spec.skillIds = skillIds;
    }

    // 8. Extract themes
    const themes = this.extractThemes(lowerQuery);
    if (themes && themes.length > 0 && spec.scope === 'thematic') {
      spec.themes = themes;
    }

    // 9. Extract tone hints
    const tone = this.extractTone(lowerQuery);
    if (tone) {
      spec.tone = tone;
    }

    // 10. Extract depth hints
    const depth = this.extractDepth(lowerQuery);
    if (depth) {
      spec.depth = depth;
    }

    // 11. Extract version hints
    const version = this.extractVersion(lowerQuery);
    if (version) {
      spec.version = version;
    }

    return spec;
  }

  /**
   * Check if query is asking for full life story
   */
  private isFullLifeQuery(query: string): boolean {
    const fullLifePatterns = [
      /full\s+life/,
      /entire\s+life/,
      /complete\s+story/,
      /whole\s+life/,
      /my\s+life\s+story/,
      /everything/,
      /all\s+of\s+my\s+life/,
    ];
    return fullLifePatterns.some(pattern => pattern.test(query));
  }

  /**
   * Extract time range from query
   */
  private async extractTimeRange(query: string): Promise<{ start: string; end: string } | null> {
    // Year patterns
    const yearMatch = query.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      return {
        start: `${year}-01-01T00:00:00Z`,
        end: `${year}-12-31T23:59:59Z`,
      };
    }

    // Year range patterns
    const yearRangeMatch = query.match(/\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b/);
    if (yearRangeMatch) {
      const startYear = parseInt(yearRangeMatch[1] + yearRangeMatch[2]);
      const endYear = parseInt(yearRangeMatch[3] + yearRangeMatch[4]);
      return {
        start: `${startYear}-01-01T00:00:00Z`,
        end: `${endYear}-12-31T23:59:59Z`,
      };
    }

    // Relative time patterns
    const now = new Date();
    if (query.includes('last year') || query.includes('past year')) {
      const lastYear = new Date(now);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      return {
        start: lastYear.toISOString(),
        end: now.toISOString(),
      };
    }

    if (query.includes('last month') || query.includes('past month')) {
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return {
        start: lastMonth.toISOString(),
        end: now.toISOString(),
      };
    }

    if (query.includes('last week') || query.includes('past week')) {
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      return {
        start: lastWeek.toISOString(),
        end: now.toISOString(),
      };
    }

    // Period patterns
    if (query.includes('college') || query.includes('university')) {
      // Assume college is 18-22 years old
      const collegeStart = new Date(now);
      collegeStart.setFullYear(collegeStart.getFullYear() - 22);
      const collegeEnd = new Date(now);
      collegeEnd.setFullYear(collegeEnd.getFullYear() - 18);
      return {
        start: collegeStart.toISOString(),
        end: collegeEnd.toISOString(),
      };
    }

    if (query.includes('high school')) {
      const hsStart = new Date(now);
      hsStart.setFullYear(hsStart.getFullYear() - 18);
      const hsEnd = new Date(now);
      hsEnd.setFullYear(hsEnd.getFullYear() - 14);
      return {
        start: hsStart.toISOString(),
        end: hsEnd.toISOString(),
      };
    }

    return null;
  }

  /**
   * Extract domain from query
   */
  private extractDomain(query: string): Domain | null {
    const domainPatterns: Array<{ pattern: RegExp; domain: Domain }> = [
      { pattern: /\b(fight|fighting|bjj|martial|combat|boxing|mma)\b/, domain: 'fighting' },
      { pattern: /\b(robot|robotics|code|coding|programming|tech|engineering|software)\b/, domain: 'robotics' },
      { pattern: /\b(relationship|love|dating|romance|partner|girlfriend|boyfriend|spouse)\b/, domain: 'relationships' },
      { pattern: /\b(creative|art|writing|music|design|drawing|painting)\b/, domain: 'creative' },
      { pattern: /\b(work|career|job|professional|business|office)\b/, domain: 'professional' },
      { pattern: /\b(personal|growth|self|development|wellness)\b/, domain: 'personal' },
      { pattern: /\b(health|fitness|exercise|gym|workout|wellness)\b/, domain: 'health' },
      { pattern: /\b(education|school|learn|study|course|class)\b/, domain: 'education' },
      { pattern: /\b(family|parent|sibling|brother|sister|mother|father)\b/, domain: 'family' },
      { pattern: /\b(friend|friendship|buddy|pal)\b/, domain: 'friendship' },
      { pattern: /\b(romance|dating|romantic|crush)\b/, domain: 'romance' },
    ];

    for (const { pattern, domain } of domainPatterns) {
      if (pattern.test(query)) {
        return domain;
      }
    }

    return null;
  }

  /**
   * Extract character references from query
   */
  private async extractCharacters(userId: string, query: string): Promise<string[] | null> {
    try {
      // Get all characters for user
      const { data: characters, error } = await supabaseAdmin
        .from('characters')
        .select('id, name, aliases')
        .eq('user_id', userId)
        .limit(100); // Limit for performance

      if (error || !characters || characters.length === 0) {
        return null;
      }

      const queryLower = query.toLowerCase();
      const matchedIds: string[] = [];

      // Patterns that indicate character search
      const characterPatterns = [
        /(?:my\s+)?story\s+with\s+(\w+)/i,
        /(?:everything\s+)?about\s+(\w+)/i,
        /(?:my\s+)?relationship\s+with\s+(\w+)/i,
        /(?:my\s+)?experience\s+with\s+(\w+)/i,
      ];

      // Try pattern matching first
      for (const pattern of characterPatterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
          const searchName = match[1].toLowerCase();
          for (const char of characters) {
            const nameLower = char.name?.toLowerCase() || '';
            const aliases = (char.aliases as string[]) || [];
            const aliasLower = aliases.map(a => a.toLowerCase());

            if (nameLower.includes(searchName) || searchName.includes(nameLower) || 
                aliasLower.some(a => a.includes(searchName) || searchName.includes(a))) {
              if (!matchedIds.includes(char.id)) {
                matchedIds.push(char.id);
              }
            }
          }
        }
      }

      // Fallback: direct name matching
      if (matchedIds.length === 0) {
        for (const char of characters) {
          const nameLower = char.name?.toLowerCase() || '';
          const aliases = (char.aliases as string[]) || [];
          const aliasLower = aliases.map(a => a.toLowerCase());

          // Check if character name or alias appears in query
          if (queryLower.includes(nameLower) || aliasLower.some(a => queryLower.includes(a))) {
            if (!matchedIds.includes(char.id)) {
              matchedIds.push(char.id);
            }
          }
        }
      }

      return matchedIds.length > 0 ? matchedIds : null;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to extract characters from query');
      return null;
    }
  }

  /**
   * Extract location references from query
   */
  private async extractLocations(userId: string, query: string): Promise<string[] | null> {
    try {
      const { data: locations, error } = await supabaseAdmin
        .from('locations')
        .select('id, name, aliases')
        .eq('user_id', userId)
        .limit(100);

      if (error || !locations || locations.length === 0) {
        return null;
      }

      const queryLower = query.toLowerCase();
      const matchedIds: string[] = [];

      // Patterns that indicate location search
      const locationPatterns = [
        /(?:everything\s+)?(?:at|in)\s+(\w+(?:\s+\w+)*)/i,
        /(?:life\s+)?at\s+(\w+(?:\s+\w+)*)/i,
        /(?:my\s+time\s+)?in\s+(\w+(?:\s+\w+)*)/i,
      ];

      // Try pattern matching first
      for (const pattern of locationPatterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
          const searchName = match[1].toLowerCase().trim();
          for (const loc of locations) {
            const nameLower = loc.name?.toLowerCase() || '';
            const aliases = (loc.aliases as string[]) || [];
            const aliasLower = aliases.map(a => a.toLowerCase());

            if (nameLower.includes(searchName) || searchName.includes(nameLower) ||
                aliasLower.some(a => a.includes(searchName) || searchName.includes(a))) {
              if (!matchedIds.includes(loc.id)) {
                matchedIds.push(loc.id);
              }
            }
          }
        }
      }

      // Fallback: direct name matching
      if (matchedIds.length === 0) {
        for (const loc of locations) {
          const nameLower = loc.name?.toLowerCase() || '';
          const aliases = (loc.aliases as string[]) || [];
          const aliasLower = aliases.map(a => a.toLowerCase());

          if (queryLower.includes(nameLower) || aliasLower.some(a => queryLower.includes(a))) {
            if (!matchedIds.includes(loc.id)) {
              matchedIds.push(loc.id);
            }
          }
        }
      }

      return matchedIds.length > 0 ? matchedIds : null;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to extract locations from query');
      return null;
    }
  }

  /**
   * Extract event references from query
   */
  private async extractEvents(userId: string, query: string): Promise<string[] | null> {
    try {
      // Search in resolved_events
      const { data: events, error } = await supabaseAdmin
        .from('resolved_events')
        .select('id, title, description')
        .eq('user_id', userId)
        .limit(100);

      if (error || !events || events.length === 0) {
        return null;
      }

      const queryLower = query.toLowerCase();
      const matchedIds: string[] = [];

      for (const event of events) {
        const titleLower = event.title?.toLowerCase() || '';
        const descLower = event.description?.toLowerCase() || '';

        if (queryLower.includes(titleLower) || (descLower && queryLower.includes(descLower))) {
          matchedIds.push(event.id);
        }
      }

      return matchedIds.length > 0 ? matchedIds : null;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to extract events from query');
      return null;
    }
  }

  /**
   * Extract skill references from query
   */
  private async extractSkills(userId: string, query: string): Promise<string[] | null> {
    try {
      const { data: skills, error } = await supabaseAdmin
        .from('skills')
        .select('id, skill_name, description')
        .eq('user_id', userId)
        .limit(100);

      if (error || !skills || skills.length === 0) {
        return null;
      }

      const queryLower = query.toLowerCase();
      const matchedIds: string[] = [];

      // Patterns that indicate skill search
      const skillPatterns = [
        /(?:my\s+)?(\w+(?:\s+\w+)*)\s+journey/i,
        /(?:learning|practicing|developing)\s+(\w+(?:\s+\w+)*)/i,
        /(?:my\s+)?(\w+(?:\s+\w+)*)\s+progress/i,
      ];

      // Try pattern matching first
      for (const pattern of skillPatterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
          const searchName = match[1].toLowerCase().trim();
          for (const skill of skills) {
            const nameLower = (skill.skill_name || skill.name || '').toLowerCase();
            const descLower = skill.description?.toLowerCase() || '';

            if (nameLower.includes(searchName) || searchName.includes(nameLower) ||
                (descLower && (descLower.includes(searchName) || searchName.includes(descLower)))) {
              if (!matchedIds.includes(skill.id)) {
                matchedIds.push(skill.id);
              }
            }
          }
        }
      }

      // Fallback: direct name matching
      if (matchedIds.length === 0) {
        for (const skill of skills) {
          const nameLower = (skill.skill_name || skill.name || '').toLowerCase();
          const descLower = skill.description?.toLowerCase() || '';

          if (queryLower.includes(nameLower) || (descLower && queryLower.includes(descLower))) {
            if (!matchedIds.includes(skill.id)) {
              matchedIds.push(skill.id);
            }
          }
        }
      }

      return matchedIds.length > 0 ? matchedIds : null;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to extract skills from query');
      return null;
    }
  }

  /**
   * Extract themes from query
   */
  private extractThemes(query: string): string[] | null {
    const themeKeywords = [
      'growth', 'transformation', 'challenge', 'success', 'failure',
      'love', 'loss', 'adventure', 'journey', 'struggle', 'victory',
      'friendship', 'betrayal', 'discovery', 'learning', 'change',
    ];

    const foundThemes: string[] = [];
    for (const keyword of themeKeywords) {
      if (query.includes(keyword)) {
        foundThemes.push(keyword);
      }
    }

    return foundThemes.length > 0 ? foundThemes : null;
  }

  /**
   * Extract tone hints from query
   */
  private extractTone(query: string): 'neutral' | 'dramatic' | 'reflective' | 'mythic' | 'professional' | null {
    if (query.includes('dramatic') || query.includes('epic') || query.includes('intense')) {
      return 'dramatic';
    }
    if (query.includes('reflective') || query.includes('thoughtful') || query.includes('introspective')) {
      return 'reflective';
    }
    if (query.includes('mythic') || query.includes('legendary') || query.includes('epic')) {
      return 'mythic';
    }
    if (query.includes('professional') || query.includes('business') || query.includes('career')) {
      return 'professional';
    }
    return null;
  }

  /**
   * Extract depth hints from query
   */
  private extractDepth(query: string): 'summary' | 'detailed' | 'epic' | null {
    if (query.includes('summary') || query.includes('brief') || query.includes('overview')) {
      return 'summary';
    }
    if (query.includes('detailed') || query.includes('comprehensive') || query.includes('full')) {
      return 'detailed';
    }
    if (query.includes('epic') || query.includes('extensive') || query.includes('complete')) {
      return 'epic';
    }
    return null;
  }

  /**
   * Extract version hints from query
   */
  private extractVersion(query: string): 'main' | 'safe' | 'explicit' | 'private' | null {
    if (query.includes('safe') || query.includes('public') || query.includes('clean')) {
      return 'safe';
    }
    if (query.includes('explicit') || query.includes('honest') || query.includes('raw')) {
      return 'explicit';
    }
    if (query.includes('private') || query.includes('personal') || query.includes('secret')) {
      return 'private';
    }
    return null;
  }
}

export const lorebookSearchParser = new LorebookSearchParser();
