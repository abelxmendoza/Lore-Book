// =====================================================
// GROUP DETECTION SERVICE
// Purpose: Auto-detect groups, members, and generate nicknames
// =====================================================

import { logger } from '../logger';

import { organizationService, type Organization, type OrganizationMember } from './organizationService';
import { supabaseAdmin } from './supabaseClient';

export interface DetectedGroup {
  name?: string;
  nickname?: string;
  members: string[];
  context: string;
  confidence: number;
  suggested_type?: Organization['type'];
}

export class GroupDetectionService {
  /**
   * Detect groups mentioned in a conversation message
   */
  async detectGroupsInMessage(
    userId: string,
    message: string,
    conversationContext?: string[]
  ): Promise<DetectedGroup[]> {
    try {
      const detectedGroups: DetectedGroup[] = [];
      
      // Patterns to detect groups
      const groupPatterns = [
        // Explicit group mentions: "my band", "our team", "the group"
        /(?:my|our|the)\s+(band|team|group|club|squad|crew|gang|circle|crew|posse|troupe)/gi,
        // Named groups: "Tech Corp", "Book Club", etc.
        /(?:called|named|known as|we call it)\s+["']?([A-Z][a-zA-Z\s]+)["']?/gi,
        // "We" statements with multiple people: "Sarah, Marcus, and I went..."
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s*,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))+\s+(?:and\s+)?(?:I|we)/gi,
        // Activities with groups: "played basketball with...", "had dinner with..."
        /(?:with|together with|along with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s*,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))+/gi,
      ];

      // Extract potential group names
      const groupNames: Set<string> = new Set();
      for (const pattern of groupPatterns) {
        const matches = message.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            groupNames.add(match[1].trim());
          }
        }
      }

      // Extract member names (people mentioned together)
      const memberNames = this.extractMemberNames(message, conversationContext);

      // If we have members but no explicit group name, generate a nickname
      if (memberNames.length >= 2) {
        const existingGroups = await this.findExistingGroupsByMembers(userId, memberNames);
        
        if (existingGroups.length === 0) {
          // New group detected - generate nickname
          const nickname = await this.generateGroupNickname(userId, memberNames);
          const suggestedType = this.suggestGroupType(message, memberNames);
          
          detectedGroups.push({
            nickname,
            members: memberNames,
            context: message.substring(0, 200),
            confidence: 0.7,
            suggested_type: suggestedType,
          });
        } else {
          // Existing group - update members if needed
          for (const group of existingGroups) {
            const newMembers = memberNames.filter(m => 
              !group.members?.some(gm => 
                gm.character_name.toLowerCase() === m.toLowerCase()
              )
            );
            
            if (newMembers.length > 0) {
              detectedGroups.push({
                name: group.name,
                members: newMembers,
                context: message.substring(0, 200),
                confidence: 0.8,
                suggested_type: group.type,
              });
            }
          }
        }
      }

      // Process explicit group names
      for (const groupName of groupNames) {
        const existingGroup = await this.findGroupByName(userId, groupName);
        
        if (!existingGroup) {
          // New named group
          const members = memberNames.length > 0 ? memberNames : await this.extractMembersFromContext(userId, message);
          const suggestedType = this.suggestGroupType(message, members);
          
          detectedGroups.push({
            name: groupName,
            members,
            context: message.substring(0, 200),
            confidence: 0.9,
            suggested_type: suggestedType,
          });
        } else {
          // Update existing group with new members
          const newMembers = memberNames.filter(m => 
            !existingGroup.members?.some(gm => 
              gm.character_name.toLowerCase() === m.toLowerCase()
            )
          );
          
          if (newMembers.length > 0) {
            detectedGroups.push({
              name: existingGroup.name,
              members: newMembers,
              context: message.substring(0, 200),
              confidence: 0.8,
            });
          }
        }
      }

      return detectedGroups;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect groups in message');
      return [];
    }
  }

  /**
   * Extract member names from message
   */
  private extractMemberNames(message: string, context?: string[]): string[] {
    const names: Set<string> = new Set();
    
    // Pattern: Capitalized words that look like names
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    const matches = message.matchAll(namePattern);
    
    // Common words to exclude
    const excludeWords = new Set([
      'I', 'We', 'You', 'They', 'The', 'This', 'That', 'There', 'Here',
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
      'Today', 'Tomorrow', 'Yesterday', 'Now', 'Then', 'When', 'Where', 'What', 'Who', 'Why', 'How',
    ]);

    for (const match of matches) {
      const name = match[1].trim();
      if (!excludeWords.has(name) && name.length > 1) {
        names.add(name);
      }
    }

    // Also check context if provided
    if (context) {
      for (const ctx of context) {
        const ctxMatches = ctx.matchAll(namePattern);
        for (const match of ctxMatches) {
          const name = match[1].trim();
          if (!excludeWords.has(name) && name.length > 1) {
            names.add(name);
          }
        }
      }
    }

    return Array.from(names);
  }

  /**
   * Generate a unique nickname for a group based on members
   */
  async generateGroupNickname(userId: string, members: string[]): Promise<string> {
    try {
      // Try different nickname strategies
      const strategies = [
        // First letters: "Sarah, Marcus, Alex" -> "SMA Squad"
        () => {
          const initials = members.map(m => m.charAt(0).toUpperCase()).join('');
          return `${initials} Squad`;
        },
        // First names: "Sarah, Marcus" -> "Sarah & Marcus"
        () => {
          const firstNames = members.map(m => m.split(' ')[0]);
          if (firstNames.length === 2) {
            return `${firstNames[0]} & ${firstNames[1]}`;
          } else if (firstNames.length > 2) {
            return `${firstNames.slice(0, -1).join(', ')}, & ${firstNames[firstNames.length - 1]}`;
          }
          return firstNames.join(' & ');
        },
        // Number-based: "The Three" or "The Four"
        () => {
          const count = members.length;
          const numberNames: Record<number, string> = {
            2: 'The Two',
            3: 'The Three',
            4: 'The Four',
            5: 'The Five',
          };
          return numberNames[count] || `The ${count}`;
        },
      ];

      // Try each strategy and check for uniqueness
      for (const strategy of strategies) {
        const nickname = strategy();
        if (nickname) {
          const existing = await this.findGroupByName(userId, nickname);
          if (!existing) {
            return nickname;
          }
        }
      }

      // Fallback: timestamp-based
      return `Group ${Date.now().toString(36).slice(-6)}`;
    } catch (error) {
      logger.error({ error, userId, members }, 'Failed to generate group nickname');
      return `Group ${members.length}`;
    }
  }

  /**
   * Suggest group type based on context
   */
  private suggestGroupType(message: string, members: string[]): Organization['type'] {
    const lowerMessage = message.toLowerCase();
    
    // Sports-related
    if (/\b(basketball|football|soccer|baseball|tennis|volleyball|sports|game|match|tournament|team)\b/.test(lowerMessage)) {
      return 'sports_team';
    }
    
    // Work-related
    if (/\b(work|office|company|colleague|meeting|project|business|job)\b/.test(lowerMessage)) {
      return 'company';
    }
    
    // Club-related
    if (/\b(club|meeting|gathering|event|activity|hobby)\b/.test(lowerMessage)) {
      return 'club';
    }
    
    // Band/music
    if (/\b(band|music|concert|gig|song|album|rehearsal)\b/.test(lowerMessage)) {
      return 'other'; // Will be dynamically categorized
    }
    
    // Default to friend group
    return 'friend_group';
  }

  /**
   * Find existing groups by member names
   */
  private async findExistingGroupsByMembers(
    userId: string,
    memberNames: string[]
  ): Promise<Organization[]> {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select('id, name, type')
        .eq('user_id', userId);

      if (error || !orgs) return [];

      // Get members for each org and check for matches
      const matchingOrgs: Organization[] = [];
      
      for (const org of orgs) {
        const members = await organizationService.getMembers(org.id);
        const orgMemberNames = members.map(m => m.character_name.toLowerCase());
        
        // Check if at least 2 members match
        const matches = memberNames.filter(name => 
          orgMemberNames.some(om => om.includes(name.toLowerCase()) || name.toLowerCase().includes(om))
        );
        
        if (matches.length >= 2) {
          const fullOrg = await organizationService.getOrganization(userId, org.id);
          if (fullOrg) {
            matchingOrgs.push(fullOrg);
          }
        }
      }

      return matchingOrgs;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to find groups by members');
      return [];
    }
  }

  /**
   * Find group by name (fuzzy match)
   */
  private async findGroupByName(userId: string, name: string): Promise<Organization | null> {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .or(`name.ilike.%${name}%,aliases.cs.{${name}}`);

      if (error || !orgs || orgs.length === 0) return null;

      return await organizationService.getOrganization(userId, orgs[0].id);
    } catch (error) {
      logger.error({ error, userId, name }, 'Failed to find group by name');
      return null;
    }
  }

  /**
   * Extract members from context (fallback)
   */
  private async extractMembersFromContext(userId: string, message: string): Promise<string[]> {
    // Try to find character names in the database that are mentioned
    try {
      const { data: characters, error } = await supabaseAdmin
        .from('characters')
        .select('name')
        .eq('user_id', userId);

      if (error || !characters) return [];

      const mentionedNames: string[] = [];
      const lowerMessage = message.toLowerCase();

      for (const char of characters) {
        if (lowerMessage.includes(char.name.toLowerCase())) {
          mentionedNames.push(char.name);
        }
      }

      return mentionedNames;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to extract members from context');
      return [];
    }
  }

  /**
   * Process detected groups and create/update organizations
   */
  async processDetectedGroups(
    userId: string,
    detectedGroups: DetectedGroup[]
  ): Promise<Organization[]> {
    const processed: Organization[] = [];

    for (const detected of detectedGroups) {
      try {
        let organization: Organization | null = null;

        if (detected.name) {
          // Named group - find or create
          organization = await this.findGroupByName(userId, detected.name);
          
          if (!organization) {
            // Create new organization
            organization = await organizationService.createOrganization(userId, {
              name: detected.name,
              type: detected.suggested_type || 'other',
              status: 'active',
            });
          }
        } else if (detected.nickname) {
          // Unnamed group with nickname - create with nickname
          organization = await organizationService.createOrganization(userId, {
            name: detected.nickname,
            aliases: [],
            type: detected.suggested_type || 'friend_group',
            status: 'active',
          });
        }

        if (organization && detected.members.length > 0) {
          // Add members
          for (const memberName of detected.members) {
            try {
              // Check if member already exists
              const existingMembers = await organizationService.getMembers(organization.id);
              const exists = existingMembers.some(m => 
                m.character_name.toLowerCase() === memberName.toLowerCase()
              );

              if (!exists) {
                await organizationService.addMember(userId, organization.id, {
                  character_name: memberName,
                  status: 'active',
                });
              }
            } catch (error) {
              logger.error({ error, userId, organizationId: organization.id, memberName }, 'Failed to add member');
            }
          }

          // Refresh organization
          organization = await organizationService.getOrganization(userId, organization.id);
          if (organization) {
            processed.push(organization);
          }
        }
      } catch (error) {
        logger.error({ error, userId, detected }, 'Failed to process detected group');
      }
    }

    return processed;
  }
}

export const groupDetectionService = new GroupDetectionService();

