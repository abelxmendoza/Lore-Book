import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type UnnamedCharacter = {
  context: string; // The conversation context where they were mentioned
  description?: string; // Description of the character
  role?: string; // Their role (friend, colleague, etc.)
  relationship?: string; // Relationship to user
  pronouns?: string;
  proximity?: 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party'; // How directly connected
  hasMet?: boolean; // Whether user has met them
  relationshipDepth?: 'close' | 'moderate' | 'casual' | 'acquaintance' | 'mentioned_only'; // Depth of relationship
  associatedWith?: string[]; // Names of characters they're associated with
  likelihoodToMeet?: 'likely' | 'possible' | 'unlikely' | 'never'; // Likelihood of meeting
};

export type CharacterWithNickname = {
  name: string; // The generated nickname (or real name if provided)
  firstName?: string; // First name if known
  lastName?: string; // Last name if known
  alias?: string[]; // Alternative names/nicknames
  description?: string;
  role?: string;
  archetype?: string;
  pronouns?: string;
  tags?: string[];
  summary?: string;
  context: string; // Where they were mentioned
  isNickname?: boolean; // True if name is a generated nickname
  proximity?: 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party'; // How directly connected
  hasMet?: boolean; // Whether user has met them
  relationshipDepth?: 'close' | 'moderate' | 'casual' | 'acquaintance' | 'mentioned_only'; // Depth of relationship
  associatedWith?: string[]; // Names of characters they're associated with
  likelihoodToMeet?: 'likely' | 'possible' | 'unlikely' | 'never'; // Likelihood of meeting
};

class CharacterNicknameService {
  /**
   * Detect unnamed characters from conversation and generate nicknames
   */
  async detectAndGenerateNicknames(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<CharacterWithNickname[]> {
    try {
      // Use AI to detect unnamed characters
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are analyzing a conversation to detect unnamed characters (people mentioned without names).

Look for:
- References to people without names (e.g., "my friend", "the colleague", "someone I met")
- Descriptions of people that could be characters
- Relationships mentioned (e.g., "my mentor", "a person at work")
- Context clues about who they are

For each unnamed character, extract:
- Description/context of who they are
- Their role or relationship to the user
- Any pronouns mentioned
- Context from the conversation

Return JSON:
{
  "unnamedCharacters": [
    {
      "description": "brief description of who this person is",
      "role": "friend|colleague|mentor|family|acquaintance|other",
      "relationship": "how they relate to the user",
      "pronouns": "he|she|they|unknown",
      "context": "the specific mention or context from the conversation",
      "proximity": "direct|indirect|distant|unmet|third_party",
      "hasMet": true|false,
      "relationshipDepth": "close|moderate|casual|acquaintance|mentioned_only",
      "associatedWith": ["character names they're connected to"],
      "likelihoodToMeet": "likely|possible|unlikely|never"
    }
  ]
}

Proximity levels:
- direct: User knows them directly
- indirect: User knows them through someone else
- distant: User barely knows them
- unmet: User has never met them
- third_party: Mentioned by others, user doesn't know them

Relationship depth:
- close: Close relationship
- moderate: Moderate relationship
- casual: Casual relationship
- acquaintance: Just an acquaintance
- mentioned_only: Only mentioned, no real relationship

Only detect characters that are clearly mentioned but don't have names. Skip generic references that aren't specific people.

IMPORTANT: Detect proximity and relationship depth:
- If mentioned with possessive (e.g., "Sarah's friend", "Marcus's wife") → proximity: "indirect" or "third_party", hasMet: false
- If user says "I've never met" or "mentioned by" → proximity: "unmet" or "third_party", hasMet: false
- If user says "barely know" or "casual acquaintance" → proximity: "distant", relationshipDepth: "acquaintance"
- If user says "only mentioned" or "don't know them" → relationshipDepth: "mentioned_only", proximity: "third_party"

If no unnamed characters are found, return {"unnamedCharacters": []}.`
          },
          {
            role: 'user',
            content: `Conversation:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent message: ${message}\n\nDetect unnamed characters:`
          }
        ]
      });

      const response = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(response) as { unnamedCharacters?: UnnamedCharacter[] };
      const unnamedCharacters = Array.isArray(parsed.unnamedCharacters) ? parsed.unnamedCharacters : [];

      if (unnamedCharacters.length === 0) {
        return [];
      }

      // Get existing characters to avoid duplicates
      const { data: existingCharacters } = await supabaseAdmin
        .from('characters')
        .select('name, alias, summary, role')
        .eq('user_id', userId);

      const existingNames = new Set<string>();
      const existingAliases = new Set<string>();
      
      existingCharacters?.forEach(char => {
        existingNames.add(char.name.toLowerCase());
        if (char.alias && Array.isArray(char.alias)) {
          char.alias.forEach(alias => existingAliases.add(alias.toLowerCase()));
        }
      });

      // Generate nicknames for each unnamed character
      const charactersWithNicknames: CharacterWithNickname[] = [];

      for (const unnamedChar of unnamedCharacters) {
        // Check if this character already exists (by description/role match)
        const similarCharacter = existingCharacters?.find(char => {
          const charSummary = (char.summary || '').toLowerCase();
          const charRole = (char.role || '').toLowerCase();
          const descMatch = unnamedChar.description && charSummary.includes(unnamedChar.description.toLowerCase());
          const roleMatch = unnamedChar.role && charRole === unnamedChar.role.toLowerCase();
          return descMatch || roleMatch;
        });

        if (similarCharacter) {
          // Character already exists, skip
          continue;
        }

        // Generate a unique nickname with conversation context
        const conversationContext = conversationHistory
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        
        const nickname = await this.generateUniqueNickname(
          userId,
          unnamedChar,
          existingNames,
          existingAliases,
          conversationContext,
          message
        );

        if (nickname) {
          charactersWithNicknames.push({
            name: nickname,
            description: unnamedChar.description,
            role: unnamedChar.role,
            archetype: this.mapRoleToArchetype(unnamedChar.role),
            pronouns: unnamedChar.pronouns,
            tags: this.generateTags(unnamedChar),
            summary: unnamedChar.description || `${unnamedChar.role || 'person'} mentioned in conversation`,
            context: unnamedChar.context,
            proximity: unnamedChar.proximity || 'distant',
            hasMet: unnamedChar.hasMet ?? false,
            relationshipDepth: unnamedChar.relationshipDepth || 'mentioned_only',
            associatedWith: unnamedChar.associatedWith || [],
            likelihoodToMeet: unnamedChar.likelihoodToMeet || 'unlikely'
          });

          // Add to existing names to avoid duplicates in this batch
          existingNames.add(nickname.toLowerCase());
        }
      }

      return charactersWithNicknames;
    } catch (error) {
      logger.error({ error, message }, 'Failed to detect and generate nicknames');
      return [];
    }
  }

  /**
   * Generate a unique nickname for an unnamed character
   */
  private async generateUniqueNickname(
    userId: string,
    character: UnnamedCharacter,
    existingNames: Set<string>,
    existingAliases: Set<string>,
    conversationContext?: string,
    currentMessage?: string
  ): Promise<string | null> {
    try {
      // Get existing characters to understand relationships
      const { data: existingCharacters } = await supabaseAdmin
        .from('characters')
        .select('id, name, role, summary')
        .eq('user_id', userId);

      // Build context about related characters
      const relatedCharsContext = character.associatedWith && character.associatedWith.length > 0
        ? `Related characters mentioned: ${character.associatedWith.join(', ')}`
        : '';

      // Use AI to generate contextual nickname
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.8,
        messages: [
          {
            role: 'system',
            content: `Generate a unique, contextual nickname for an unnamed character based on their description, role, and relationships.

Guidelines:
- Include relationship context when available (e.g., "Josh's Startup Cofounder", "Recruiter that sent you to Josh")
- Use descriptive phrases that capture their connection to other characters or situations
- Make it specific and memorable (3-6 words is ideal)
- Include the character they're associated with in the nickname when relevant
- Use action/relationship words (e.g., "that sent", "who works with", "from", "at")
- Avoid generic names like "The Recruiter" or "The Co-Founder" - be more specific

Examples:
- "Josh's Startup Cofounder" (for a co-founder mentioned by Josh)
- "Recruiter that sent you to Josh" (for a recruiter who connected you to Josh)
- "Sarah's Friend from College" (for someone mentioned by Sarah)
- "The Mentor at Tech Startup" (for a mentor at a specific company)
- "Coffee Shop Owner I Met Yesterday" (for someone met at a specific place/time)

Return only the nickname, no quotes or explanation.`
          },
          {
            role: 'user',
            content: `Generate a contextual nickname for:
Role: ${character.role || 'unknown'}
Relationship: ${character.relationship || 'unknown'}
Description: ${character.description || 'no description'}
Context: ${character.context}
${relatedCharsContext}
${conversationContext ? `Full conversation context: ${conversationContext}` : ''}
${currentMessage ? `Current message: ${currentMessage}` : ''}

Generate a unique, contextual nickname that includes relationship information:`
          }
        ]
      });

      let nickname = completion.choices[0]?.message?.content?.trim() || '';
      
      // Remove quotes if present
      nickname = nickname.replace(/^["']|["']$/g, '').trim();

      if (!nickname || nickname.length < 2) {
        // Fallback to contextual nickname
        nickname = this.generateContextualFallbackNickname(character);
      }

      // Ensure uniqueness
      let uniqueNickname = nickname;
      let counter = 1;
      while (existingNames.has(uniqueNickname.toLowerCase()) || existingAliases.has(uniqueNickname.toLowerCase())) {
        uniqueNickname = `${nickname} ${counter}`;
        counter++;
        if (counter > 100) {
          // Safety limit
          uniqueNickname = `${nickname} ${Date.now().toString().slice(-4)}`;
          break;
        }
      }

      return uniqueNickname;
    } catch (error) {
      logger.warn({ error, character }, 'Failed to generate nickname, using fallback');
      return this.generateContextualFallbackNickname(character);
    }
  }

  /**
   * Generate contextual fallback nickname based on role/description and relationships
   */
  private generateContextualFallbackNickname(character: UnnamedCharacter): string {
    const role = character.role?.toLowerCase() || '';
    const description = (character.description || '').toLowerCase();
    const associatedWith = character.associatedWith || [];
    
    // If associated with characters, include them in nickname
    if (associatedWith.length > 0) {
      const primaryAssoc = associatedWith[0];
      
      if (role === 'co-founder' || role === 'cofounder') {
        return `${primaryAssoc}'s Startup Cofounder`;
      }
      if (role === 'recruiter') {
        return `Recruiter that sent you to ${primaryAssoc}`;
      }
      if (role === 'friend') {
        return `${primaryAssoc}'s Friend`;
      }
      if (role === 'colleague') {
        return `${primaryAssoc}'s Colleague`;
      }
      
      return `${primaryAssoc}'s ${role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Contact'}`;
    }
    
    // Role-based nicknames without associations
    const roleNicknames: Record<string, string> = {
      'recruiter': 'The Recruiter',
      'co-founder': 'The Cofounder',
      'cofounder': 'The Cofounder',
      'friend': 'The Friend',
      'colleague': 'The Colleague',
      'mentor': 'The Mentor',
      'family': 'Family Member',
      'acquaintance': 'The Acquaintance'
    };

    if (roleNicknames[role]) {
      return roleNicknames[role];
    }

    // Description-based
    if (description.includes('startup') || description.includes('company')) {
      return 'The Startup Contact';
    }
    if (description.includes('recruiter') || description.includes('hiring')) {
      return 'The Recruiter';
    }

    // Default
    return `The ${character.role ? character.role.charAt(0).toUpperCase() + character.role.slice(1) : 'Person'}`;
  }

  /**
   * Map role to archetype
   */
  private mapRoleToArchetype(role?: string): string | undefined {
    if (!role) return undefined;
    
    const roleMap: Record<string, string> = {
      'friend': 'companion',
      'colleague': 'professional',
      'mentor': 'guide',
      'family': 'kin',
      'acquaintance': 'stranger'
    };

    return roleMap[role.toLowerCase()] || undefined;
  }

  /**
   * Generate tags from character info
   */
  private generateTags(character: UnnamedCharacter): string[] {
    const tags: string[] = [];
    
    if (character.role) {
      tags.push(character.role);
    }
    if (character.relationship) {
      tags.push(character.relationship);
    }
    tags.push('auto-generated', 'nickname');

    return tags;
  }

  /**
   * Extract and store nicknames from conversation
   * Also detects if existing characters are referred to by nicknames
   */
  async extractNicknamesFromConversation(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<{
    newCharacters: CharacterWithNickname[];
    nicknameMappings: Array<{ characterId: string; nickname: string }>;
  }> {
    try {
      // Detect unnamed characters and generate nicknames
      const newCharacters = await this.detectAndGenerateNicknames(userId, message, conversationHistory);

      // Also detect nickname usage for existing characters
      const nicknameMappings = await this.detectNicknameUsage(userId, message, conversationHistory);

      return {
        newCharacters,
        nicknameMappings
      };
    } catch (error) {
      logger.error({ error }, 'Failed to extract nicknames from conversation');
      return { newCharacters: [], nicknameMappings: [] };
    }
  }

  /**
   * Detect if existing characters are being referred to by nicknames
   */
  private async detectNicknameUsage(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<Array<{ characterId: string; nickname: string }>> {
    try {
      // Get all existing characters
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, name, alias, summary')
        .eq('user_id', userId);

      if (!characters || characters.length === 0) {
        return [];
      }

      // Use AI to detect nickname usage
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze the conversation to detect if existing characters are being referred to by nicknames or alternative names.

Given these characters:
${characters.map(c => `- ${c.name} (ID: ${c.id})${c.alias ? `, also known as: ${c.alias.join(', ')}` : ''}${c.summary ? `, ${c.summary}` : ''}`).join('\n')}

Detect if any of these characters are mentioned in the conversation using:
- Their actual name
- A nickname or alias
- A description that matches them
- A pronoun reference that clearly refers to them

Return JSON:
{
  "nicknameMappings": [
    {
      "characterId": "character UUID",
      "nickname": "the nickname or alternative name used",
      "confidence": 0.0-1.0
    }
  ]
}

Only include mappings with confidence > 0.6. If no nicknames detected, return {"nicknameMappings": []}.`
          },
          {
            role: 'user',
            content: `Conversation:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent message: ${message}\n\nDetect nickname usage:`
          }
        ]
      });

      const response = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(response) as {
        nicknameMappings?: Array<{ characterId: string; nickname: string; confidence: number }>;
      };

      const mappings = (parsed.nicknameMappings || [])
        .filter(m => m.confidence > 0.6)
        .map(m => ({
          characterId: m.characterId,
          nickname: m.nickname
        }));

      return mappings;
    } catch (error) {
      logger.warn({ error }, 'Failed to detect nickname usage');
      return [];
    }
  }

  /**
   * Parse name into first and last name
   */
  private parseName(fullName: string): { firstName: string; lastName?: string } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0] };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  /**
   * Create character with generated nickname or real name
   */
  async createCharacterWithNickname(
    userId: string,
    character: CharacterWithNickname
  ): Promise<{ id: string; name: string } | null> {
    try {
      // Check if character with this name already exists
      const { data: existing } = await supabaseAdmin
        .from('characters')
        .select('id, name, first_name, last_name')
        .eq('user_id', userId)
        .eq('name', character.name)
        .single();

      if (existing) {
        return existing;
      }

      // Parse name if not already parsed
      const nameParts = character.firstName 
        ? { firstName: character.firstName, lastName: character.lastName }
        : this.parseName(character.name);

      // Determine if this is a nickname
      const isNickname = character.isNickname ?? (!character.firstName && !character.lastName);

      // Create new character
      const id = uuid();
      const { avatarStyleFor, characterAvatarUrl } = await import('../utils/avatar');
      const style = avatarStyleFor(character.archetype || character.role);
      const avatarUrl = characterAvatarUrl(id, style);

      // Find associated character IDs if provided
      let associatedWithIds: string[] = [];
      const mentionedByIds: string[] = [];
      
      if (character.associatedWith && character.associatedWith.length > 0) {
        const { data: associatedChars } = await supabaseAdmin
          .from('characters')
          .select('id')
          .eq('user_id', userId)
          .in('name', character.associatedWith);
        
        if (associatedChars) {
          associatedWithIds = associatedChars.map(c => c.id);
        }
      }

      const { data: newCharacter, error } = await supabaseAdmin
        .from('characters')
        .insert({
          id,
          user_id: userId,
          name: character.name,
          first_name: nameParts.firstName,
          last_name: nameParts.lastName || null,
          alias: character.alias || [],
          pronouns: character.pronouns || null,
          archetype: character.archetype || null,
          role: character.role || null,
          summary: character.summary || character.description || null,
          tags: character.tags || [],
          avatar_url: avatarUrl,
          is_nickname: isNickname,
          importance_level: 'minor', // Will be calculated later
          importance_score: 0,
          proximity_level: character.proximity || 'distant',
          has_met: character.hasMet ?? false,
          relationship_depth: character.relationshipDepth || 'mentioned_only',
          associated_with_character_ids: associatedWithIds,
          mentioned_by_character_ids: mentionedByIds,
          context_of_mention: character.context,
          likelihood_to_meet: character.likelihoodToMeet || 'unlikely',
          metadata: {
            autoGenerated: true,
            fromNickname: isNickname,
            context: character.context
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id, name')
        .single();

      if (error) {
        logger.error({ error, character }, 'Failed to create character with nickname');
        return null;
      }

      // Calculate importance asynchronously
      const { characterImportanceService } = await import('./characterImportanceService');
      characterImportanceService.calculateImportance(userId, newCharacter.id, {})
        .then(importance => {
          return characterImportanceService.updateCharacterImportance(userId, newCharacter.id, importance);
        })
        .catch(err => {
          logger.debug({ err, characterId: newCharacter.id }, 'Failed to calculate initial importance');
        });

      return newCharacter;
    } catch (error) {
      logger.error({ error, character }, 'Failed to create character with nickname');
      return null;
    }
  }

  /**
   * Update character with new nickname/alias
   */
  async addNicknameToCharacter(
    userId: string,
    characterId: string,
    nickname: string
  ): Promise<boolean> {
    try {
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('alias')
        .eq('id', characterId)
        .eq('user_id', userId)
        .single();

      if (!character) {
        return false;
      }

      const existingAliases = Array.isArray(character.alias) ? character.alias : [];
      if (existingAliases.includes(nickname)) {
        return true; // Already has this nickname
      }

      const { error } = await supabaseAdmin
        .from('characters')
        .update({
          alias: [...existingAliases, nickname],
          updated_at: new Date().toISOString()
        })
        .eq('id', characterId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ error, characterId, nickname }, 'Failed to add nickname to character');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, characterId, nickname }, 'Failed to add nickname to character');
      return false;
    }
  }
}

export const characterNicknameService = new CharacterNicknameService();
