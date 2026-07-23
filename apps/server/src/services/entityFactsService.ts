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

import { config } from '../config';
import { logger } from '../logger';
import { openai } from '../lib/openai';
import { isIndividualPersonName } from '../utils/personNameValidation';
import { supabaseAdmin } from './supabaseClient';

export type EntityType = 'character' | 'organization' | 'location';

/** Language that signals a strained/estranged family bond (lowers closeness). */
const ESTRANGEMENT_SIGNALS = /\b(estranged|cut (?:them |him |her )?off|cut ties|no contact|don'?t (?:talk|speak)|haven'?t spoken|doesn'?t (?:talk|speak)|disowned|fell out|not close|distant relationship|abusive|toxic|complicated relationship)\b/i;

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

const SELF_EXTRACTION_PROMPT = `You extract factual claims about the narrator (the person speaking in first person) from their conversation text.

Return JSON: { "facts": [ { "fact": "...", "category": "...", "confidence": 0.0-1.0, "contradicts": "..." } ] }

Category options: personality, appearance, relationship, history, career, location, goals, general

Rules:
- ONLY extract facts the narrator states about THEIR OWN life, identity, feelings, or situation
- Do NOT extract facts about other people they mention
- Write facts in third person about the narrator: "Is unemployed", "Lives in Seattle", "Has anxiety"
- confidence: 0.9 = directly stated, 0.7 = implied, 0.5 = speculative
- contradicts: old fact text if this contradicts something (otherwise omit)
- Skip vague facts. Max 6 facts. Return { "facts": [] } if none.`;

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
   * Extract facts about the narrator's own life from conversation text.
   */
  async extractAndPersistSelfFacts(
    userId: string,
    characterId: string,
    conversationText: string
  ): Promise<void> {
    if (!conversationText.trim()) return;

    let extracted: ExtractedFact[] = [];
    try {
      extracted = await this.extractSelfFacts(conversationText);
    } catch (err) {
      logger.warn({ err, characterId }, 'Self fact extraction failed (non-blocking)');
      return;
    }

    if (extracted.length === 0) return;

    const { data: existingRows } = await supabaseAdmin
      .from('entity_facts')
      .select('id, fact, category, confidence, mention_count, status, previous_value')
      .eq('user_id', userId)
      .eq('entity_id', characterId)
      .eq('entity_type', 'character')
      .eq('status', 'active');

    const existing = (existingRows ?? []) as EntityFact[];

    for (const incoming of extracted) {
      await this.upsertFact(userId, characterId, 'character', incoming, existing);
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
    const factText = facts.map(f => f.fact).join(' ');
    const utteranceText = this.sentencesAbout(conversationText, entityName);
    await this.classifyAndApply(userId, characterId, entityName, `${factText} ${utteranceText}`);
  }

  /**
   * Shared classification core. Keyword pass first (free, multilingual
   * kinship terms included); LLM fallback when keywords can't decide —
   * relationship type often lives in context ("we went out twice"), not in
   * a kinship word. Never overwrites an existing archetype.
   */
  async classifyAndApply(
    userId: string,
    characterId: string,
    entityName: string,
    rawText: string
  ): Promise<boolean> {
    const text = rawText.toLowerCase();
    if (text.trim().length < 3) return false;
    if (!isIndividualPersonName(entityName)) return false;

    // Kinship terms across cultures — "Abuela" IS the user's grandmother;
    // the book's Family filter must understand that without translation.
    const KINSHIP_TERMS = ['mom', 'mother', 'dad', 'father', 'sister', 'brother', 'sibling', 'cousin', 'aunt', 'uncle', 'grandma', 'grandmother', 'granny', 'grandpa', 'grandfather', 'daughter', 'son', 'wife', 'husband', 'niece', 'nephew', 'stepmom', 'stepdad',
      'abuela', 'abuelo', 'tía', 'tío', 'tia', 'tio', 'mamá', 'papá', 'hermana', 'hermano', 'prima', 'primo', 'madrina', 'padrino', // Spanish
      'nonna', 'nonno', 'zia', 'zio', // Italian
      'oma', 'opa', // German/Dutch
      'bubbe', 'zayde', // Yiddish
      'halmoni', 'harabeoji', 'eomma', 'appa', // Korean
      'nai nai', 'ye ye', 'lao lao', 'lao ye', // Chinese
      'baba', 'amma', 'ammi', 'abba', 'dadi', 'nani', // South Asian/Arabic
      'lola', 'lolo', 'tita', 'tito', // Filipino
      'yia yia', 'yiayia', 'pappous', // Greek
      'mamaw', 'papaw', 'meemaw', 'nana', 'pops'];

    const ARCHETYPE_RULES: Array<{ archetype: string; relType: string; keywords: string[] }> = [
      // 'my partner' (not bare 'partner') — otherwise "climbing partner" /
      // "business partner" misclassify as romantic
      { archetype: 'romantic',     relType: 'romantic',     keywords: ['girlfriend', 'boyfriend', 'my partner', 'fiancé', 'fiancee', 'dating', 'dated', 'romantic', 'situationship', 'hooked up', 'hooking up', 'slept with', 'slept together', 'made out', 'went on a date', 'went out with', 'our date', 'friends with benefits', 'my ex', 'ex girlfriend', 'ex boyfriend', 'crush on'] },
      { archetype: 'mentor',       relType: 'mentor',       keywords: ['mentor', 'coach', 'teacher', 'professor', 'advisor', 'therapist', 'instructor', 'coding bootcamp', 'bootcamp teacher', 'bootcamp instructor', 'taught me'] },
      { archetype: 'colleague',    relType: 'professional', keywords: ['boss', 'coworker', 'co-worker', 'colleague', 'manager', 'client', 'business partner', 'works with', 'work together', 'recruiter', 'onboarding', 'hiring', 'interviewer', 'staffing', 'kforce', 'amazon', 'agency', 'identity verification', 'background check', 'paperwork', 'start date'] },
      { archetype: 'collaborator', relType: 'creative',     keywords: ['bandmate', 'collaborator', 'co-founder', 'cofounder', 'creative partner'] },
      { archetype: 'friend',       relType: 'friend',       keywords: ['best friend', 'friend', 'roommate', 'buddy', 'climbing partner', 'workout partner', 'training partner', 'gym partner'] },
    ];

    let archetype: string | undefined;
    let relType: string | undefined;
    let romanticType: string | undefined;
    let relStatus: string | undefined;
    let publicFigure: { is: boolean; type?: string; clout?: string } | undefined;

    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word-boundary matching, not substring: short kinship terms otherwise
    // match inside ordinary words ('tio' is inside "mentioned", 'son' inside
    // "person") and misclassify everyone as family.
    const matchesWord = (kw: string, t: string) => new RegExp(`\\b${escapeRe(kw)}\\b`, 'i').test(t);

    // Family detection is stage-name aware ("Goth Tio" is an influencer's
    // handle, not the user's uncle). Family fires only when:
    //   (a) the entity's name STARTS with a kinship term ("Abuela",
    //       "Tío Juan") — the term is how the user addresses them; or
    //   (b) the context (with the entity's own name masked out) contains a
    //       POSSESSIVE kinship reference: "my tío", "mi abuela", "his mom".
    const nameLower = entityName.toLowerCase();
    const kinshipName = KINSHIP_TERMS.some(
      k => nameLower === k || nameLower.startsWith(`${k} `)
    );
    const maskedText = text.replace(new RegExp(escapeRe(nameLower), 'gi'), ' ');
    const possessiveKinship = new RegExp(
      `\\b(?:my|mi|mis|our|his|her|their)\\s+(?:${KINSHIP_TERMS.map(escapeRe).join('|')})\\b`, 'i'
    ).test(maskedText) || matchesWord('family', maskedText);

    if (kinshipName || possessiveKinship) {
      archetype = 'family';
      relType = 'family';
    } else {
      const match = ARCHETYPE_RULES.find(rule => rule.keywords.some(kw => matchesWord(kw, maskedText)));
      if (match) {
        archetype = match.archetype;
        relType = match.relType;
      }
    }

    // Keywords can detect romance but not its state — "she blocked me" only
    // means something to a model. Romantic keyword hits still consult the LLM
    // for romantic_type and current status.
    if (archetype === 'romantic' && rawText.trim().length >= 40) {
      const llm = await this.llmClassifyRelationship(entityName, rawText);
      if (llm && llm.confidence >= 0.6) {
        romanticType = llm.romantic_type ?? romanticType;
        relStatus = llm.status;
        if (llm.public_figure) publicFigure = { is: true, type: llm.figure_type, clout: llm.clout_level };
      }
    }

    if (!archetype && rawText.trim().length >= 40) {
      // Keywords can't decide — let context decide ("we went out twice and
      // slept together" → romantic; "mi abuelita" → family). The model also
      // covers kinship terms in languages the keyword list doesn't.
      const llm = await this.llmClassifyRelationship(entityName, rawText);
      if (llm && llm.confidence >= 0.7) {
        if (llm.archetype !== 'unknown') {
          archetype = llm.archetype;
          relType = llm.relationship_type;
          romanticType = llm.romantic_type;
          relStatus = llm.status;
        }
        if (llm.public_figure) publicFigure = { is: true, type: llm.figure_type, clout: llm.clout_level };
      }
    }

    // Public-figure flag is useful even without an archetype
    if (publicFigure?.is) {
      await supabaseAdmin
        .from('characters')
        .update({ metadata: await this.mergedMetadata(userId, characterId, { public_figure: true, figure_type: publicFigure.type ?? 'influencer', clout_level: publicFigure.clout ?? 'emerging' }) })
        .eq('id', characterId)
        .eq('user_id', userId);
    }
    if (!archetype || !relType) return false;

    const { data: rows } = await supabaseAdmin
      .from('characters')
      .select('id, archetype, relationship_depth, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .limit(1);
    const character = rows?.[0] as { id: string; archetype: string | null; relationship_depth: string | null; metadata: Record<string, unknown> | null } | undefined;
    if (!character || character.archetype) return false; // never overwrite an existing archetype

    const metadata = { ...(character.metadata ?? {}), relationship_type: relType };

    // Family members are core-circle figures: when we confirm someone is a
    // relative, treat them as close and significant by default. Estrangement
    // language ("we don't talk", "cut off") lowers the closeness but never
    // demotes them to a minor/background character.
    const isFamily = archetype === 'family';
    const estranged = isFamily && ESTRANGEMENT_SIGNALS.test(rawText.toLowerCase());
    const update: Record<string, unknown> = {
      archetype,
      metadata,
      updated_at: new Date().toISOString(),
    };

    if (isFamily) {
      update.relationship_depth = estranged
        ? (character.relationship_depth && character.relationship_depth !== 'mentioned_only'
            ? character.relationship_depth
            : 'casual')
        : 'close';
      update.proximity_level = 'direct';
      update.has_met = true;
      update.importance_level = estranged ? 'supporting' : 'major';
      update.importance_score = estranged ? 45 : 65;
    } else {
      // A confirmed relationship fact means this is more than a passing mention
      update.relationship_depth = character.relationship_depth === 'mentioned_only'
        ? 'moderate'
        : character.relationship_depth;
    }

    await supabaseAdmin
      .from('characters')
      .update(update)
      .eq('id', characterId)
      .eq('user_id', userId);

    // Romantic people also belong in the Dating & Romance view, which
    // reads romantic_relationships keyed by character id.
    if (archetype === 'romantic') {
      try {
        const { romanticRelationshipDetector } = await import('./conversationCentered/romanticRelationshipDetector');
        const endedTypes = ['ex_girlfriend', 'ex_boyfriend', 'ex_wife', 'ex_husband', 'ex_lover', 'one_night_stand'];
        const validStatuses = ['active', 'on_break', 'ended', 'complicated', 'paused', 'ghosted', 'blocked', 'unrequited', 'fading', 'rekindled'];
        // Prefer the LLM's status (it reads ending signals like "she blocked
        // me"); fall back to mapping ex_* types to ended.
        const status = relStatus && validStatuses.includes(relStatus)
          ? relStatus
          : romanticType && endedTypes.includes(romanticType) ? 'ended' : 'active';
        await romanticRelationshipDetector.saveRelationship(userId, {
          personId: characterId,
          personType: 'character',
          relationshipType: (romanticType as any) ?? 'dating',
          status: status as any,
          confidence: 0.75,
          evidence: rawText.slice(0, 280),
        });
      } catch (err) {
        logger.warn({ err, characterId }, 'Failed to create romantic relationship row (non-blocking)');
      }
    }

    logger.info({ characterId, name: entityName, archetype, relType }, 'Character relationship classified');
    return true;
  }

  /**
   * LLM relationship classification from contextual text. Multilingual
   * kinship aware: "Abuela" = grandmother, "Tío" = uncle, etc.
   */
  private async llmClassifyRelationship(
    entityName: string,
    text: string
  ): Promise<{ archetype: string; relationship_type: string; romantic_type?: string; status?: string; public_figure?: boolean; figure_type?: string; clout_level?: string; confidence: number } | null> {
    try {
      const response = await openai.chat.completions.create({
        model: config.extractionModel,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: `Classify the user's relationship to a person based on what the user has said about them.

Archetypes (pick ONE):
- family — relatives. Kinship terms in ANY language count ("Abuela" = grandmother, "Tío" = uncle, "Nonna", "Halmoni", "Lola"). If the person is ADDRESSED by a kinship term as their name, they ARE family.
  EXCEPTION — stage names and usernames: a kinship word inside a handle or stage name does NOT make someone family ("Goth Tio" the club influencer is not the user's uncle). Judge by how the user actually relates to them.
- romantic — dating, hooking up, situationship, ex, crush, sexual or romantic involvement of any kind. Infer from context ("we went out twice", "spent the night"), not just labels.
- mentor — teacher, coach, advisor, therapist
- colleague — work: boss, coworker, recruiter, client
- collaborator — creative partner, bandmate, co-founder
- friend — platonic friend, roommate
- unknown — not enough signal

If romantic, also pick:
- romantic_type: dating, situationship, hooking_up, talking, crush, ex_girlfriend, ex_boyfriend, friends_with_benefits, one_night_stand, lover
- status: read the CURRENT state from ending signals. "she blocked me" → blocked; "ghosted me"/"left me on read and disappeared" → ghosted; broke up → ended; "we're on a break" → on_break; one-sided feelings → unrequited; losing steam → fading; back together → rekindled; otherwise active.

Also detect public figures: if the person is an influencer, celebrity, artist, or content creator the user follows or encountered (rather than an intimate connection), set public_figure true and figure_type (influencer|celebrity|artist|creator|other). A user CAN have a real relationship with a public figure (a fan, a collaborator, an up-and-comer they know) — public_figure and a relationship archetype are not mutually exclusive.

When public_figure is true, also infer clout_level from context — how much reach/fame they signal:
- local: tiny/local following, just starting out
- emerging: up-and-coming, building early buzz
- rising: clear momentum, recognized within their niche
- established: well-known in their field
- prominent: broad mainstream recognition
- global: A-list / household name
Infer from cues (follower counts, venues, labels, "everyone knows", "blowing up", "small shows", "verified", press). When unsure, prefer the lower tier.

Respond JSON: {"archetype": "...", "relationship_type": "family|romantic|mentor|professional|creative|friend|unknown", "romantic_type": "...or omit", "status": "...or omit", "public_figure": false, "figure_type": "...or omit", "clout_level": "...or omit", "confidence": 0.0-1.0}`,
          },
          { role: 'user', content: `Person: ${entityName}\n\nWhat the user has said:\n${text.slice(0, 1500)}` },
        ],
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}');
      if (!parsed.archetype) return null;
      return parsed;
    } catch (err) {
      logger.warn({ err, entityName }, 'LLM relationship classification failed');
      return null;
    }
  }

  /** Merge keys into a character's metadata without clobbering other fields. */
  private async mergedMetadata(userId: string, characterId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    return { ...((data?.metadata as Record<string, unknown>) ?? {}), ...patch };
  }

  /**
   * Backfill classification for characters that predate the classifier or
   * never accumulated relationship facts. Context comes from their facts plus
   * past chat messages and journal entries that mention them by name.
   */
  async backfillCharacterClassifications(userId: string): Promise<{ classified: number; skipped: number }> {
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias')
      .eq('user_id', userId)
      .is('archetype', null);

    let classified = 0;
    let skipped = 0;
    for (const c of (chars ?? []) as Array<{ id: string; name: string; alias: string[] | null }>) {
      const names = [c.name, ...(c.alias ?? [])].filter(n => n.length >= 3);
      if (names.length === 0) { skipped++; continue; }

      const parts: string[] = [];
      const { data: facts } = await supabaseAdmin
        .from('entity_facts')
        .select('fact')
        .eq('user_id', userId)
        .eq('entity_id', c.id)
        .limit(15);
      parts.push(...((facts ?? []) as Array<{ fact: string }>).map(f => f.fact));

      // Word-boundary name match against past messages/entries
      const pattern = `\\m(${names.map(n => n.replace(/[^\w áéíóúñü-]/gi, '')).join('|')})\\M`;
      const [{ data: msgs }, { data: entries }] = await Promise.all([
        supabaseAdmin.from('chat_messages').select('content').eq('user_id', userId).eq('role', 'user')
          .filter('content', 'imatch', pattern).order('created_at', { ascending: false }).limit(10),
        supabaseAdmin.from('journal_entries').select('content').eq('user_id', userId)
          .filter('content', 'imatch', pattern).order('created_at', { ascending: false }).limit(5),
      ]);
      for (const m of (msgs ?? []) as Array<{ content: string }>) parts.push(this.sentencesAbout(m.content, c.name) || m.content.slice(0, 300));
      for (const e of (entries ?? []) as Array<{ content: string }>) parts.push(this.sentencesAbout(e.content, c.name) || e.content.slice(0, 300));

      const text = parts.join(' ').trim();
      if (!text) { skipped++; continue; }
      const ok = await this.classifyAndApply(userId, c.id, c.name, text);
      if (ok) classified++; else skipped++;
    }
    logger.info({ userId, classified, skipped }, 'Character classification backfill complete');
    return { classified, skipped };
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

  private async extractSelfFacts(text: string): Promise<ExtractedFact[]> {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SELF_EXTRACTION_PROMPT },
        {
          role: 'user',
          content: `Conversation:\n${text.slice(0, 2000)}\n\nJSON:`,
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
   * User-asserted fact (book UI / explicit membership). High confidence; dedupes
   * against similar active facts for the same entity + category.
   */
  async assertFact(
    userId: string,
    entityId: string,
    entityType: EntityType,
    fact: string,
    category: FactCategory,
    confidence = 0.95,
  ): Promise<void> {
    const trimmed = fact.trim();
    if (!trimmed || !entityId) return;

    const existing = await this.getEntityFacts(userId, entityId, entityType, false);
    await this.upsertFact(
      userId,
      entityId,
      entityType,
      { fact: trimmed, category, confidence },
      existing,
    );
  }

  /**
   * Retract previously asserted facts that are no longer true (e.g. a group
   * membership removed via the UI). Marks matches 'contradicted' rather than
   * deleting, consistent with upsertFact's contradiction handling — the row
   * stays for history but getEntityFacts excludes it by default.
   */
  async retractFactsMatching(
    userId: string,
    entityId: string,
    entityType: EntityType,
    category: FactCategory,
    matchSubstring: string,
  ): Promise<void> {
    const needle = matchSubstring.trim().toLowerCase();
    if (!needle || !entityId) return;

    const active = await this.getEntityFacts(userId, entityId, entityType, false);
    const matches = active.filter(
      (f) => f.category === category && f.fact.toLowerCase().includes(needle),
    );
    if (!matches.length) return;

    const { error } = await supabaseAdmin
      .from('entity_facts')
      .update({ status: 'contradicted', updated_at: new Date().toISOString() })
      .in('id', matches.map((f) => f.id));

    if (error) {
      logger.error({ error, userId, entityId, entityType, category }, 'Failed to retract facts');
    }
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
