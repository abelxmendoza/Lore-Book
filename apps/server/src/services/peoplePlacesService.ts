import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import type {
  EntryRelationship,
  MemoryEntry,
  PeoplePlaceEntity,
  PeoplePlacesStats,
  RelationshipTag
} from '../types';

import { supabaseAdmin } from './supabaseClient';

const relationshipTags: RelationshipTag[] = ['friend', 'family', 'coach', 'romantic', 'professional', 'other'];

type DetectedEntity = {
  name: string;
  type: 'person' | 'place';
  corrected_names?: string[];
};

class PeoplePlacesService {
  private openai = new OpenAI({ apiKey: config.openAiKey });

  private normalizeName(name: string) {
    return name.trim();
  }

  private fallbackDetect(content: string): DetectedEntity[] {
    const candidates = new Set<string>();
    
    // Enhanced pattern matching for names (first name + last name)
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let match;
    while ((match = namePattern.exec(content)) !== null) {
      const candidate = match[1];
      if (candidate.length >= 3 && candidate.split(' ').length >= 2) {
        candidates.add(candidate.trim());
      }
    }

    // Single capitalized words (might be names or places)
    const singleWordPattern = /\b([A-Z][a-z]{2,})\b/g;
    const singleWords = new Set<string>();
    while ((match = singleWordPattern.exec(content)) !== null) {
      const word = match[1];
      // Exclude common words
      if (!this.isCommonWord(word.toLowerCase()) && word.length >= 3) {
        singleWords.add(word);
      }
    }

    // Place detection patterns
    const placePatterns = [
      /\b(in|at|from|to|near|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, // "in Seattle", "at New York"
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g, // "Seattle, WA"
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Street|Avenue|Road|Boulevard|Drive|Lane|Way|Court|Place|Park|Beach|Mountain|Lake|River)\b/gi,
    ];

    const placeHints = ['park', 'city', 'town', 'cafe', 'restaurant', 'gym', 'school', 'office', 'street', 'road', 'avenue', 'beach', 'mountain', 'lake', 'river', 'airport', 'hotel', 'hospital', 'store', 'mall', 'library', 'museum'];
    const placeKeywords = new Set<string>();

    for (const pattern of placePatterns) {
      while ((match = pattern.exec(content)) !== null) {
        const place = match[2] || match[1];
        if (place && place.length >= 3) {
          placeKeywords.add(place.trim());
        }
      }
    }

    const entities: DetectedEntity[] = [];

    // Add full names as persons
    candidates.forEach(name => {
      entities.push({ name, type: 'person' });
    });

    // Add single words - check if they're places or persons
    singleWords.forEach(word => {
      const lower = word.toLowerCase();
      const isPlace = placeHints.some(hint => lower.includes(hint)) || 
                     placeKeywords.has(word) ||
                     lower.includes('street') || lower.includes('avenue') || lower.includes('road');
      entities.push({ 
        name: word, 
        type: isPlace ? 'place' : 'person' 
      });
    });

    // Add detected places
    placeKeywords.forEach(place => {
      if (!entities.some(e => e.name === place)) {
        entities.push({ name: place, type: 'place' });
      }
    });

    return entities;
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
      'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'let', 'put', 'say', 'she', 'too', 'use', 'this', 'that', 'with',
      'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make',
      'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'what', 'when', 'will', 'your', 'about', 'after', 'again', 'before', 'being',
      'below', 'between', 'during', 'first', 'found', 'great', 'group', 'house', 'large', 'learn', 'never', 'other', 'place', 'plant', 'point', 'right',
      'small', 'sound', 'spell', 'still', 'study', 'their', 'there', 'these', 'thing', 'think', 'three', 'water', 'where', 'which', 'world', 'would', 'write',
      'today', 'yesterday', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
    ];
    return commonWords.includes(word.toLowerCase());
  }

  private extractRelationshipForName(name: string, relationships?: EntryRelationship[]): RelationshipTag | undefined {
    if (!relationships?.length) return undefined;
    const normalized = name.toLowerCase();
    const relationship = relationships.find((rel) => rel.name.toLowerCase() === normalized);
    return relationship?.tag;
  }

  private mergeRelationshipCounts(
    existing?: Partial<Record<RelationshipTag, number>>,
    next?: RelationshipTag
  ): Partial<Record<RelationshipTag, number>> {
    const base: Partial<Record<RelationshipTag, number>> = {};
    relationshipTags.forEach((tag) => {
      base[tag] = existing?.[tag] ?? 0;
    });

    if (next) {
      base[next] = (base[next] ?? 0) + 1;
    }

    return base;
  }

  private async detectEntities(content: string): Promise<DetectedEntity[]> {
    // Use rule-based detection first (FREE - no API call)
    // Only use API if rule-based fails or user explicitly requests enhanced detection
    const ruleBasedEntities = this.fallbackDetect(content);
    
    // If we found entities with rule-based, use them
    if (ruleBasedEntities.length > 0) {
      return ruleBasedEntities.map(entity => ({
        name: this.normalizeName(entity.name),
        type: entity.type,
        corrected_names: []
      }));
    }

    // Fallback to API only if rule-based found nothing (optional enhancement)
    // This can be disabled entirely if you want 100% free
    try {
      const completion = await this.openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract all named people and locations. Return JSON {"entities":[{"name":"...","type":"person|place","corrected_names":["alias1",...] }]}. Keep names as they appear. Add corrected_names for misspellings or aliases when obvious.'
          },
          { role: 'user', content }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
      return entities
        .filter((item: DetectedEntity) => Boolean(item?.name) && (item.type === 'person' || item.type === 'place'))
        .map((item: DetectedEntity) => ({
          name: this.normalizeName(item.name),
          type: item.type,
          corrected_names: Array.isArray(item.corrected_names)
            ? item.corrected_names.map((alias) => this.normalizeName(alias))
            : []
        }));
    } catch (error) {
      logger.warn({ error }, 'API detection failed, using rule-based only');
      return ruleBasedEntities.map(entity => ({
        name: this.normalizeName(entity.name),
        type: entity.type,
        corrected_names: []
      }));
    }
  }

  private async findEntity(userId: string, name: string): Promise<PeoplePlaceEntity | null> {
    const normalized = this.normalizeName(name);
    const { data: byName, error: nameError } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', normalized)
      .limit(1);

    if (nameError) {
      logger.error({ nameError }, 'Failed to lookup people_places by name');
      throw nameError;
    }

    if (byName?.[0]) return byName[0] as PeoplePlaceEntity;

    const { data: byAlias, error: aliasError } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .eq('user_id', userId)
      .contains('corrected_names', [normalized])
      .limit(1);

    if (aliasError) {
      logger.error({ aliasError }, 'Failed to lookup people_places by alias');
      throw aliasError;
    }

    return (byAlias?.[0] as PeoplePlaceEntity | undefined) ?? null;
  }

  private buildEntityPayload(
    entry: MemoryEntry,
    detected: DetectedEntity,
    existing: PeoplePlaceEntity | null,
    relationships?: EntryRelationship[]
  ): PeoplePlaceEntity {
    const relationship = this.extractRelationshipForName(detected.name, relationships);
    const correctedNames = new Set<string>([...(existing?.corrected_names ?? []), ...(detected.corrected_names ?? [])]);
    const relatedEntries = new Set<string>([...(existing?.related_entries ?? []), entry.id]);

    if (existing && detected.name !== existing.name) {
      correctedNames.add(detected.name);
    }

    const firstMention = existing
      ? new Date(existing.first_mentioned_at) < new Date(entry.date)
        ? existing.first_mentioned_at
        : entry.date
      : entry.date;

    return {
      id: existing?.id ?? uuid(),
      user_id: entry.user_id,
      name: existing?.name ?? detected.name,
      type: detected.type,
      first_mentioned_at: firstMention,
      last_mentioned_at: entry.date,
      total_mentions: (existing?.total_mentions ?? 0) + 1,
      related_entries: Array.from(relatedEntries),
      corrected_names: Array.from(correctedNames),
      relationship_counts: this.mergeRelationshipCounts(existing?.relationship_counts, relationship)
    };
  }

  async recordEntitiesForEntry(entry: MemoryEntry, relationships?: EntryRelationship[]) {
    const fromMetadata = (entry.metadata as { relationships?: EntryRelationship[] } | undefined)?.relationships;
    const normalizedRelationships = relationships ?? fromMetadata ?? [];
    const detected = await this.detectEntities(entry.content);

    for (const entity of detected) {
      const existing = await this.findEntity(entry.user_id, entity.name);
      const payload = this.buildEntityPayload(entry, entity, existing, normalizedRelationships);
      const { error } = await supabaseAdmin.from('people_places').upsert(payload);
      if (error) {
        logger.error({ error, payload }, 'Failed to upsert people/place entity');
      }
    }
  }

  async listEntities(userId: string, type?: 'person' | 'place'): Promise<PeoplePlaceEntity[]> {
    let query = supabaseAdmin.from('people_places').select('*').eq('user_id', userId);
    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query.order('last_mentioned_at', { ascending: false });
    if (error) {
      logger.error({ error }, 'Failed to list people_places');
      throw error;
    }

    return (data as PeoplePlaceEntity[]) ?? [];
  }

  async getEntity(userId: string, id: string): Promise<PeoplePlaceEntity | null> {
    const { data, error } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .single();

    if (error) {
      logger.error({ error }, 'Failed to fetch people_places detail');
      return null;
    }

    return data as PeoplePlaceEntity;
  }

  async addAlias(userId: string, id: string, alias: string): Promise<PeoplePlaceEntity | null> {
    const existing = await this.getEntity(userId, id);
    if (!existing) return null;

    const correctedNames = new Set<string>([...(existing.corrected_names ?? []), this.normalizeName(alias)]);
    const { data, error } = await supabaseAdmin
      .from('people_places')
      .update({ corrected_names: Array.from(correctedNames) })
      .eq('user_id', userId)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      logger.error({ error }, 'Failed to append alias to people_places');
      throw error;
    }

    return data as PeoplePlaceEntity;
  }

  async getStats(userId: string): Promise<PeoplePlacesStats> {
    const entities = await this.listEntities(userId);
    const mostMentioned = [...entities]
      .sort((a, b) => b.total_mentions - a.total_mentions)
      .slice(0, 5)
      .map((entity) => ({ id: entity.id, name: entity.name, total_mentions: entity.total_mentions, type: entity.type }));

    const topRelationships = entities.reduce<Partial<Record<RelationshipTag, number>>>((acc, entity) => {
      relationshipTags.forEach((tag) => {
        const current = entity.relationship_counts?.[tag] ?? 0;
        acc[tag] = (acc[tag] ?? 0) + current;
      });
      return acc;
    }, {});

    return {
      total: entities.length,
      people: entities.filter((entity) => entity.type === 'person').length,
      places: entities.filter((entity) => entity.type === 'place').length,
      mostMentioned,
      topRelationships
    };
  }
}

export const peoplePlacesService = new PeoplePlacesService();
