import { v4 as uuid } from 'uuid';

import { config } from '../config';
import {
  isOpenAiCircuitOpen,
  isOpenAiCircuitOpenError,
} from '../lib/openaiCircuitBreaker';
import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { isLikelyPlaceName } from './lorebook/quality/placeCandidateGuard';

import { supabaseAdmin } from './supabaseClient';

import { openai } from './openaiClient';

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

const POSSESSIVE_NICKNAME = /^(?:[Tt]he\s+)?(.+?)[’']s\s+\S/;

/**
 * "The house was full of egirls", "brought the house down", "DJ in the house"
 * — "house" describing a venue's crowd/energy, not an actual residence. These
 * must not become house cards ("Egirl House").
 */
const FIGURATIVE_HOUSE =
  /\b(?:the\s+house\s+(?:was|is|been|being)\s+(?:full|packed|bumpin\w*|poppin\w*|jumpin\w*|lit|loud|live|crazy|wild)\b|(?:bring|bring(?:s|ing)?|brought)\s+(?:down\s+)?the\s+house\b|the\s+house\s+down\b|in\s+the\s+house\b)/i;

export function isFigurativeHouseReference(context: string | undefined, type: string | undefined): boolean {
  if (!context) return false;
  if (type && !/^(?:house|home|residence)$/i.test(type)) return false;
  return FIGURATIVE_HOUSE.test(context);
}

/**
 * A generated possessive label ("Genni's House") is only trustworthy when the
 * source text itself uses the possessive ("genni's ..."). A person who is
 * merely mentioned elsewhere in the same message is NOT the owner — the model
 * fabricates that link from proximity. Returns null when ownership was
 * fabricated so the caller can fall back to an owner-free label.
 */
export function validatePossessiveNickname(nickname: string, sourceText: string): string | null {
  const match = nickname.match(POSSESSIVE_NICKNAME);
  if (!match) return nickname;
  const owner = match[1].trim().toLowerCase().replace(/[’‘]/g, "'");
  if (!owner) return null;
  const source = sourceText.toLowerCase().replace(/[’‘]/g, "'");
  return source.includes(`${owner}'s`) || source.includes(`${owner}s'`) ? nickname : null;
}

class LocationNicknameService {
  /**
   * Detect unnamed locations from conversation and generate nicknames
   */
  async detectAndGenerateNicknames(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    options?: { suggestionsMode?: boolean }
  ): Promise<LocationWithNickname[]> {
    if (isOpenAiCircuitOpen()) {
      return [];
    }

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

IMPORTANT — skip these (they are NOT unnamed):
- Proper nouns and brand names (Costco, Golden Gate Park, Abuela's house)
- Possessive places ("Abuela's house", "Nick's apartment")
- Any place that already has a usable name in the message

Look for ONLY:
- References to places without names (e.g., "this park", "that restaurant", "the pizza shop" with no owner/brand)
- Generic place types with no anchor person or brand

Also skip FIGURATIVE place words: "the house was full/packed", "brought the house down", "in the house" — "house" there describes a venue's crowd or energy, not an actual house.

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
        // Figurative "house" (crowd/energy talk about a venue) is not a place.
        if (isFigurativeHouseReference(unnamedLoc.context ?? message, unnamedLoc.type)) {
          logger.debug({ context: unnamedLoc.context }, 'Skipped figurative house reference');
          continue;
        }

        // Check if this location already exists (by type/description match)
        const similarLocation = existingLocations?.find(loc => {
          const locSummary = (loc.summary || '').toLowerCase();
          const descMatch =
            unnamedLoc.description &&
            locSummary.includes(unnamedLoc.description.toLowerCase().slice(0, 40));
          return descMatch;
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
          message,
          options?.suggestionsMode
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
      if (isOpenAiCircuitOpenError(error)) {
        logger.debug('Skipping location nickname detection — OpenAI circuit open');
      } else {
        logger.warn({ error }, 'Failed to detect and generate location nicknames');
      }
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
    currentMessage?: string,
    suggestionsMode?: boolean
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
        temperature: suggestionsMode ? 0.3 : 0.8,
        messages: [
          {
            role: 'system',
            content: suggestionsMode
              ? `Generate a short place label for suggestions (2-4 words max).

Rules:
- Prefer anchor + type: "Abuela's House", "Friday Gym", "Neighborhood Bar"
- NEVER use long event sentences ("The bar where Andrew bought adioses")
- NEVER describe furniture or activities ("The couch at...")
- If proximityTarget or associatedWith gives a person/place name, use it in the label
- Generic types alone ("The Gym") are OK only when there is no named anchor
- NEVER invent ownership: only say "X's House" when the text itself says "X's house/place". A person mentioned elsewhere in the message does NOT own the place

Return only the label, no quotes.`
              : `Generate a unique, contextual nickname for an unnamed location based on its type, description, and relationships.

Guidelines:
- Keep it short (2-5 words). Prefer "Abuela's House" over "The house where I built Lorebook"
- Include relationship context when available (e.g., "Park by Nick's house")
- Avoid long event-based sentences
- If a proper name exists in the message, use that instead of inventing a nickname
- NEVER invent ownership: only say "X's house" when the text itself says "X's house"

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

      const sourceText = [
        location.context,
        location.description,
        location.eventContext,
        currentMessage,
        conversationContext,
      ]
        .filter(Boolean)
        .join('\n');
      if (nickname && !validatePossessiveNickname(nickname, sourceText)) {
        logger.info({ nickname }, 'Dropped fabricated possessive place nickname');
        nickname = '';
      }

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
    
    // If associated with entities, include them in the nickname — but only
    // when the mention context actually names them; associatedWith can carry
    // people from unrelated sentences in the same message.
    if (associatedWith.length > 0) {
      const contextLower = (location.context ?? '').toLowerCase();
      const primaryAssoc = associatedWith.find(
        (name) => name && contextLower.includes(name.toLowerCase())
      );

      if (location.proximityTarget && contextLower.includes(location.proximityTarget.toLowerCase())) {
        return `The ${type} ${location.proximity || 'near'} ${location.proximityTarget}`;
      }

      if (primaryAssoc) {
        return `The ${type} by ${primaryAssoc}`;
      }
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
      const normalizedName = normalizeNameKey(location.name);
      if (!normalizedName) return null;

      // Never persist a non-place span (activity narration, time phrase,
      // descriptive fragment, generic/abstract noun) as a location.
      if (!isLikelyPlaceName(location.name)) {
        logger.info({ userId, name: location.name }, 'Skipped non-place location candidate');
        return null;
      }

      const { data: existingByName } = await supabaseAdmin
        .from('locations')
        .select('id, name')
        .eq('user_id', userId)
        .eq('name', location.name)
        .maybeSingle();

      if (existingByName) {
        return existingByName;
      }

      const { data: existingByNorm } = await supabaseAdmin
        .from('locations')
        .select('id, name')
        .eq('user_id', userId)
        .eq('normalized_name', normalizedName)
        .maybeSingle();

      if (existingByNorm) {
        return existingByNorm;
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

      let embedding: number[] = [];
      try {
        const { embeddingService } = await import('./embeddingService');
        embedding = await embeddingService.embedText(location.name);
      } catch (embedErr) {
        logger.warn({ embedErr, name: location.name }, 'Embedding failed; creating location without vector');
      }

      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        name: location.name,
        normalized_name: normalizedName,
        type: location.type || null,
        is_nickname: location.isNickname ?? true,
        associated_character_ids: associatedCharacterIds,
        event_context: location.eventContext || null,
        proximity_target: location.proximityTarget || null,
        importance_level: 'minor',
        importance_score: 0,
        metadata: {
          autoGenerated: true,
          fromNickname: location.isNickname,
          context: location.context,
          description: location.description,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (embedding.length > 0) {
        insertPayload.embedding = `[${embedding.join(',')}]`;
      }

      const { data: newLocation, error } = await supabaseAdmin
        .from('locations')
        .insert(insertPayload)
        .select('id, name')
        .single();

      if (error) {
        if (error.code === '23505') {
          const { data: dup } = await supabaseAdmin
            .from('locations')
            .select('id, name')
            .eq('user_id', userId)
            .eq('normalized_name', normalizedName)
            .maybeSingle();
          if (dup) return dup;
        }
        logger.error({ error, location }, 'Failed to create location with nickname');
        return null;
      }

      const contextText = [location.name, location.context, location.description, location.eventContext]
        .filter(Boolean)
        .join(' ');
      const { placeEnrichmentService } = await import('./placeEnrichmentService');
      await placeEnrichmentService.enrichFromText(userId, newLocation.id, contextText).catch(() => {});

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
