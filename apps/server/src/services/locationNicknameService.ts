import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type UnnamedLocation = {
  context: string; // The conversation context where it was mentioned
  type?: string; // park, restaurant, shop, cafe, etc.
  description?: string; // Description of the location
  associatedWith?: string[]; // Character names or location names
  eventContext?: string; // Event that happened there
  proximity?: string; // "by", "near", "at", "in"
  proximityTarget?: string; // What it's near/by
};

export type LocationWithNickname = {
  name: string; // The generated nickname (or real name if provided)
  type?: string;
  description?: string;
  summary?: string;
  context: string; // Where it was mentioned
  isNickname?: boolean; // True if name is a generated nickname
  associatedWith?: string[]; // Names of characters/locations
  eventContext?: string;
  proximity?: string;
  proximityTarget?: string;
};

class LocationNicknameService {
  /**
   * Detect unnamed locations from conversation and generate nicknames
   */
  async detectAndGenerateNicknames(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<LocationWithNickname[]> {
    try {
      // Use AI to detect unnamed locations
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are analyzing a conversation to detect unnamed locations (places mentioned without specific names).

Look for:
- References to places without names (e.g., "this park", "that restaurant", "the pizza shop")
- Generic place types (park, restaurant, shop, cafe, store, gym, etc.)
- Locations described by proximity (e.g., "park by Nick's house", "cafe near the gym")
- Locations described by events (e.g., "pizza shop where the fight happened")
- Context clues about where they are

For each unnamed location, extract:
- Type of place (park, restaurant, shop, cafe, store, gym, etc.)
- Description/context of where it is
- Associated characters or locations (e.g., "by Nick's house")
- Event context if mentioned (e.g., "where the fight happened")
- Proximity indicators (by, near, at, in)

Return JSON:
{
  "unnamedLocations": [
    {
      "type": "park|restaurant|shop|cafe|store|gym|etc",
      "description": "brief description of the location",
      "context": "the specific mention from the conversation",
      "associatedWith": ["character names or location names"],
      "eventContext": "event that happened there (if mentioned)",
      "proximity": "by|near|at|in",
      "proximityTarget": "what it's near/by (e.g., 'Nick's house')"
    }
  ]
}

Only detect locations that are clearly mentioned but don't have specific names. Skip generic references that aren't specific places.

If no unnamed locations are found, return {"unnamedLocations": []}.`
          },
          {
            role: 'user',
            content: `Conversation:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent message: ${message}\n\nDetect unnamed locations:`
          }
        ]
      });

      const response = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(response) as { unnamedLocations?: UnnamedLocation[] };
      const unnamedLocations = Array.isArray(parsed.unnamedLocations) ? parsed.unnamedLocations : [];

      if (unnamedLocations.length === 0) {
        return [];
      }

      // Get existing locations to avoid duplicates
      const { data: existingLocations } = await supabaseAdmin
        .from('locations')
        .select('name, normalized_name, type, summary')
        .eq('user_id', userId);

      const existingNames = new Set<string>();
      existingLocations?.forEach(loc => {
        existingNames.add(loc.name.toLowerCase());
        if (loc.normalized_name) {
          existingNames.add(loc.normalized_name.toLowerCase());
        }
      });

      // Generate nicknames for each unnamed location
      const locationsWithNicknames: LocationWithNickname[] = [];

      for (const unnamedLoc of unnamedLocations) {
        // Check if this location already exists (by type/description match)
        const similarLocation = existingLocations?.find(loc => {
          const locType = (loc.type || '').toLowerCase();
          const locSummary = (loc.summary || '').toLowerCase();
          const descMatch = unnamedLoc.description && locSummary.includes(unnamedLoc.description.toLowerCase());
          const typeMatch = unnamedLoc.type && locType === unnamedLoc.type.toLowerCase();
          return descMatch || typeMatch;
        });

        if (similarLocation) {
          // Location already exists, skip
          continue;
        }

        // Generate a unique nickname with conversation context
        const conversationContext = conversationHistory
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        
        const nickname = await this.generateUniqueNickname(
          userId,
          unnamedLoc,
          existingNames,
          conversationContext,
          message
        );

        if (nickname) {
          locationsWithNicknames.push({
            name: nickname,
            type: unnamedLoc.type,
            description: unnamedLoc.description,
            summary: unnamedLoc.description || `${unnamedLoc.type || 'location'} mentioned in conversation`,
            context: unnamedLoc.context,
            isNickname: true,
            associatedWith: unnamedLoc.associatedWith || [],
            eventContext: unnamedLoc.eventContext,
            proximity: unnamedLoc.proximity,
            proximityTarget: unnamedLoc.proximityTarget
          });

          // Add to existing names to avoid duplicates in this batch
          existingNames.add(nickname.toLowerCase());
        }
      }

      return locationsWithNicknames;
    } catch (error) {
      logger.error({ error, message }, 'Failed to detect and generate location nicknames');
      return [];
    }
  }

  /**
   * Generate a unique contextual nickname for an unnamed location
   */
  private async generateUniqueNickname(
    userId: string,
    location: UnnamedLocation,
    existingNames: Set<string>,
    conversationContext?: string,
    currentMessage?: string
  ): Promise<string | null> {
    try {
      // Get existing characters and locations to understand relationships
      const { data: existingCharacters } = await supabaseAdmin
        .from('characters')
        .select('id, name, role, summary')
        .eq('user_id', userId);

      const { data: existingLocations } = await supabaseAdmin
        .from('locations')
        .select('id, name, type')
        .eq('user_id', userId);

      // Build context about related entities
      const relatedContext = location.associatedWith && location.associatedWith.length > 0
        ? `Related entities: ${location.associatedWith.join(', ')}`
        : '';

      // Use AI to generate contextual nickname
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.8,
        messages: [
          {
            role: 'system',
            content: `Generate a unique, contextual nickname for an unnamed location based on its type, description, and relationships.

Guidelines:
- Include relationship context when available (e.g., "The park by Nick's house", "The pizza shop where the fight happened")
- Use descriptive phrases that capture the location's connection to other entities or events
- Make it specific and memorable (3-6 words is ideal)
- Include the character/location it's associated with in the nickname when relevant
- Use action/relationship words (e.g., "by", "near", "where", "at")
- Avoid generic names like "The Park" or "The Restaurant" - be more specific

Examples:
- "The park by Nick's house" (for a park near Nick's house)
- "The pizza shop where the fight happened" (for a pizza shop with event context)
- "The cafe near the gym" (for a cafe near another location)
- "The restaurant where I met Sarah" (for a restaurant with character/event context)

Return only the nickname, no quotes or explanation.`
          },
          {
            role: 'user',
            content: `Generate a contextual nickname for:
Type: ${location.type || 'unknown'}
Description: ${location.description || 'no description'}
Context: ${location.context}
${relatedContext}
${location.eventContext ? `Event context: ${location.eventContext}` : ''}
${location.proximityTarget ? `Proximity: ${location.proximity || 'near'} ${location.proximityTarget}` : ''}
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
        nickname = this.generateContextualFallbackNickname(location);
      }

      // Ensure uniqueness
      let uniqueNickname = nickname;
      let counter = 1;
      while (existingNames.has(uniqueNickname.toLowerCase())) {
        uniqueNickname = `${nickname} ${counter}`;
        counter++;
        if (counter > 100) {
          uniqueNickname = `${nickname} ${Date.now().toString().slice(-4)}`;
          break;
        }
      }

      return uniqueNickname;
    } catch (error) {
      logger.warn({ error, location }, 'Failed to generate location nickname, using fallback');
      return this.generateContextualFallbackNickname(location);
    }
  }

  /**
   * Generate contextual fallback nickname
   */
  private generateContextualFallbackNickname(location: UnnamedLocation): string {
    const type = location.type || 'place';
    const associatedWith = location.associatedWith || [];
    
    // If associated with entities, include them in nickname
    if (associatedWith.length > 0) {
      const primaryAssoc = associatedWith[0];
      
      if (location.proximityTarget) {
        return `The ${type} ${location.proximity || 'near'} ${location.proximityTarget}`;
      }
      
      return `The ${type} by ${primaryAssoc}`;
    }
    
    // If event context, use it
    if (location.eventContext) {
      return `The ${type} where ${location.eventContext}`;
    }
    
    // Default
    return `The ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  }

  /**
   * Create location with generated nickname
   */
  async createLocationWithNickname(
    userId: string,
    location: LocationWithNickname
  ): Promise<{ id: string; name: string } | null> {
    try {
      // Check if location with this name already exists
      const { data: existing } = await supabaseAdmin
        .from('locations')
        .select('id, name')
        .eq('user_id', userId)
        .eq('name', location.name)
        .single();

      if (existing) {
        return existing;
      }

      // Find associated character IDs if provided
      let associatedCharacterIds: string[] = [];
      if (location.associatedWith && location.associatedWith.length > 0) {
        const { data: associatedChars } = await supabaseAdmin
          .from('characters')
          .select('id')
          .eq('user_id', userId)
          .in('name', location.associatedWith);
        
        if (associatedChars) {
          associatedCharacterIds = associatedChars.map(c => c.id);
        }
      }

      // Normalize name
      const normalizedName = location.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

      // Get embedding
      const { embeddingService } = await import('./embeddingService');
      const embedding = await embeddingService.embedText(location.name);

      const { data: newLocation, error } = await supabaseAdmin
        .from('locations')
        .insert({
          user_id: userId,
          name: location.name,
          normalized_name: normalizedName,
          type: location.type || null,
          is_nickname: location.isNickname ?? true,
          associated_character_ids: associatedCharacterIds,
          event_context: location.eventContext || null,
          proximity_target: location.proximityTarget || null,
          embedding: `[${embedding.join(',')}]`,
          importance_level: 'minor', // Will be calculated later
          importance_score: 0,
          metadata: {
            autoGenerated: true,
            fromNickname: location.isNickname,
            context: location.context,
            description: location.description
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id, name')
        .single();

      if (error) {
        logger.error({ error, location }, 'Failed to create location with nickname');
        return null;
      }

      // Calculate importance asynchronously
      const { locationImportanceService } = await import('./locationImportanceService');
      locationImportanceService.calculateImportance(userId, newLocation.id, {})
        .then(importance => {
          return locationImportanceService.updateLocationImportance(userId, newLocation.id, importance);
        })
        .catch(err => {
          logger.debug({ err, locationId: newLocation.id }, 'Failed to calculate initial location importance');
        });

      return newLocation;
    } catch (error) {
      logger.error({ error, location }, 'Failed to create location with nickname');
      return null;
    }
  }
}

export const locationNicknameService = new LocationNicknameService();
