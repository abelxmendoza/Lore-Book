/**
 * Entity Facts Service
 *
 * Unified knowledge extraction for characters, organizations, and locations.
 * Facts are stored in the entity_facts table keyed by (entity_id, entity_type).
 *
 * Each entity type has its own extraction prompt and category vocabulary,
 * but shares identical dedup, confidence, and correction-tracking logic.
 *
 * Cross-entity queries are possible because all facts live in one table.
 */

import { logger } from '../logger';
import { openai } from '../lib/openai';
import { supabaseAdmin } from './supabaseClient';

export type EntityType = 'character' | 'organization' | 'location';

export type FactStatus = 'active' | 'updated' | 'corrected' | 'contradicted';

// Per-entity category vocabularies
export type CharacterCategory =
  | 'personality' | 'appearance' | 'relationship' | 'history'
  | 'career' | 'location' | 'goals' | 'general';

export type OrgCategory =
  | 'role' | 'purpose' | 'dynamics' | 'people' | 'status' | 'history' | 'general';

export type LocationCategory =
  | 'experience' | 'association' | 'pattern' | 'sentiment' | 'practical' | 'general';

export type FactCategory = CharacterCategory | OrgCategory | LocationCategory;

export interface EntityFact {
  id: string;
  user_id: string;
  entity_id: string;
  entity_type: EntityType;
  fact: string;
  category: FactCategory;
  confidence: number;
  mention_count: number;
  status: FactStatus;
  previous_value: string | null;
  first_seen_at: string;
  last_confirmed_at: string;
  created_at: string;
  updated_at: string;
}

interface ExtractedFact {
  fact: string;
  category: string;
  confidence: number;
  contradicts?: string;
}

// ── Extraction prompts per entity type ────────────────────────────────────────

const EXTRACTION_PROMPTS: Record<EntityType, (name: string) => string> = {
  character: (name) =>
    `You extract factual claims about a specific person from conversation text.

Return JSON: { "facts": [ { "fact": "...", "category": "...", "confidence": 0.0-1.0, "contradicts": "..." } ] }

Category options: personality, appearance, relationship, history, career, location, goals, general

Rules:
- Only extract facts explicitly stated about "${name}" — not facts about the narrator's own life
- The person's relationship TO the narrator IS a fact about them (category: relationship):
  "my old college roommate" → "Is the narrator's old college roommate"
  "my sister" → "Is the narrator's sister"
- Write facts as short declarative sentences: "Works as a nurse", "Lives in Chicago"
- confidence: 0.9 = directly stated, 0.7 = clearly implied, 0.5 = speculative
- contradicts: old fact text if this contradicts something known (otherwise omit)
- Skip vague or generic facts. Max 6 facts. Return { "facts": [] } if none.`,

  organization: (name) =>
    `You extract factual claims about a specific group or organization from conversation text.

Return JSON: { "facts": [ { "fact": "...", "category": "...", "confidence": 0.0-1.0, "contradicts": "..." } ] }

Category options:
- role: the narrator's position or relationship to the group ("founding member", "left in 2024")
- purpose: what the group is or does ("a design networking org", "CrossFit gym")
- dynamics: how the group behaves or feels internally ("got competitive after the leadership change")
- people: who else in the narrator's life is in this group
- status: current state of involvement ("active", "left", "complicated")
- history: how/when the narrator got involved
- general: anything else factual

Rules:
- Only extract facts about "${name}" — not the narrator's unrelated life
- Write facts as short declarative sentences from the narrator's perspective
- confidence: 0.9 = directly stated, 0.7 = implied, 0.5 = speculative
- contradicts: old fact text if this contradicts something (otherwise omit)
- Skip vague facts. Max 6 facts. Return { "facts": [] } if none.`,

  location: (name) =>
    `You extract factual claims about a specific place from conversation text.

Return JSON: { "facts": [ { "fact": "...", "category": "...", "confidence": 0.0-1.0, "contradicts": "..." } ] }

Category options:
- experience: what happened there ("where the breakup conversation happened", "first date spot")
- association: who the narrator usually encounters there ("goes there with Jordan")
- pattern: when/how often the narrator visits ("every Tuesday", "used to go weekly")
- sentiment: emotional association ("avoids this place now", "positive memories here")
- practical: useful context ("open late", "15 min from home", "the one on Main St")
- general: anything else factual

Rules:
- Only extract facts about "${name}" as a place in the narrator's life
- Write facts as short declarative sentences
- confidence: 0.9 = directly stated, 0.7 = implied, 0.5 = speculative
- contradicts: old fact text if this contradicts something (otherwise omit)
- Skip vague facts. Max 6 facts. Return { "facts": [] } if none.`,
};

// ── Category display labels per entity type ────────────────────────────────────

export const CATEGORY_LABELS: Record<EntityType, Record<string, string>> = {
  character: {
    personality: 'Personality', appearance: 'Appearance', relationship: 'Relationship',
    history: 'History', career: 'Career', location: 'Location', goals: 'Goals', general: 'General',
  },
  organization: {
    role: 'Your Role', purpose: 'Purpose', dynamics: 'Dynamics',
    people: 'People', status: 'Status', history: 'History', general: 'General',
  },
  location: {
    experience: 'Experiences', association: 'Associations', pattern: 'Patterns',
    sentiment: 'Sentiment', practical: 'Practical', general: 'General',
  },
};

// ── Service ───────────────────────────────────────────────────────────────────

class EntityFactsService {
  /**
   * Extract facts about an entity from conversation text and persist them.
   * Fire-and-forget safe — all errors are caught and logged.
   */
  async extractAndPersistFacts(
    userId: string,
    entityId: string,
    entityType: EntityType,
    entityName: string,
    conversationText: string
  ): Promise<void> {
    if (!conversationText.trim()) return;

    let extracted: ExtractedFact[] = [];
    try {
      extracted = await this.extractFacts(entityType, entityName, conversationText);
    } catch (err) {
      logger.warn({ err, entityName, entityType }, 'Entity fact extraction failed (non-blocking)');
      return;
    }

    if (extracted.length === 0) return;

    const { data: existingRows } = await supabaseAdmin
      .from('entity_facts')
      .select('id, fact, category, confidence, mention_count, status, previous_value')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .eq('status', 'active');

    const existing = (existingRows ?? []) as EntityFact[];

    for (const incoming of extracted) {
      await this.upsertFact(userId, entityId, entityType, incoming, existing);
    }

    // Facts carry classification signal — use them to upgrade chat-promoted
    // characters from "mentioned" to a categorized archetype so they appear
    // under the right tab in the Characters Book. Scan ALL categories AND the
    // raw utterance: LLM extraction doesn't reliably surface "my old college
    // roommate" as a fact, but the user's own words always contain it.
    if (entityType === 'character') {
      this.classifyCharacterFromFacts(userId, entityId, entityName, extracted, conversationText).catch(err =>
        logger.warn({ err, entityId }, 'Character classification from facts failed (non-blocking)')
      );
    }
  }

  /**
   * Sentences that talk about this person: any sentence naming them, plus the
   * sentence right after (pronoun continuation: "Had coffee with Maya. She's
   * my old college roommate.").
   */
  private sentencesAbout(text: string, entityName: string): string {
    const firstName = entityName.split(/\s+/)[0].toLowerCase();
    const sentences = text.split(/(?<=[.!?])\s+/);
    const picked: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].toLowerCase().includes(firstName)) {
        picked.push(sentences[i]);
        if (i + 1 < sentences.length) picked.push(sentences[i + 1]);
      }
    }
    return picked.join(' ');
  }

  /**
   * Infer archetype + relationship metadata from extracted facts plus the
   * entity-relevant sentences of the raw utterance.
   * Only fills fields that are currently empty — never overwrites manual edits.
   */
  private async classifyCharacterFromFacts(
    userId: string,
    characterId: string,
    entityName: string,
    facts: ExtractedFact[],
    conversationText: string
  ): Promise<void> {
    const factText = facts.map(f => f.fact.toLowerCase()).join(' ');
    const utteranceText = this.sentencesAbout(conversationText, entityName).toLowerCase();
    const text = `${factText} ${utteranceText}`;

    const ARCHETYPE_RULES: Array<{ archetype: string; relType: string; keywords: string[] }> = [
      { archetype: 'family',       relType: 'family',       keywords: ['mom', 'mother', 'dad', 'father', 'sister', 'brother', 'sibling', 'cousin', 'aunt', 'uncle', 'grandma', 'grandmother', 'grandpa', 'grandfather', 'abuela', 'abuelo', 'daughter', 'son', 'wife', 'husband', 'family'] },
      // 'my partner' (not bare 'partner') — otherwise "climbing partner" /
      // "business partner" misclassify as romantic
      { archetype: 'romantic',     relType: 'romantic',     keywords: ['girlfriend', 'boyfriend', 'my partner', 'fiancé', 'fiancee', 'dating', 'romantic'] },
      { archetype: 'mentor',       relType: 'mentor',       keywords: ['mentor', 'coach', 'teacher', 'professor', 'advisor', 'therapist'] },
      { archetype: 'colleague',    relType: 'professional', keywords: ['boss', 'coworker', 'co-worker', 'colleague', 'manager', 'client', 'business partner', 'works with', 'work together'] },
      { archetype: 'collaborator', relType: 'creative',     keywords: ['bandmate', 'collaborator', 'co-founder', 'cofounder', 'creative partner'] },
      { archetype: 'friend',       relType: 'friend',       keywords: ['best friend', 'friend', 'roommate', 'buddy', 'climbing partner', 'workout partner', 'training partner', 'gym partner'] },
    ];

    const match = ARCHETYPE_RULES.find(rule => rule.keywords.some(kw => text.includes(kw)));
    if (!match) return;

    const { data: rows } = await supabaseAdmin
      .from('characters')
      .select('id, archetype, relationship_depth, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .limit(1);
    const character = rows?.[0] as { id: string; archetype: string | null; relationship_depth: string | null; metadata: Record<string, unknown> | null } | undefined;
    if (!character || character.archetype) return; // never overwrite an existing archetype

    const metadata = { ...(character.metadata ?? {}), relationship_type: match.relType };
    await supabaseAdmin
      .from('characters')
      .update({
        archetype: match.archetype,
        // A confirmed relationship fact means this is more than a passing mention
        relationship_depth: character.relationship_depth === 'mentioned_only' ? 'moderate' : character.relationship_depth,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', characterId)
      .eq('user_id', userId);

    logger.info({ characterId, archetype: match.archetype }, 'Character classified from relationship facts');
  }

  private async extractFacts(
    entityType: EntityType,
    entityName: string,
    text: string
  ): Promise<ExtractedFact[]> {
    const systemPrompt = EXTRACTION_PROMPTS[entityType](entityName);

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Entity: ${entityName}\n\nConversation:\n${text.slice(0, 2000)}\n\nJSON:`,
        },
      ],
      max_tokens: 400,
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as { facts?: ExtractedFact[] };
      return Array.isArray(parsed.facts) ? parsed.facts.filter(f => f.fact && f.category) : [];
    } catch {
      return [];
    }
  }

  private async upsertFact(
    userId: string,
    entityId: string,
    entityType: EntityType,
    incoming: ExtractedFact,
    existing: EntityFact[]
  ): Promise<void> {
    const similar = existing.find(
      e => e.category === incoming.category && this.isSimilarFact(e.fact, incoming.fact)
    );

    const now = new Date().toISOString();

    if (similar) {
      const isContradiction =
        incoming.contradicts &&
        similar.fact.toLowerCase().includes(incoming.contradicts.toLowerCase().slice(0, 20));
      const hasChanged =
        !isContradiction && similar.fact.toLowerCase() !== incoming.fact.toLowerCase();

      await supabaseAdmin
        .from('entity_facts')
        .update({
          fact: incoming.fact,
          confidence: Math.min(1, similar.confidence + 0.05),
          mention_count: similar.mention_count + 1,
          status: isContradiction ? 'corrected' : hasChanged ? 'updated' : 'active',
          previous_value: isContradiction || hasChanged ? similar.fact : similar.previous_value,
          last_confirmed_at: now,
          updated_at: now,
        })
        .eq('id', similar.id);
    } else {
      const contradicted = incoming.contradicts
        ? existing.find(
            e =>
              e.category === incoming.category &&
              e.fact.toLowerCase().includes(incoming.contradicts!.toLowerCase().slice(0, 20))
          )
        : undefined;

      if (contradicted) {
        await supabaseAdmin
          .from('entity_facts')
          .update({ status: 'contradicted', updated_at: now })
          .eq('id', contradicted.id);
      }

      await supabaseAdmin.from('entity_facts').insert({
        user_id: userId,
        entity_id: entityId,
        entity_type: entityType,
        fact: incoming.fact,
        category: incoming.category,
        confidence: incoming.confidence ?? 0.7,
        mention_count: 1,
        status: 'active',
        previous_value: contradicted ? contradicted.fact : null,
        first_seen_at: now,
        last_confirmed_at: now,
      });
    }
  }

  private isSimilarFact(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return true;
    const wordsA = new Set(na.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return false;
    const [shorter, longer] = wordsA.size <= wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA];
    const overlap = [...shorter].filter(w => longer.has(w)).length;
    return overlap / shorter.size >= 0.6;
  }

  /**
   * Fetch facts for an entity. Active + updated + corrected by default (excludes contradicted).
   */
  async getEntityFacts(
    userId: string,
    entityId: string,
    entityType: EntityType,
    includeContradicted = false
  ): Promise<EntityFact[]> {
    let query = supabaseAdmin
      .from('entity_facts')
      .select('*')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .order('category')
      .order('confidence', { ascending: false });

    if (!includeContradicted) {
      query = query.in('status', ['active', 'updated', 'corrected']);
    }

    const { data, error } = await query;
    if (error) {
      logger.error({ error, entityId, entityType }, 'Failed to fetch entity facts');
      return [];
    }
    return (data ?? []) as EntityFact[];
  }

  /**
   * Resolve an organization name to its id from the organizations table.
   * Returns null if not found.
   */
  async resolveOrgIdByName(userId: string, orgName: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', orgName.trim())
      .limit(1);

    if (data?.[0]) return data[0].id as string;

    // Fallback: partial match
    const { data: partial } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${orgName.trim()}%`)
      .limit(1);

    return partial?.[0]?.id ?? null;
  }

  /**
   * Resolve a location name to its id from the people_places table.
   */
  async resolveLocationIdByName(userId: string, locationName: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('people_places')
      .select('id, name')
      .eq('user_id', userId)
      .eq('type', 'location')
      .ilike('name', locationName.trim())
      .limit(1);

    if (data?.[0]) return data[0].id as string;

    const { data: partial } = await supabaseAdmin
      .from('people_places')
      .select('id, name')
      .eq('user_id', userId)
      .eq('type', 'location')
      .ilike('name', `%${locationName.trim()}%`)
      .limit(1);

    return partial?.[0]?.id ?? null;
  }
}

export const entityFactsService = new EntityFactsService();
