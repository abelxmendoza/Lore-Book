import OpenAI from 'openai';
import { logger } from '../../logger';
import { config } from '../../config';
import { supabaseAdmin } from '../supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export interface SkillMetadata {
  // Learning Context
  learned_from?: Array<{
    character_id: string;
    character_name: string;
    relationship_type: 'teacher' | 'mentor' | 'peer' | 'self-taught';
    first_mentioned: string;
    evidence_entry_ids: string[];
  }>;
  
  practiced_with?: Array<{
    character_id: string;
    character_name: string;
    practice_count: number;
    last_practiced: string;
    evidence_entry_ids: string[];
  }>;
  
  // Timeline Context
  learned_when?: {
    date: string;
    entry_id: string;
    context: string;
  };
  
  why_started?: {
    reason: string;
    entry_id: string;
    extracted_at: string;
  };
  
  // Timeline Hierarchy Links
  arcs?: Array<{
    arc_id: string;
    arc_title: string;
    start_date: string;
    end_date?: string;
  }>;
  
  sagas?: Array<{
    saga_id: string;
    saga_title: string;
    start_date: string;
    end_date?: string;
  }>;
  
  eras?: Array<{
    era_id: string;
    era_title: string;
    start_date: string;
    end_date?: string;
  }>;
  
  // Location Context
  learned_at?: Array<{
    location_id: string;
    location_name: string;
    first_mentioned: string;
    evidence_entry_ids: string[];
  }>;
  
  practiced_at?: Array<{
    location_id: string;
    location_name: string;
    practice_count: number;
    last_practiced: string;
    evidence_entry_ids: string[];
  }>;
  
  // Calculated Fields
  years_practiced?: number;
  learning_timeline?: Array<{
    date: string;
    event: string;
    entry_id: string;
  }>;
}

/**
 * Skill Details Extraction Service
 * Extracts rich contextual information about skills from journal entries
 */
class SkillDetailsExtractionService {
  /**
   * Extract all details for a skill
   */
  async extractSkillDetails(userId: string, skillId: string): Promise<SkillMetadata> {
    try {
      logger.info({ userId, skillId }, 'Extracting skill details');

      // Get the skill to access first_mentioned_at
      const { data: skill, error: skillError } = await supabaseAdmin
        .from('skills')
        .select('first_mentioned_at, skill_name')
        .eq('id', skillId)
        .eq('user_id', userId)
        .single();

      if (skillError || !skill) {
        throw new Error(`Skill not found: ${skillError?.message}`);
      }

      // Get all journal entries related to this skill via skill_progress
      const { data: progressEntries, error: progressError } = await supabaseAdmin
        .from('skill_progress')
        .select('source_id, timestamp, notes')
        .eq('skill_id', skillId)
        .eq('user_id', userId)
        .eq('source_type', 'memory')
        .not('source_id', 'is', null)
        .order('timestamp', { ascending: true });

      if (progressError) {
        logger.error({ err: progressError }, 'Failed to fetch skill progress');
        throw progressError;
      }

      const entryIds = progressEntries?.map(p => p.source_id).filter(Boolean) as string[] || [];
      
      if (entryIds.length === 0) {
        logger.info({ skillId }, 'No journal entries found for skill');
        return this.calculateBasicMetadata(skill.first_mentioned_at);
      }

      // Extract all details in parallel
      const [
        learnedFrom,
        practicedWith,
        learnedAt,
        practicedAt,
        timelineContext,
        whyStarted,
        learningTimeline
      ] = await Promise.all([
        this.extractLearnedFrom(userId, entryIds),
        this.extractPracticedWith(userId, entryIds),
        this.extractLearnedAt(userId, entryIds),
        this.extractPracticedAt(userId, entryIds),
        this.extractTimelineContext(userId, entryIds),
        this.extractWhyStarted(userId, skill.skill_name, entryIds, skill.first_mentioned_at),
        this.buildLearningTimeline(entryIds, progressEntries || [])
      ]);

      const metadata: SkillMetadata = {
        learned_from: learnedFrom.length > 0 ? learnedFrom : undefined,
        practiced_with: practicedWith.length > 0 ? practicedWith : undefined,
        learned_at: learnedAt.length > 0 ? learnedAt : undefined,
        practiced_at: practicedAt.length > 0 ? practicedAt : undefined,
        arcs: timelineContext.arcs.length > 0 ? timelineContext.arcs : undefined,
        sagas: timelineContext.sagas.length > 0 ? timelineContext.sagas : undefined,
        eras: timelineContext.eras.length > 0 ? timelineContext.eras : undefined,
        why_started: whyStarted,
        years_practiced: this.calculateYearsPracticed(skill.first_mentioned_at),
        learning_timeline: learningTimeline.length > 0 ? learningTimeline : undefined
      };

      // Set learned_when from first entry
      if (entryIds.length > 0) {
        const firstEntryId = entryIds[0];
        const { data: firstEntry } = await supabaseAdmin
          .from('journal_entries')
          .select('date, content')
          .eq('id', firstEntryId)
          .single();

        if (firstEntry) {
          metadata.learned_when = {
            date: firstEntry.date,
            entry_id: firstEntryId,
            context: firstEntry.content?.substring(0, 200) || ''
          };
        }
      }

      return metadata;
    } catch (error) {
      logger.error({ err: error, userId, skillId }, 'Failed to extract skill details');
      throw error;
    }
  }

  /**
   * Extract characters who taught this skill
   */
  private async extractLearnedFrom(
    userId: string,
    entryIds: string[]
  ): Promise<SkillMetadata['learned_from']> {
    if (entryIds.length === 0) return [];

    const { data, error } = await supabaseAdmin
      .from('character_memories')
      .select(`
        character_id,
        journal_entry_id,
        relationship_type,
        characters!inner(id, name)
      `)
      .eq('user_id', userId)
      .in('journal_entry_id', entryIds)
      .in('relationship_type', ['teacher', 'mentor', 'instructor', 'coach']);

    if (error) {
      logger.error({ err: error }, 'Failed to extract learned from');
      return [];
    }

    // Group by character and get first mention
    const characterMap = new Map<string, {
      character_id: string;
      character_name: string;
      relationship_type: 'teacher' | 'mentor' | 'peer' | 'self-taught';
      first_mentioned: string;
      evidence_entry_ids: string[];
    }>();

    for (const item of data || []) {
      const char = item.characters as any;
      const charId = item.character_id;
      
      if (!characterMap.has(charId)) {
        // Get first mention date
        const { data: firstEntry } = await supabaseAdmin
          .from('journal_entries')
          .select('date')
          .eq('id', item.journal_entry_id)
          .single();

        characterMap.set(charId, {
          character_id: charId,
          character_name: char.name,
          relationship_type: this.normalizeRelationshipType(item.relationship_type),
          first_mentioned: firstEntry?.date || new Date().toISOString(),
          evidence_entry_ids: [item.journal_entry_id]
        });
      } else {
        const existing = characterMap.get(charId)!;
        existing.evidence_entry_ids.push(item.journal_entry_id);
      }
    }

    return Array.from(characterMap.values());
  }

  /**
   * Extract characters practiced with
   */
  private async extractPracticedWith(
    userId: string,
    entryIds: string[]
  ): Promise<SkillMetadata['practiced_with']> {
    if (entryIds.length === 0) return [];

    const { data, error } = await supabaseAdmin
      .from('character_memories')
      .select(`
        character_id,
        journal_entry_id,
        characters!inner(id, name)
      `)
      .eq('user_id', userId)
      .in('journal_entry_id', entryIds);

    if (error) {
      logger.error({ err: error }, 'Failed to extract practiced with');
      return [];
    }

    // Group by character and count practices
    const characterMap = new Map<string, {
      character_id: string;
      character_name: string;
      practice_count: number;
      last_practiced: string;
      evidence_entry_ids: string[];
    }>();

    for (const item of data || []) {
      const char = item.characters as any;
      const charId = item.character_id;
      
      // Get entry date
      const { data: entry } = await supabaseAdmin
        .from('journal_entries')
        .select('date')
        .eq('id', item.journal_entry_id)
        .single();

      const entryDate = entry?.date || new Date().toISOString();

      if (!characterMap.has(charId)) {
        characterMap.set(charId, {
          character_id: charId,
          character_name: char.name,
          practice_count: 1,
          last_practiced: entryDate,
          evidence_entry_ids: [item.journal_entry_id]
        });
      } else {
        const existing = characterMap.get(charId)!;
        existing.practice_count++;
        if (entryDate > existing.last_practiced) {
          existing.last_practiced = entryDate;
        }
        existing.evidence_entry_ids.push(item.journal_entry_id);
      }
    }

    return Array.from(characterMap.values()).filter(c => c.practice_count > 0);
  }

  /**
   * Extract locations where skill was learned
   */
  private async extractLearnedAt(
    userId: string,
    entryIds: string[]
  ): Promise<SkillMetadata['learned_at']> {
    if (entryIds.length === 0) return [];

    // Get first few entries to find learning locations
    const firstEntries = entryIds.slice(0, 10);

    const { data, error } = await supabaseAdmin
      .from('location_mentions')
      .select(`
        location_id,
        memory_id,
        locations!inner(id, name)
      `)
      .in('memory_id', firstEntries);

    if (error) {
      logger.error({ err: error }, 'Failed to extract learned at');
      return [];
    }

    const locationMap = new Map<string, {
      location_id: string;
      location_name: string;
      first_mentioned: string;
      evidence_entry_ids: string[];
    }>();

    for (const item of data || []) {
      const loc = item.locations as any;
      const locId = item.location_id;
      
      const { data: entry } = await supabaseAdmin
        .from('journal_entries')
        .select('date')
        .eq('id', item.memory_id)
        .single();

      const entryDate = entry?.date || new Date().toISOString();

      if (!locationMap.has(locId)) {
        locationMap.set(locId, {
          location_id: locId,
          location_name: loc.name,
          first_mentioned: entryDate,
          evidence_entry_ids: [item.memory_id]
        });
      } else {
        const existing = locationMap.get(locId)!;
        if (entryDate < existing.first_mentioned) {
          existing.first_mentioned = entryDate;
        }
        existing.evidence_entry_ids.push(item.memory_id);
      }
    }

    return Array.from(locationMap.values());
  }

  /**
   * Extract locations where skill was practiced
   */
  private async extractPracticedAt(
    userId: string,
    entryIds: string[]
  ): Promise<SkillMetadata['practiced_at']> {
    if (entryIds.length === 0) return [];

    const { data, error } = await supabaseAdmin
      .from('location_mentions')
      .select(`
        location_id,
        memory_id,
        locations!inner(id, name)
      `)
      .in('memory_id', entryIds);

    if (error) {
      logger.error({ err: error }, 'Failed to extract practiced at');
      return [];
    }

    const locationMap = new Map<string, {
      location_id: string;
      location_name: string;
      practice_count: number;
      last_practiced: string;
      evidence_entry_ids: string[];
    }>();

    for (const item of data || []) {
      const loc = item.locations as any;
      const locId = item.location_id;
      
      const { data: entry } = await supabaseAdmin
        .from('journal_entries')
        .select('date')
        .eq('id', item.memory_id)
        .single();

      const entryDate = entry?.date || new Date().toISOString();

      if (!locationMap.has(locId)) {
        locationMap.set(locId, {
          location_id: locId,
          location_name: loc.name,
          practice_count: 1,
          last_practiced: entryDate,
          evidence_entry_ids: [item.memory_id]
        });
      } else {
        const existing = locationMap.get(locId)!;
        existing.practice_count++;
        if (entryDate > existing.last_practiced) {
          existing.last_practiced = entryDate;
        }
        existing.evidence_entry_ids.push(item.memory_id);
      }
    }

    return Array.from(locationMap.values()).filter(l => l.practice_count > 0);
  }

  /**
   * Extract timeline context (arcs, sagas, eras)
   */
  private async extractTimelineContext(
    userId: string,
    entryIds: string[]
  ): Promise<{ arcs: SkillMetadata['arcs']; sagas: SkillMetadata['sagas']; eras: SkillMetadata['eras'] }> {
    if (entryIds.length === 0) {
      return { arcs: [], sagas: [], eras: [] };
    }

    // Get timeline memberships for these entries
    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from('timeline_memberships')
      .select('timeline_id, journal_entry_id')
      .in('journal_entry_id', entryIds);

    if (membershipError || !memberships || memberships.length === 0) {
      return { arcs: [], sagas: [], eras: [] };
    }

    const timelineIds = [...new Set(memberships.map(m => m.timeline_id))];

    // Query arcs, sagas, and eras
    const [arcsResult, sagasResult, erasResult] = await Promise.all([
      supabaseAdmin
        .from('timeline_arcs')
        .select('id, title, start_date, end_date')
        .eq('user_id', userId)
        .in('id', timelineIds),
      supabaseAdmin
        .from('timeline_sagas')
        .select('id, title, start_date, end_date')
        .eq('user_id', userId)
        .in('id', timelineIds),
      supabaseAdmin
        .from('timeline_eras')
        .select('id, title, start_date, end_date')
        .eq('user_id', userId)
        .in('id', timelineIds)
    ]);

    return {
      arcs: (arcsResult.data || []).map(a => ({
        arc_id: a.id,
        arc_title: a.title,
        start_date: a.start_date,
        end_date: a.end_date || undefined
      })),
      sagas: (sagasResult.data || []).map(s => ({
        saga_id: s.id,
        saga_title: s.title,
        start_date: s.start_date,
        end_date: s.end_date || undefined
      })),
      eras: (erasResult.data || []).map(e => ({
        era_id: e.id,
        era_title: e.title,
        start_date: e.start_date,
        end_date: e.end_date || undefined
      }))
    };
  }

  /**
   * Extract why the user started learning this skill
   */
  private async extractWhyStarted(
    userId: string,
    skillName: string,
    entryIds: string[],
    firstMentionedAt: string
  ): Promise<SkillMetadata['why_started']> {
    if (entryIds.length === 0) return undefined;

    // Get the first few entries that mention this skill
    const firstEntryId = entryIds[0];
    const { data: firstEntry, error } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, date')
      .eq('id', firstEntryId)
      .single();

    if (error || !firstEntry || !firstEntry.content) {
      return undefined;
    }

    try {
      // Use OpenAI to extract the reason
      const prompt = `Analyze this journal entry and extract why the person started learning "${skillName}".

Journal entry:
${firstEntry.content.substring(0, 1500)}

Return a JSON object with:
- reason: A concise explanation (1-2 sentences) of why they started learning this skill. If not clear, return "Not specified in entry."
- confidence: 0.0-1.0 (how confident you are this is the actual reason)

Return ONLY valid JSON, no other text.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      if (result.reason && result.confidence > 0.5) {
        return {
          reason: result.reason,
          entry_id: firstEntryId,
          extracted_at: new Date().toISOString()
        };
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract why started');
    }

    return undefined;
  }

  /**
   * Build learning timeline from progress entries
   */
  private async buildLearningTimeline(
    entryIds: string[],
    progressEntries: Array<{ source_id: string | null; timestamp: string; notes: string | null }>
  ): Promise<SkillMetadata['learning_timeline']> {
    const timeline: SkillMetadata['learning_timeline'] = [];

    // Get journal entries with dates
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id, date, content')
      .in('id', entryIds)
      .order('date', { ascending: true });

    if (!entries) return [];

    // Build timeline from key entries (first, milestones, recent)
    const keyIndices = [0]; // First entry
    if (entries.length > 5) keyIndices.push(Math.floor(entries.length / 2)); // Middle
    if (entries.length > 1) keyIndices.push(entries.length - 1); // Last

    for (const idx of keyIndices) {
      const entry = entries[idx];
      if (!entry) continue;

      const progress = progressEntries.find(p => p.source_id === entry.id);
      const event = progress?.notes || 
                   (idx === 0 ? 'Started learning' : 
                    idx === entries.length - 1 ? 'Recent practice' : 
                    'Practice session');

      timeline.push({
        date: entry.date,
        event,
        entry_id: entry.id
      });
    }

    return timeline;
  }

  /**
   * Calculate years practiced
   */
  private calculateYearsPracticed(firstMentionedAt: string): number {
    const firstDate = new Date(firstMentionedAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - firstDate.getTime());
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    return Math.round(diffYears * 10) / 10; // Round to 1 decimal
  }

  /**
   * Calculate basic metadata when no entries exist
   */
  private calculateBasicMetadata(firstMentionedAt: string): SkillMetadata {
    return {
      years_practiced: this.calculateYearsPracticed(firstMentionedAt)
    };
  }

  /**
   * Normalize relationship type
   */
  private normalizeRelationshipType(
    type: string
  ): 'teacher' | 'mentor' | 'peer' | 'self-taught' {
    const normalized = type.toLowerCase();
    if (normalized.includes('teacher') || normalized.includes('instructor') || normalized.includes('coach')) {
      return 'teacher';
    }
    if (normalized.includes('mentor')) {
      return 'mentor';
    }
    if (normalized.includes('peer') || normalized.includes('friend') || normalized.includes('colleague')) {
      return 'peer';
    }
    return 'self-taught';
  }
}

export const skillDetailsExtractionService = new SkillDetailsExtractionService();
