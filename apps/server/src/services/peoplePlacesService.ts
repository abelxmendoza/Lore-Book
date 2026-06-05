import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import { openai } from '../lib/openai';
import type {
  EntryRelationship,
  MemoryEntry,
  PeoplePlaceEntity,
  PeoplePlacesStats,
  RelationshipTag
} from '../types';

import { supabaseAdmin } from './supabaseClient';

const relationshipTags: RelationshipTag[] = ['friend', 'family', 'coach', 'romantic', 'professional', 'other'];

// ─── Types ───────────────────────────────────────────────────────────────────

type EntityType = 'person' | 'place' | 'organization' | 'platform';

type DetectedEntity = {
  name: string;
  type: EntityType;
  corrected_names?: string[];
};

// ─── Hard blocklist ───────────────────────────────────────────────────────────
// Any token that matches this set (case-insensitive) is never stored as an entity.
// Covers: pronouns, sentence connectors, gerunds, temporal words, app-specific terms.

const ENTITY_BLOCKLIST = new Set([
  // Pronouns
  'i', 'me', 'my', 'mine', 'myself',
  'you', 'your', 'yours', 'yourself',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'they', 'them', 'their', 'theirs', 'themselves',
  // App-specific false positives (single and multi-word)
  'user', 'app', 'lore', 'lorebook', 'lore books', 'lore book', 'system',
  'chat', 'bot', 'ai', 'gpt', 'assistant', 'memory', 'note', 'entry', 'journal',
  // Sentence-transition words
  'meanwhile', 'however', 'therefore', 'furthermore', 'additionally',
  'moreover', 'nevertheless', 'nonetheless', 'consequently', 'subsequently',
  'although', 'despite', 'because', 'since', 'unless', 'until', 'while',
  'during', 'after', 'before', 'between', 'among', 'through', 'throughout',
  'also', 'too', 'well', 'just', 'here', 'there', 'then', 'next',
  'first', 'second', 'third', 'finally', 'again', 'instead', 'otherwise',
  'actually', 'basically', 'honestly', 'literally', 'seriously', 'probably',
  'hopefully', 'apparently', 'unfortunately', 'luckily', 'especially',
  // Gerunds / present participles (capitalized when sentence-starting)
  'hoping', 'having', 'being', 'doing', 'going', 'coming', 'getting',
  'making', 'taking', 'using', 'looking', 'thinking', 'feeling', 'trying',
  'seeing', 'knowing', 'working', 'saying', 'asking', 'keeping', 'starting',
  'building', 'running', 'helping', 'moving', 'leaving', 'staying', 'giving',
  'waiting', 'wanting', 'needing', 'bringing', 'finding', 'sending',
  'testing', 'checking', 'watching', 'talking', 'telling', 'showing',
  'heading', 'planning', 'wondering', 'realizing', 'understanding',
  // Temporal
  'today', 'yesterday', 'tomorrow', 'now', 'then', 'later', 'soon',
  'recently', 'currently', 'already', 'still', 'always', 'never', 'often',
  'lately', 'once', 'twice', 'daily', 'weekly', 'monthly', 'annually',
  // Common words that slip through
  'way', 'things', 'stuff', 'something', 'anything', 'everything', 'nothing',
  'someone', 'anyone', 'everyone', 'nobody', 'somebody', 'anybody',
  'highlight', 'message', 'reason', 'update', 'change', 'news', 'story',
  'type', 'kind', 'sort', 'part', 'side', 'point', 'fact', 'idea',
  'night', 'morning', 'evening', 'afternoon', 'week', 'month', 'year',
  'summer', 'winter', 'spring', 'fall', 'season',
]);

// ─── Known organizations and platforms ───────────────────────────────────────
// Names that should be typed as 'organization' or 'platform', never 'person'.

const KNOWN_ORGANIZATIONS = new Map<string, EntityType>([
  // Tech / platforms
  ['instagram', 'platform'],
  ['twitter', 'platform'],
  ['facebook', 'platform'],
  ['tiktok', 'platform'],
  ['youtube', 'platform'],
  ['snapchat', 'platform'],
  ['linkedin', 'platform'],
  ['discord', 'platform'],
  ['spotify', 'platform'],
  ['reddit', 'platform'],
  ['pinterest', 'platform'],
  ['whatsapp', 'platform'],
  // Tech companies
  ['google', 'organization'],
  ['apple', 'organization'],
  ['amazon', 'organization'],
  ['microsoft', 'organization'],
  ['netflix', 'organization'],
  ['uber', 'organization'],
  ['lyft', 'organization'],
  ['meta', 'organization'],
  ['openai', 'organization'],
  ['anthropic', 'organization'],
  // Retailers / services
  ['costco', 'organization'],
  ['walmart', 'organization'],
  ['target', 'organization'],
  ['starbucks', 'organization'],
  ['mcdonalds', 'organization'],
  ['chipotle', 'organization'],
  ['amazon', 'organization'],
  ['doordash', 'organization'],
  ['grubhub', 'organization'],
  ['instacart', 'organization'],
  // Companies / employers
  ['epirus', 'organization'],
  ['palantir', 'organization'],
  ['lockheed', 'organization'],
  ['raytheon', 'organization'],
  ['spacex', 'organization'],
  ['tesla', 'organization'],
  ['boeing', 'organization'],
  // Sports / entertainment
  ['ufc', 'organization'],
  ['nba', 'organization'],
  ['nfl', 'organization'],
  ['mlb', 'organization'],
]);

// Well-known cities and regions — always typed as 'place'.
const KNOWN_CITIES = new Set([
  'anaheim', 'los angeles', 'new york', 'chicago', 'houston', 'phoenix',
  'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
  'austin', 'seattle', 'denver', 'nashville', 'boston', 'las vegas',
  'portland', 'sacramento', 'oakland', 'fresno', 'long beach', 'bakersfield',
  'atlanta', 'miami', 'tampa', 'orlando', 'raleigh', 'charlotte', 'detroit',
  'minneapolis', 'cleveland', 'columbus', 'indianapolis', 'san francisco',
  'brooklyn', 'manhattan', 'bronx', 'queens', 'chicago', 'new orleans',
  'baltimore', 'memphis', 'louisville', 'richmond', 'virginia beach',
  'california', 'texas', 'florida', 'nevada', 'arizona', 'colorado',
  'washington', 'oregon', 'georgia', 'carolina', 'mexico', 'canada',
]);

// Location-type suffixes — if an entity ends with one of these words, it's a place.
const LOCATION_SUFFIXES = [
  'house', 'home', 'apartment', 'apt', 'room', 'place', 'park', 'street',
  'avenue', 'ave', 'road', 'blvd', 'boulevard', 'lane', 'drive', 'court',
  'gym', 'studio', 'cafe', 'restaurant', 'bar', 'club', 'school', 'hospital',
  'mall', 'store', 'shop', 'market', 'station', 'office', 'library', 'museum',
  'beach', 'mountain', 'lake', 'river', 'center', 'centre', 'stadium', 'arena',
  'university', 'college', 'campus', 'building', 'tower', 'complex',
];

class PeoplePlacesService {
  private normalizeName(name: string) {
    return name.trim();
  }

  // Returns true if this token should never be stored as an entity.
  private isBlocked(name: string): boolean {
    const lower = name.toLowerCase().trim();
    if (ENTITY_BLOCKLIST.has(lower)) return true;
    // Single-character tokens
    if (lower.length <= 1) return true;
    // Pure gerunds/present participles (ends in -ing, single word, not a known name)
    if (/^[a-z]+ing$/.test(lower) && lower.length <= 12) return true;
    // Pure numbers or punctuation
    if (/^\d+$/.test(lower)) return true;
    return false;
  }

  // Infer entity type from name and context.
  private inferType(name: string, context?: string): EntityType {
    const lower = name.toLowerCase();

    // Known org/platform override (highest priority)
    const knownType = KNOWN_ORGANIZATIONS.get(lower);
    if (knownType) return knownType;

    // Known city/region
    if (KNOWN_CITIES.has(lower)) return 'place';

    // Possessive location pattern: "Abuela's House" → place
    // Only applies when the name itself ends with "House", "Park" etc.
    // "Abuela" alone does NOT match — the possessive is on the modifying word.
    const lastWord = lower.split(/\s+/).pop() ?? '';
    if (LOCATION_SUFFIXES.includes(lastWord)) return 'place';

    // Multi-word possessive location like "John's Cafe" → the suffix check above
    // catches the final word. No further possessive heuristic needed here.

    // Context clue: only use unambiguous prepositions ("in", "at") and require
    // the name to appear immediately after without a possessive ('s).
    // "in Anaheim" → place, but NOT "by Sol's actions" or "at Abuela's house"
    // (those are people referenced via possessive, not location names).
    if (context && name.length >= 4) {
      const ctxLower = context.toLowerCase();
      // Regex: preposition + whitespace + name + word boundary, NOT followed by 's
      const placePattern = new RegExp(`\\b(?:in|at)\\s+${lower}(?!['']s)\\b`, 'i');
      if (placePattern.test(ctxLower)) {
        return 'place';
      }
    }

    return 'person';
  }

  private fallbackDetect(content: string): DetectedEntity[] {
    const entities: DetectedEntity[] = [];
    const seen = new Set<string>();

    // ── Multi-word names (most specific — run first) ─────────────────────────
    // Matches "First Last", "First Middle Last", org names like "New York"
    const multiWordPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = multiWordPattern.exec(content)) !== null) {
      const candidate = match[1].trim();
      if (candidate.length < 4) continue;
      if (this.isBlocked(candidate)) continue;
      seen.add(candidate);
      entities.push({
        name: candidate,
        type: this.inferType(candidate, content),
      });
    }

    // ── Single capitalized words ──────────────────────────────────────────────
    // Only add if not already covered by a multi-word entity above.
    const singleWordPattern = /\b([A-Z][a-z]{2,})\b/g;
    while ((match = singleWordPattern.exec(content)) !== null) {
      const word = match[1];
      if (this.isBlocked(word)) continue;
      // Skip if this word is a component of an already-captured multi-word entity
      if ([...seen].some(existing => existing.split(' ').includes(word))) continue;
      if (this.isCommonWord(word.toLowerCase())) continue;
      seen.add(word);
      entities.push({
        name: word,
        type: this.inferType(word, content),
      });
    }

    // ── Known lowercase brands (Costco, Instagram, etc.) ─────────────────────
    // These appear in casual text without capitalization.
    for (const [brand, type] of KNOWN_ORGANIZATIONS) {
      const regex = new RegExp(`\\b${brand}\\b`, 'gi');
      if (regex.test(content)) {
        const canonical = brand.charAt(0).toUpperCase() + brand.slice(1);
        if (!seen.has(canonical) && ![...seen].some(s => s.toLowerCase() === brand)) {
          seen.add(canonical);
          entities.push({ name: canonical, type });
        }
      }
    }

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
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
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
    relationshipTags.forEach((tag) => { base[tag] = existing?.[tag] ?? 0; });
    if (next) base[next] = (base[next] ?? 0) + 1;
    return base;
  }

  private async detectEntities(content: string): Promise<DetectedEntity[]> {
    const ruleBasedEntities = this.fallbackDetect(content);
    if (ruleBasedEntities.length > 0) {
      return ruleBasedEntities.map(entity => ({
        name: this.normalizeName(entity.name),
        type: entity.type,
        corrected_names: [],
      }));
    }

    // LLM fallback only when rule-based finds nothing
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract named people, locations, and organizations. Return JSON {"entities":[{"name":"...","type":"person|place|organization|platform"}]}. Exclude pronouns, common words, and app/meta references.',
          },
          { role: 'user', content },
        ],
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
      return entities
        .filter((item: DetectedEntity) => Boolean(item?.name) && !this.isBlocked(item.name))
        .map((item: DetectedEntity) => ({
          name: this.normalizeName(item.name),
          type: item.type ?? 'person',
          corrected_names: [],
        }));
    } catch (error) {
      logger.warn({ error }, 'LLM entity detection failed, using rule-based only');
      return ruleBasedEntities.map(entity => ({
        name: this.normalizeName(entity.name),
        type: entity.type,
        corrected_names: [],
      }));
    }
  }

  /**
   * Find an existing entity by name, with canonicalization:
   *
   * 1. Exact case-insensitive match
   * 2. Alias match (corrected_names array)
   * 3. Fragment resolution — if we're inserting "Abel" and "Abel Mendoza" exists,
   *    return "Abel Mendoza" so the fragment is absorbed as an alias.
   * 4. Longer-name resolution — if we're inserting "Abel Mendoza" and "Abel" exists,
   *    return "Abel" so its canonical name can be promoted.
   */
  private async findEntity(userId: string, name: string): Promise<PeoplePlaceEntity | null> {
    const normalized = this.normalizeName(name);

    // 1. Exact match
    const { data: byName } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', normalized)
      .limit(1);
    if (byName?.[0]) return byName[0] as PeoplePlaceEntity;

    // 2. Alias match
    const { data: byAlias } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .eq('user_id', userId)
      .contains('corrected_names', [normalized])
      .limit(1);
    if (byAlias?.[0]) return byAlias[0] as PeoplePlaceEntity;

    const words = normalized.split(/\s+/).filter(w => w.length > 1);

    // 3. Fragment → canonical: "Abel" inserted, "Abel Mendoza" exists
    //    Look for existing entities whose name CONTAINS the new name as a word.
    if (words.length === 1) {
      const { data: broader } = await supabaseAdmin
        .from('people_places')
        .select('*')
        .eq('user_id', userId)
        .or(`name.ilike.${normalized} %,name.ilike.% ${normalized}`)
        .limit(5);
      if (broader?.length) {
        // Return the longest match (most specific canonical name)
        return (broader as PeoplePlaceEntity[]).sort((a, b) => b.name.length - a.name.length)[0];
      }
    }

    // 4. Canonical expansion: "Abel Mendoza" inserted, "Abel" exists
    //    Each word of the new name might be a shorter existing entity.
    if (words.length > 1) {
      for (const word of words) {
        if (word.length < 3) continue;
        const { data: fragment } = await supabaseAdmin
          .from('people_places')
          .select('*')
          .eq('user_id', userId)
          .ilike('name', word)
          .limit(1);
        if (fragment?.[0]) return fragment[0] as PeoplePlaceEntity;
      }
    }

    return null;
  }

  private buildEntityPayload(
    entry: MemoryEntry,
    detected: DetectedEntity,
    existing: PeoplePlaceEntity | null,
    relationships?: EntryRelationship[]
  ): PeoplePlaceEntity {
    const relationship = this.extractRelationshipForName(detected.name, relationships);
    const correctedNames = new Set<string>([
      ...(existing?.corrected_names ?? []),
      ...(detected.corrected_names ?? []),
    ]);
    const relatedEntries = new Set<string>([...(existing?.related_entries ?? []), entry.id]);

    // Promote canonical name to the longer/more specific form.
    // If existing is "Abel" and we're inserting "Abel Mendoza", upgrade to "Abel Mendoza".
    let canonicalName = existing?.name ?? detected.name;
    if (existing && detected.name.length > existing.name.length) {
      const detectedLower = detected.name.toLowerCase();
      const existingLower = existing.name.toLowerCase();
      if (detectedLower.includes(existingLower) || existingLower.includes(detectedLower)) {
        correctedNames.add(existing.name); // store old name as alias
        canonicalName = detected.name;     // promote to longer name
      }
    } else if (existing && detected.name !== existing.name) {
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
      name: canonicalName,
      type: detected.type,
      first_mentioned_at: firstMention,
      last_mentioned_at: entry.date,
      total_mentions: (existing?.total_mentions ?? 0) + 1,
      related_entries: Array.from(relatedEntries),
      corrected_names: Array.from(correctedNames),
      relationship_counts: this.mergeRelationshipCounts(existing?.relationship_counts, relationship),
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
        logger.error({ error, name: entity.name }, 'Failed to upsert entity');
      }
    }
  }

  async listEntities(userId: string, type?: string): Promise<PeoplePlaceEntity[]> {
    try {
      let query = supabaseAdmin.from('people_places').select('*').eq('user_id', userId);
      if (type) query = query.eq('type', type);
      const { data, error } = await query.order('last_mentioned_at', { ascending: false });
      if (error) {
        const isTableMissing = (error as any).code === 'PGRST205' || (error as any).message?.includes('schema cache');
        if (isTableMissing) return [];
        logger.error({ error }, 'Failed to list people_places');
        throw error;
      }
      return (data as PeoplePlaceEntity[]) ?? [];
    } catch (err) {
      if ((err as any)?.code === 'PGRST205') return [];
      throw err;
    }
  }

  async getEntity(userId: string, id: string): Promise<PeoplePlaceEntity | null> {
    const { data, error } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .single();
    if (error) {
      logger.error({ error }, 'Failed to fetch entity');
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
      logger.error({ error }, 'Failed to add alias');
      throw error;
    }
    return data as PeoplePlaceEntity;
  }

  async getStats(userId: string): Promise<PeoplePlacesStats> {
    const entities = await this.listEntities(userId);
    const mostMentioned = [...entities]
      .sort((a, b) => b.total_mentions - a.total_mentions)
      .slice(0, 5)
      .map((e) => ({ id: e.id, name: e.name, total_mentions: e.total_mentions, type: e.type }));

    const topRelationships = entities.reduce<Partial<Record<RelationshipTag, number>>>((acc, entity) => {
      relationshipTags.forEach((tag) => { acc[tag] = (acc[tag] ?? 0) + (entity.relationship_counts?.[tag] ?? 0); });
      return acc;
    }, {});

    return {
      total: entities.length,
      people: entities.filter((e) => e.type === 'person').length,
      places: entities.filter((e) => e.type === 'place').length,
      mostMentioned,
      topRelationships,
    };
  }
}

export const peoplePlacesService = new PeoplePlacesService();
