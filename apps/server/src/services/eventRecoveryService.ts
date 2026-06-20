/**
 * Event Recovery Service — mines chat, entity_facts, and thread metadata for
 * benchmark life events missing from character_timeline_events.
 *
 * Uses the same resolved_events → character_timeline_events write path as
 * timelineFoundationService. No LLM, no parallel architecture.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../logger';
import { resolveCharacterIdByName } from './relationshipFoundationService';
import { supabaseAdmin } from './supabaseClient';
import { ingestResolvedEvent } from './narrativeSpine/narrativeSpineIngestion';

export type EventRecoveryPattern = {
  key: string;
  title: string;
  re: RegExp;
  eventType: string;
  timelineType: 'shared_experience' | 'lore' | 'mentioned_in';
  /** Character name hints for connection_character_id */
  people?: string[];
};

export const BENCHMARK_EVENT_PATTERNS: EventRecoveryPattern[] = [
  {
    key: 'costco_abuela',
    title: 'Costco with Abuela',
    re: /\bcostco\b[^.!?\n]{0,80}\babuela\b|\babuela\b[^.!?\n]{0,80}\bcostco\b/i,
    eventType: 'activity',
    timelineType: 'shared_experience',
    people: ['Abuela', 'Me'],
  },
  {
    key: 'lorebook_abuela_house',
    title: "Building LoreBook at Abuela's House",
    re: /building lorebook|lorebook.*abuela|abuela'?s house.*lorebook/i,
    eventType: 'career_event',
    timelineType: 'shared_experience',
    people: ['Abuela', 'Me'],
  },
  {
    key: 'club_metro',
    title: 'Club Metro',
    re: /\bclub metro\b/i,
    eventType: 'activity',
    timelineType: 'shared_experience',
    people: ['Me'],
  },
  {
    key: 'leslie_graduation',
    title: "Leslie's Graduation Party",
    re: /leslie'?s graduation|graduation party.*leslie|\bleslie\b[^.!?\n]{0,60}\bgraduation\b/i,
    eventType: 'life_context',
    timelineType: 'shared_experience',
    people: ['Leslie', 'Me'],
  },
  {
    key: 'kelly_interview',
    title: 'Kelly Interview Process',
    re: /\bkelly\b[^.!?\n]{0,80}\b(interview|recruiter|hiring)\b|\b(interview|recruiter)\b[^.!?\n]{0,80}\bkelly\b/i,
    eventType: 'career_event',
    timelineType: 'shared_experience',
    people: ['Kelly', 'Me'],
  },
  {
    key: 'amazon_onboarding',
    title: 'Amazon Onboarding',
    re: /\bamazon\b[^.!?\n]{0,120}\b(onboard|orientation|first day|started|hired|new job|warehouse)\b|\b(onboard|orientation|first day|started|hired)\b[^.!?\n]{0,120}\bamazon\b/i,
    eventType: 'career_event',
    timelineType: 'lore',
    people: ['Me'],
  },
  {
    key: 'sol_breakup',
    title: 'Sol Breakup',
    re: /\bsol\b[^.!?\n]{0,80}\b(breakup|blocked|no contact|left on read)\b|\b(breakup|blocked|no contact)\b[^.!?\n]{0,80}\bsol\b/i,
    eventType: 'relationship_separation',
    timelineType: 'shared_experience',
    people: ['Sol', 'Me'],
  },
  {
    key: 'pool_billiards',
    title: 'First Street Pool and Billiards',
    re: /\bfirst street pool\b|\bbilliards\b/i,
    eventType: 'activity',
    timelineType: 'shared_experience',
    people: ['Me'],
  },
];

function snippetAround(text: string, re: RegExp, radius = 200): string {
  const m = text.match(re);
  if (!m || m.index == null) return text.slice(0, 400);
  const start = Math.max(0, m.index - radius);
  return text.slice(start, start + radius * 2).trim();
}

class EventRecoveryService {
  async collectCorpus(userId: string): Promise<{ text: string; dates: string[] }> {
    const chunks: string[] = [];
    const dates: string[] = [];

    const { data: chatMsgs } = await supabaseAdmin
      .from('chat_messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(800);
    for (const m of chatMsgs ?? []) {
      if (m.content) chunks.push(String(m.content));
      if (m.created_at) dates.push(String(m.created_at));
    }

    const { data: sessions } = await supabaseAdmin
      .from('conversation_sessions')
      .select('metadata, updated_at')
      .eq('user_id', userId);
    for (const s of sessions ?? []) {
      const meta = (s.metadata ?? {}) as Record<string, unknown>;
      const tm = (meta.threadMeta ?? meta) as Record<string, unknown>;
      for (const key of ['summary_short', 'summary_medium', 'summary_long', 'summary']) {
        if (typeof tm[key] === 'string') chunks.push(tm[key] as string);
      }
      const msgs = meta.messages as Array<{ content?: string }> | undefined;
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          if (m.content) chunks.push(String(m.content));
        }
      }
      if (s.updated_at) dates.push(String(s.updated_at));
    }

    const { data: facts } = await supabaseAdmin
      .from('entity_facts')
      .select('fact, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(2000);
    for (const f of facts ?? []) {
      if (f.fact) chunks.push(String(f.fact));
      if (f.updated_at) dates.push(String(f.updated_at));
    }

    return { text: chunks.join('\n'), dates };
  }

  async recoverMissingEvents(userId: string): Promise<{
    created: number;
    skipped: number;
    matched: string[];
  }> {
    const stats = { created: 0, skipped: 0, matched: [] as string[] };
    const corpus = await this.collectCorpus(userId);
    if (!corpus.text.trim()) return stats;

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId);
    if (!chars?.length) return stats;

    const protagonist =
      chars.find((c) => /^me$/i.test(c.name)) ??
      chars.find((c) => /abel\s+mendoza/i.test(c.name)) ??
      chars[0];

    const { data: existing } = await supabaseAdmin
      .from('character_timeline_events')
      .select('event_title')
      .eq('user_id', userId);
    const existingTitles = new Set(
      (existing ?? []).map((e) => String(e.event_title ?? '').toLowerCase())
    );

    const fallbackDate =
      corpus.dates.sort().reverse()[0] ?? new Date().toISOString();

    for (const pattern of BENCHMARK_EVENT_PATTERNS) {
      if (!pattern.re.test(corpus.text)) {
        stats.skipped++;
        continue;
      }
      if (existingTitles.has(pattern.title.toLowerCase())) {
        stats.skipped++;
        continue;
      }

      const summary = snippetAround(corpus.text, pattern.re);
      const resolvedId = uuid();
      const eventDate = fallbackDate;

      const charIds = new Set<string>();
      if (protagonist) charIds.add(protagonist.id);
      for (const name of pattern.people ?? []) {
        const id = resolveCharacterIdByName(name, chars);
        if (id) charIds.add(id);
      }

      const { error: resolvedErr } = await supabaseAdmin.from('resolved_events').insert({
        id: resolvedId,
        user_id: userId,
        title: pattern.title,
        summary,
        type: pattern.eventType,
        start_time: eventDate,
        confidence: 0.72,
        tags: ['recovered'],
        people: [...charIds],
        metadata: {
          generated_by: 'event_recovery',
          recovery_key: pattern.key,
        },
      });

      if (resolvedErr) {
        logger.warn({ error: resolvedErr, key: pattern.key }, 'event_recovery: resolved_events insert failed');
        stats.skipped++;
        continue;
      }

      ingestResolvedEvent(userId, resolvedId);

      for (const characterId of charIds) {
        const connectionNames = (pattern.people ?? []).filter((n) => !/^me$/i.test(n));
        let connectionId: string | null = null;
        for (const cn of connectionNames) {
          const cid = resolveCharacterIdByName(cn, chars);
          if (cid && cid !== characterId) {
            connectionId = cid;
            break;
          }
        }

        const { error: cteErr } = await supabaseAdmin.from('character_timeline_events').insert({
          id: uuid(),
          user_id: userId,
          character_id: characterId,
          event_id: resolvedId,
          timeline_type: pattern.timelineType,
          user_was_present: true,
          event_type: pattern.eventType,
          event_title: pattern.title,
          event_summary: summary,
          event_date: eventDate,
          emotional_impact: pattern.eventType === 'relationship_separation' ? 'negative' : 'neutral',
          confidence: 0.72,
          connection_character_id: connectionId,
          source_entry_ids: [],
          metadata: {
            generated_by: 'event_recovery',
            recovery_key: pattern.key,
          },
        });

        if (cteErr) {
          logger.warn({ error: cteErr, key: pattern.key }, 'event_recovery: CTE insert failed');
        } else {
          stats.created++;
        }
      }

      stats.matched.push(pattern.key);
      existingTitles.add(pattern.title.toLowerCase());
    }

    return stats;
  }

  async benchmarkCoverage(userId: string): Promise<Record<string, boolean>> {
    const { data: events } = await supabaseAdmin
      .from('character_timeline_events')
      .select('event_title')
      .eq('user_id', userId);

    const titles = (events ?? []).map((e) => String(e.event_title ?? '').toLowerCase()).join('\n');
    return Object.fromEntries(
      BENCHMARK_EVENT_PATTERNS.map((p) => [p.key, titles.includes(p.title.toLowerCase())])
    );
  }
}

export const eventRecoveryService = new EventRecoveryService();
