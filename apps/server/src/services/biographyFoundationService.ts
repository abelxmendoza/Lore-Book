/**
 * Biography Foundation Service — Sprint F
 *
 * Characters + Relationships + Timeline Events → Biography Input Layer
 *
 * Pipeline:
 *   1. extractBiographyFacts()   — structured facts from all data layers
 *   2. extractThemes()           — recurring themes from journal tags + moods
 *   3. identifyLifePeriods()     — date-based life chapters from timeline
 *   4. generateSnapshot()        — LLM compiles facts into 200-500 word summary
 *   5. storeBiography()          — writes to narrative_accounts (biography_snapshot)
 *
 * Rules:
 *   - Facts only. No interpretation, psychology, or speculation.
 *   - Every fact references source IDs (journal_entry_ids, timeline_event_ids, etc.)
 *   - LLM prompt is strictly constrained to provided facts — no hallucination.
 *   - Idempotent: re-running updates the existing snapshot rather than duplicating.
 */

import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import {
  computeSourceInputVersion,
  isProjectionStale,
} from './projectionVersion';

// ── Fact types ────────────────────────────────────────────────────────────────

export type BiographyFacts = {
  identity: {
    name: string | null;
    location: string | null;
    education: string | null;
    employment: string | null;
    sourceEntryIds: string[];
  };
  relationships: Array<{
    name: string;
    type: string;
    status: string;
    characterId: string;
    relationshipId: string;
    sourceMemoryIds: string[];
  }>;
  keyEvents: Array<{
    title: string;
    eventType: string;
    date: string;
    connection: string | null;
    confidence: number;
    sourceEntryIds: string[];
  }>;
  livingSituation: string | null;
  upcomingEvents: string[];
  sourceEntryCount: number;
};

/**
 * Provenance record for a single derived biography fact — Sprint O (trust recovery).
 *
 * 'authoritative' facts are read directly from a structured source table and
 * MUST NOT be overwritten by inference over raw text. 'inferred' facts have no
 * authoritative source to defer to (e.g. employment/education aren't tracked
 * in any structured table) and are therefore lower-confidence by nature —
 * never silently presented as equal to an authoritative fact.
 */
export type FactProvenance = {
  value: string | null;
  source: string;
  confidence: 'authoritative' | 'inferred';
};

export type BiographyTheme = {
  theme: string;
  evidence: string[];
  frequency: number;
};

export type LifePeriod = {
  label: string;
  startDate: string;
  endDate: string;
  eventCount: number;
  dominantTheme: string | null;
};

export type BiographyOutput = {
  facts: BiographyFacts;
  themes: BiographyTheme[];
  periods: LifePeriod[];
  snapshot: string;
  snapshotWordCount: number;
  generatedAt: string;
  sourceEntryIds: string[];
  timelineEventIds: string[];
  characterIds: string[];
  relationshipIds: string[];
  /** Trust-recovery (Sprint O): traces every major derived fact back to its source and confidence. */
  provenance: Record<string, FactProvenance>;
  computedFromVersion?: string;
  stale?: boolean;
};

// ── Service ───────────────────────────────────────────────────────────────────

class BiographyFoundationService {

  /**
   * Main pipeline: generate and store a biography snapshot for a user.
   * Returns the full biography output with facts, themes, periods, and prose.
   */
  async generateBiography(userId: string): Promise<BiographyOutput | null> {
    logger.info({ userId }, 'Generating biography foundation');

    const [facts, themes, periods] = await Promise.all([
      this.extractBiographyFacts(userId),
      this.extractThemes(userId),
      this.identifyLifePeriods(userId),
    ]);

    // Subject invariant: no canonical self → no biography. Generating one
    // anyway is how a retrieved character can end up wearing the user's life.
    if (!facts.identity.name) {
      logger.warn({ userId }, 'Biography generation skipped — canonical self entity unresolved');
      return null;
    }
    if (facts.keyEvents.length === 0 && facts.relationships.length === 0) {
      logger.warn({ userId }, 'Insufficient data for biography generation');
      return null;
    }

    const snapshot = await this.generateSnapshot(userId, facts, themes, periods);
    const wordCount = snapshot.split(/\s+/).filter(Boolean).length;

    // Collect all source IDs for evidence chain
    const sourceEntryIds = [
      ...facts.identity.sourceEntryIds,
      ...facts.keyEvents.flatMap(e => e.sourceEntryIds),
      ...facts.relationships.flatMap(r => r.sourceMemoryIds),
    ];
    const uniqueEntryIds = [...new Set(sourceEntryIds)];

    const timelineEventIds = facts.keyEvents.map(e => e.title); // use titles as proxy
    const characterIds = facts.relationships.map(r => r.characterId);
    const relationshipIds = facts.relationships.map(r => r.relationshipId);
    const provenance = this.buildProvenance(facts);

    const output: BiographyOutput = {
      facts,
      themes,
      periods,
      snapshot,
      snapshotWordCount: wordCount,
      generatedAt: new Date().toISOString(),
      sourceEntryIds: uniqueEntryIds,
      timelineEventIds,
      characterIds,
      relationshipIds,
      provenance,
    };

    await this.storeBiography(userId, output);
    return output;
  }

  /**
   * Extract structured biography facts from all data layers.
   */
  async extractBiographyFacts(userId: string): Promise<BiographyFacts> {
    // ── Load all journal entries ─────────────────────────────────────────────
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, mood, tags, emotional_intensity, date')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    const allEntries = entries ?? [];
    const allContent = allEntries.map(e => e.content).join(' ').toLowerCase();
    const recentCutoff = Date.now() - 90 * 86_400_000;
    const recentEntries = allEntries.filter(e => e.date && new Date(e.date).getTime() >= recentCutoff);
    const recentContent = (recentEntries.length ? recentEntries : allEntries)
      .map(e => e.content)
      .join(' ')
      .toLowerCase();

    // ── Load characters. Subject invariant: the protagonist is the canonical
    // self entity ONLY — never the most-mentioned character (that heuristic
    // once made a third-party card the biography subject). ──────────────────
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);

    const { pickBiographySubject } = await import('./identity/biographySubjectInvariant');
    const protagonist = pickBiographySubject(
      (chars ?? []).map(c => ({ id: c.id, name: c.name, metadata: c.metadata as Record<string, unknown> | null })),
    );
    if (!protagonist) {
      logger.warn({ userId }, 'Biography subject invariant: canonical self unresolved — identity.name stays null');
    }

    // ── Load people_places for location + education ──────────────────────────
    const { data: places } = await supabaseAdmin
      .from('people_places')
      .select('name, type, total_mentions')
      .eq('user_id', userId)
      .eq('type', 'place')
      .order('total_mentions', { ascending: false });

    const topLocation = (places ?? [])[0]?.name ?? null;

    // ── Identity fact extraction (rule-based from content) ───────────────────
    // Prefer recent journals so old status (e.g. unemployment) does not stick forever.
    let education: string | null = null;
    let employment: string | null = null;

    if (/bachelor|cs degree|computer science|graduated/i.test(allContent)) {
      education = 'Computer Science bachelor';
    }
    if (/\bunemployed\b|job search|looking for work/i.test(recentContent)) {
      employment = 'unemployed';
    } else if (/\bemployed\b|working at|started at|new job|joined |hired/i.test(recentContent)) {
      employment = 'employed';
    }

    // ── Relationships ────────────────────────────────────────────────────────
    const { data: rels } = await supabaseAdmin
      .from('character_relationships')
      .select('id, source_character_id, target_character_id, relationship_type, status, metadata')
      .eq('user_id', userId);

    const charNameMap = new Map((chars ?? []).map(c => [c.id, c.name]));
    const relationships: BiographyFacts['relationships'] = (rels ?? []).map(r => {
      const other = r.source_character_id === protagonist?.id
        ? r.target_character_id
        : r.source_character_id;

      // Trust recovery (Sprint O): `character_relationships.status` is the
      // authoritative record — Biography is a narrator over it, not an editor.
      // A previous keyword-matching heuristic here re-derived status from raw
      // journal text and overwrote the structured value (e.g. turning an
      // 'active' family relationship into 'ended' because *another*
      // relationship's breakup language appeared in a co-mentioned entry).
      // Derived layers may summarize and rank — they may not contradict
      // structured truth. Use the DB value as-is.
      const status = r.status ?? 'active';
      const memIds: string[] = (r.metadata as any)?.source_memory_ids ?? [];

      return {
        name: charNameMap.get(other) ?? 'Unknown',
        type: r.relationship_type,
        status,
        characterId: other,
        relationshipId: r.id,
        sourceMemoryIds: memIds,
      };
    });

    // ── Key events from timeline ─────────────────────────────────────────────
    const { data: cteRows } = await supabaseAdmin
      .from('character_timeline_events')
      .select('event_id, event_title, event_type, event_date, connection_character_id, confidence, source_entry_ids')
      .eq('user_id', userId)
      .eq('character_id', protagonist?.id ?? '')
      .order('event_date', { ascending: true });

    const keyEvents: BiographyFacts['keyEvents'] = (cteRows ?? []).map(e => ({
      title: e.event_title,
      eventType: e.event_type,
      date: e.event_date,
      connection: e.connection_character_id ? (charNameMap.get(e.connection_character_id) ?? null) : null,
      confidence: e.confidence,
      sourceEntryIds: e.source_entry_ids ?? [],
    }));

    // ── Living situation ─────────────────────────────────────────────────────
    const livingSituationEntry = allEntries.find(e =>
      (e.tags ?? []).includes('living situation') ||
      /crowded|family members|kitchen.*morning|restroom.*morning/i.test(e.content)
    );
    const livingSituation = livingSituationEntry
      ? livingSituationEntry.content.slice(0, 200)
      : null;

    // ── Current focus (live structured sources — never hardcoded company names)
    // Active quests and future-dated timeline events stay current as the user moves on.
    const todayIso = new Date().toISOString().slice(0, 10);
    const [{ data: activeQuests }, { data: futureEvents }] = await Promise.all([
      supabaseAdmin
        .from('quests')
        .select('title, updated_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('character_timeline_events')
        .select('event_title, event_date')
        .eq('user_id', userId)
        .gte('event_date', todayIso)
        .order('event_date', { ascending: true })
        .limit(5),
    ]);

    const upcomingEvents: string[] = [];
    const seenFocus = new Set<string>();
    const pushFocus = (label: string | null | undefined) => {
      const trimmed = label?.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seenFocus.has(key)) return;
      seenFocus.add(key);
      upcomingEvents.push(trimmed);
    };

    for (const quest of activeQuests ?? []) pushFocus(quest.title);
    for (const event of futureEvents ?? []) pushFocus(event.event_title);

    return {
      identity: {
        name: protagonist?.name ?? null,
        location: topLocation,
        education,
        employment,
        sourceEntryIds: allEntries.map(e => e.id),
      },
      relationships,
      keyEvents,
      livingSituation,
      upcomingEvents,
      sourceEntryCount: allEntries.length,
    };
  }

  /**
   * Build a provenance trace for every major derived fact — Sprint O (trust
   * recovery). Lets future audits see, for any claim Biography makes, whether
   * it came straight from a structured table ('authoritative') or had to be
   * inferred because no structured source exists ('inferred'). Internal only —
   * not surfaced in the prose snapshot, stored alongside it for traceability.
   */
  private buildProvenance(facts: BiographyFacts): Record<string, FactProvenance> {
    const provenance: Record<string, FactProvenance> = {};

    for (const rel of facts.relationships) {
      provenance[`relationship.${rel.characterId}.status`] = {
        value: rel.status,
        source: 'character_relationships.status',
        confidence: 'authoritative',
      };
    }

    provenance['identity.employment'] = {
      value: facts.identity.employment,
      source: 'journal_entries (keyword inference — no authoritative employment record exists)',
      confidence: 'inferred',
    };

    provenance['identity.education'] = {
      value: facts.identity.education,
      source: 'journal_entries (keyword inference — no authoritative education record exists)',
      confidence: 'inferred',
    };

    provenance['identity.location'] = {
      value: facts.identity.location,
      source: 'people_places (ranked by total_mentions)',
      confidence: 'inferred',
    };

    return provenance;
  }

  /**
   * Extract recurring themes from journal tag frequency and mood patterns.
   */
  async extractThemes(userId: string): Promise<BiographyTheme[]> {
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id, tags, mood, content, date')
      .eq('user_id', userId);

    const recentCutoff = Date.now() - 90 * 86_400_000;

    // Count tag frequency with recency weight so old chapters don't dominate forever
    const tagFreq = new Map<string, { ids: string[]; weight: number }>();
    for (const entry of entries ?? []) {
      const isRecent = entry.date ? new Date(entry.date).getTime() >= recentCutoff : false;
      const weight = isRecent ? 3 : 1;
      for (const tag of entry.tags ?? []) {
        const lower = tag.toLowerCase();
        if (['conversation', 'chat', 'memory'].includes(lower)) continue; // skip meta-tags
        const bucket = tagFreq.get(lower) ?? { ids: [], weight: 0 };
        bucket.ids.push(entry.id);
        bucket.weight += weight;
        tagFreq.set(lower, bucket);
      }
    }

    // Group tags into themes — generic vocabulary, not one-off personal keywords
    const THEME_MAP: [string, string[]][] = [
      ['Career & work',        ['unemployed', 'interview', 'career', 'setbacks', 'rejections', 'job', 'work']],
      ['Relationships',        ['heartbreak', 'romance', 'romantic', 'relationships', 'friendship', 'dating']],
      ['Family & home',        ['family', 'living situation', 'home', 'household']],
      ['Building & creating',  ['app development', 'product', 'technology', 'building', 'creative']],
      ['Money & stability',    ['spending', 'finances', 'budget', 'bills']],
      ['Health & wellbeing',   ['health', 'fitness', 'mental health', 'self-care']],
    ];

    const themes: BiographyTheme[] = [];
    for (const [theme, relatedTags] of THEME_MAP) {
      const evidence: string[] = [];
      let freq = 0;
      for (const tag of relatedTags) {
        const bucket = tagFreq.get(tag);
        if (bucket && bucket.ids.length > 0) {
          evidence.push(tag);
          freq += bucket.weight;
        }
      }
      if (freq > 0) {
        themes.push({ theme, evidence, frequency: freq });
      }
    }

    return themes.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Identify life periods from the chronological spread of timeline events.
   */
  async identifyLifePeriods(userId: string): Promise<LifePeriod[]> {
    const { data: events } = await supabaseAdmin
      .from('character_timeline_events')
      .select('event_date, event_type, event_title')
      .eq('user_id', userId)
      .order('event_date', { ascending: true });

    if (!events?.length) return [];

    // Group by month/year
    const buckets = new Map<string, { events: typeof events; types: string[] }>();
    for (const ev of events) {
      const d = new Date(ev.event_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets.has(key)) buckets.set(key, { events: [], types: [] });
      buckets.get(key)!.events.push(ev);
      buckets.get(key)!.types.push(ev.event_type);
    }

    // Build named periods
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const periods: LifePeriod[] = [];

    for (const [key, bucket] of buckets) {
      const [year, month] = key.split('-').map(Number);
      const label = `${MONTH_NAMES[month - 1]} ${year}`;

      // Dominant theme: most frequent event type
      const typeFreq = new Map<string, number>();
      for (const t of bucket.types) typeFreq.set(t, (typeFreq.get(t) ?? 0) + 1);
      const dominantType = [...typeFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const PERIOD_LABELS: Record<string, string> = {
        relationship_separation: 'Relationship ending',
        career_event:            'Career transition',
        activity:                'Everyday life',
        life_context:            'Personal reflection',
        living_situation:        'Home & family',
        milestone:               'Milestone chapter',
        health:                  'Health chapter',
      };

      periods.push({
        label,
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate:   `${year}-${String(month).padStart(2, '0')}-30`,
        eventCount: bucket.events.length,
        dominantTheme: dominantType ? (PERIOD_LABELS[dominantType] ?? dominantType) : null,
      });
    }

    return periods;
  }

  /**
   * Generate the biography prose snapshot using LLM.
   * The prompt is strictly constrained to provided facts — no hallucination.
   */
  private async generateSnapshot(
    userId: string,
    facts: BiographyFacts,
    themes: BiographyTheme[],
    periods: LifePeriod[]
  ): Promise<string> {
    // Build a structured facts block for the LLM
    const factsBlock = [
      `Name: ${facts.identity.name ?? 'Unknown'}`,
      facts.identity.location ? `Location: ${facts.identity.location}` : null,
      facts.identity.education ? `Education: ${facts.identity.education}` : null,
      facts.identity.employment ? `Employment status: ${facts.identity.employment}` : null,
      facts.livingSituation ? `Living situation: ${facts.livingSituation.slice(0, 200)}` : null,
      facts.upcomingEvents.length
        ? `Upcoming: ${facts.upcomingEvents.join('; ')}`
        : null,
      facts.relationships.length
        ? `Relationships:\n${facts.relationships.map(r =>
            `  - ${r.name} (${r.type}, status: ${r.status})`
          ).join('\n')}`
        : null,
      facts.keyEvents.length
        ? `Key events:\n${facts.keyEvents.map(e =>
            `  - ${e.title}${e.connection ? ` (with ${e.connection})` : ''}`
          ).join('\n')}`
        : null,
      themes.length
        ? `Recurring themes: ${themes.map(t => t.theme).join(', ')}`
        : null,
      periods.length
        ? `Life period: ${periods.map(p => `${p.label} (${p.dominantTheme ?? 'general'})`).join(', ')}`
        : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are a biography writer for a personal memoir application.

Write a factual, structured biography summary (200–500 words) using ONLY the provided facts.

RULES:
- Third person throughout ("Abel lives...", "He is...")
- Stick strictly to the provided facts — do not invent, infer beyond evidence, or add psychology
- Be specific: use real names, locations, dollar amounts, timeframes when given
- Preserve nuance: "upcoming interview (position TBD)" not "has a job"
- End with a "Themes:" line listing the recurring themes
- Tone: neutral, factual, biographical — not memoir prose, not clinical

Format:
[2-4 paragraph biography narrative]

**Themes:** [comma-separated list]

**Data sources:** ${facts.sourceEntryCount} journal entries, ${facts.keyEvents.length} timeline events`;

    const userPrompt = `Generate a biography summary from these facts:\n\n${factsBlock}`;

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      return completion.choices[0]?.message?.content?.trim() ?? 'Biography unavailable.';
    } catch (err) {
      logger.error({ err, userId }, 'LLM biography generation failed — using fact summary');
      return factsBlock;
    }
  }

  /**
   * Store the biography snapshot in narrative_accounts.
   * Idempotent: updates existing record if one exists for this user.
   */
  private async storeBiography(userId: string, output: BiographyOutput): Promise<void> {
    const computedFromVersion = await computeSourceInputVersion(userId, output.sourceEntryIds);

    const { data: existing } = await supabaseAdmin
      .from('narrative_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('account_type', 'biography_snapshot')
      .limit(1);

    const payload = {
      user_id: userId,
      account_type: 'biography_snapshot',
      narrative_text: output.snapshot,
      recorded_at: output.generatedAt,
      metadata: {
        facts: output.facts,
        themes: output.themes,
        periods: output.periods,
        word_count: output.snapshotWordCount,
        source_entry_ids: output.sourceEntryIds,
        character_ids: output.characterIds,
        relationship_ids: output.relationshipIds,
        provenance: output.provenance,
        generated_by: 'biography_foundation',
        computed_from_version: computedFromVersion,
        stale: false,
        refreshed_at: output.generatedAt,
      },
    };

    if (existing?.[0]) {
      await supabaseAdmin
        .from('narrative_accounts')
        .update({ ...payload, recorded_at: output.generatedAt })
        .eq('id', existing[0].id);
      logger.info({ userId }, 'Updated existing biography snapshot');
    } else {
      await supabaseAdmin
        .from('narrative_accounts')
        .insert({ id: uuid(), ...payload });
      logger.info({ userId }, 'Created new biography snapshot');
    }
  }

  /**
   * Retrieve the stored biography snapshot for a user.
   */
  async getBiography(userId: string): Promise<BiographyOutput | null> {
    const { data } = await supabaseAdmin
      .from('narrative_accounts')
      .select('narrative_text, metadata, recorded_at')
      .eq('user_id', userId)
      .eq('account_type', 'biography_snapshot')
      .single();

    if (!data) return null;

    const meta = data.metadata as Record<string, unknown>;
    const sourceEntryIds = (meta.source_entry_ids as string[] | undefined) ?? [];
    const computedFromVersion = meta.computed_from_version as string | undefined;
    let stale = false;

    if (sourceEntryIds.length > 0 && computedFromVersion) {
      const currentVersion = await computeSourceInputVersion(userId, sourceEntryIds);
      stale = isProjectionStale(computedFromVersion, currentVersion);
    }

    return {
      facts: meta.facts,
      themes: meta.themes,
      periods: meta.periods,
      snapshot: data.narrative_text,
      snapshotWordCount: meta.word_count,
      generatedAt: data.recorded_at,
      sourceEntryIds,
      timelineEventIds: [],
      characterIds: meta.character_ids ?? [],
      relationshipIds: meta.relationship_ids ?? [],
      provenance: meta.provenance ?? {},
      computedFromVersion,
      stale,
    };
  }
}

export const biographyFoundationService = new BiographyFoundationService();
