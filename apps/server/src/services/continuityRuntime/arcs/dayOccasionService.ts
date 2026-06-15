/**
 * Day-scoped occasion arcs — auto-named from clusters of events + moments on a calendar day.
 * Example: "My Cousin Leslie's Graduation Party" with before/during/after context linked.
 */

import { logger } from '../../../logger';
import { tracedCompletion } from '../../../lib/openai';
import { supabaseAdmin } from '../../supabaseClient';
import { arcService, type ArcTrack } from './arcService';
import { arcRelationshipService } from './arcRelationshipService';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserPresence = 'attended' | 'heard_about' | 'unknown';
type TemporalRole = 'before' | 'during' | 'after' | 'throughout';

type ResolvedEventRow = {
  id: string;
  title: string;
  summary: string | null;
  start_time: string;
  end_time: string | null;
  people: string[];
  locations: string[];
  metadata: Record<string, unknown>;
};

type JournalRow = {
  id: string;
  content: string;
  date: string | null;
  created_at: string;
};

type DayCluster = {
  day: string;
  clusterKey: string;
  anchorEventIds: string[];
  events: ResolvedEventRow[];
  presence: UserPresence;
};

type OccasionProposal = {
  title: string;
  summary: string | null;
  confidence: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
}

function eventPresence(e: ResolvedEventRow): UserPresence {
  const p = (e.metadata?.user_presence as string | undefined)?.toLowerCase();
  if (p === 'attended' || p === 'heard_about') return p;
  return 'unknown';
}

function sharedEntityOverlap(a: ResolvedEventRow, b: ResolvedEventRow): boolean {
  const titleA = a.title.toLowerCase();
  const titleB = b.title.toLowerCase();
  const wordsA = new Set(titleA.split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(titleB.split(/\s+/).filter(w => w.length > 3));
  for (const w of wordsA) {
    if (wordsB.has(w)) return true;
  }
  const peopleA = new Set(a.people ?? []);
  for (const p of b.people ?? []) {
    if (peopleA.has(p)) return true;
  }
  const locA = new Set(a.locations ?? []);
  for (const l of b.locations ?? []) {
    if (locA.has(l)) return true;
  }
  return false;
}

function clusterKeyForEvents(day: string, events: ResolvedEventRow[]): string {
  const anchor = events.find(e => eventPresence(e) === 'attended') ?? events[0];
  const slug = normalizeKey(anchor.title);
  return `${day}:${slug || 'occasion'}`;
}

function inferTemporalRole(
  itemTime: Date,
  anchorStart: Date,
  anchorEnd: Date | null
): TemporalRole {
  const end = anchorEnd ?? anchorStart;
  if (itemTime < anchorStart) return 'before';
  if (itemTime > end) return 'after';
  return 'during';
}

function inferTrack(events: ResolvedEventRow[]): ArcTrack {
  const text = events.map(e => `${e.title} ${e.summary ?? ''}`).join(' ').toLowerCase();
  if (/\b(graduation|wedding|party|birthday|funeral|reunion|celebration)\b/.test(text)) {
    return 'relationships';
  }
  if (/\b(work|meeting|office|interview|conference)\b/.test(text)) {
    return 'career';
  }
  if (/\b(concert|show|festival|game)\b/.test(text)) {
    return 'creative';
  }
  return 'mixed';
}

function weekendRange(day: string): [string, string] | null {
  const d = new Date(`${day}T12:00:00`);
  const dow = d.getUTCDay();
  if (dow !== 6 && dow !== 0) return null;
  const sat = new Date(d);
  if (dow === 0) sat.setUTCDate(sat.getUTCDate() - 1);
  const sun = new Date(sat);
  sun.setUTCDate(sun.getUTCDate() + 1);
  return [sat.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)];
}

// ─── Clustering ─────────────────────────────────────────────────────────────────

function clusterEventsByDay(events: ResolvedEventRow[]): DayCluster[] {
  const byDay = new Map<string, ResolvedEventRow[]>();
  for (const e of events) {
    const d = dayOf(e.start_time);
    const list = byDay.get(d) ?? [];
    list.push(e);
    byDay.set(d, list);
  }

  const clusters: DayCluster[] = [];

  for (const [day, dayEvents] of byDay) {
    const sorted = [...dayEvents].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const used = new Set<string>();

    for (const seed of sorted) {
      if (used.has(seed.id)) continue;

      const group: ResolvedEventRow[] = [seed];
      used.add(seed.id);

      for (const other of sorted) {
        if (used.has(other.id)) continue;
        const overlaps = group.some(g => sharedEntityOverlap(g, other));
        const samePresence =
          eventPresence(other) === eventPresence(seed) ||
          eventPresence(other) === 'unknown' ||
          eventPresence(seed) === 'unknown';
        if (overlaps && samePresence) {
          group.push(other);
          used.add(other.id);
        }
      }

      const attended = group.filter(e => eventPresence(e) === 'attended');
      const presence: UserPresence =
        attended.length > 0 ? 'attended' : eventPresence(group[0]);

      clusters.push({
        day,
        clusterKey: clusterKeyForEvents(day, group),
        anchorEventIds: (attended.length > 0 ? attended : group).map(e => e.id),
        events: group,
        presence,
      });
    }
  }

  return clusters;
}

// ─── AI naming ──────────────────────────────────────────────────────────────────

async function proposeOccasionTitle(
  cluster: DayCluster,
  moments: JournalRow[],
  userId: string
): Promise<OccasionProposal> {
  const eventLines = cluster.events
    .slice(0, 10)
    .map(e => {
      const t = new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const p = eventPresence(e);
      return `- [${t}] ${e.title}${e.summary ? `: ${e.summary.slice(0, 120)}` : ''} (${p})`;
    })
    .join('\n');

  const momentLines = moments
    .slice(0, 8)
    .map(m => {
      const t = m.date ?? m.created_at;
      return `- ${t.slice(11, 16) || '—'}: ${m.content.replace(/\s+/g, ' ').slice(0, 100)}`;
    })
    .join('\n');

  const prompt = `You are naming a specific life occasion from autobiographical data.

Date: ${cluster.day}
User presence at main events: ${cluster.presence}

Events on this day:
${eventLines || '(none)'}

Related memories/moments (before, during, after):
${momentLines || '(none)'}

Respond with JSON only:
{
  "title": "<full natural name as the user would say it, e.g. \\"My Cousin Leslie's Graduation Party\\" — use possessives and relationships when relevant, not generic labels>",
  "summary": "<1-2 sentences covering what happened that day at the occasion and surrounding context>",
  "confidence": <0.55-0.95>
}`;

  try {
    const completion = await tracedCompletion(
      {
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 250,
        temperature: 0.35,
      },
      { service: 'dayOccasion', userId }
    );

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as OccasionProposal;
    return {
      title: parsed.title?.slice(0, 120) || cluster.events[0]?.title || `Occasion on ${cluster.day}`,
      summary: parsed.summary ?? null,
      confidence: Math.min(0.95, Math.max(0.55, parsed.confidence ?? 0.7)),
    };
  } catch (err) {
    logger.warn({ err, userId, day: cluster.day }, 'dayOccasion: AI titling failed');
    const fallback = cluster.events.find(e => eventPresence(e) === 'attended') ?? cluster.events[0];
    return {
      title: fallback?.title ?? `Occasion on ${cluster.day}`,
      summary: fallback?.summary ?? null,
      confidence: 0.6,
    };
  }
}

// ─── Service ────────────────────────────────────────────────────────────────────

export class DayOccasionService {
  /**
   * Process recent calendar days and upsert occasion arcs.
   */
  async processRecentDays(userId: string, opts: { lookbackDays?: number } = {}): Promise<number> {
    const lookbackDays = opts.lookbackDays ?? 14;
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);
    since.setHours(0, 0, 0, 0);

    const { data: events, error } = await supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, start_time, end_time, people, locations, metadata')
      .eq('user_id', userId)
      .gte('start_time', since.toISOString())
      .order('start_time', { ascending: true });

    if (error) {
      logger.warn({ error, userId }, 'dayOccasion: failed to load events');
      return 0;
    }

    if (!events?.length) return 0;

    const clusters = clusterEventsByDay(events as ResolvedEventRow[]);
    let created = 0;

    for (const cluster of clusters) {
      try {
        const ok = await this.upsertOccasionArc(userId, cluster);
        if (ok) created++;
      } catch (err) {
        logger.warn({ err, userId, day: cluster.day }, 'dayOccasion: cluster failed');
      }
    }

    await this.linkOverlappingOccasions(userId, since.toISOString());

    logger.info({ userId, clusters: clusters.length, upserted: created }, 'dayOccasion: complete');
    return created;
  }

  private async upsertOccasionArc(userId: string, cluster: DayCluster): Promise<boolean> {
    if (cluster.events.length === 0) return false;

    const anchor =
      cluster.events.find(e => cluster.anchorEventIds.includes(e.id)) ?? cluster.events[0];
    const anchorStart = new Date(anchor.start_time);
    const anchorEnd = anchor.end_time ? new Date(anchor.end_time) : null;

    const dayStart = new Date(`${cluster.day}T00:00:00`);
    const dayEnd = new Date(`${cluster.day}T23:59:59.999`);

    const { data: journalRows } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, date, created_at')
      .eq('user_id', userId)
      .gte('date', dayStart.toISOString())
      .lte('date', dayEnd.toISOString())
      .order('date', { ascending: true });

    const moments = (journalRows ?? []) as JournalRow[];
    const proposal = await proposeOccasionTitle(cluster, moments, userId);
    const wr = weekendRange(cluster.day);

    const metadata: Record<string, unknown> = {
      occasion_key: cluster.clusterKey,
      occasion_day: cluster.day,
      user_presence: cluster.presence,
      anchor_event_ids: cluster.anchorEventIds,
    };
    if (wr) metadata.weekend_range = wr;

    const { data: existing } = await supabaseAdmin
      .from('life_arcs')
      .select('id')
      .eq('user_id', userId)
      .eq('arc_type', 'occasion')
      .eq('metadata->>occasion_key', cluster.clusterKey)
      .maybeSingle();

    let arcId: string;

    if (existing?.id) {
      const updated = await arcService.update(userId, existing.id, {
        title: proposal.title,
        summary: proposal.summary,
        confidence: proposal.confidence,
        track: inferTrack(cluster.events),
        metadata,
      });
      arcId = updated.id;
    } else {
      const inserted = await supabaseAdmin
        .from('life_arcs')
        .insert({
          user_id: userId,
          title: proposal.title,
          arc_type: 'occasion',
          track: inferTrack(cluster.events),
          start_date: cluster.day,
          end_date: cluster.day,
          is_active: false,
          summary: proposal.summary,
          confidence: proposal.confidence,
          source: 'inferred',
          tags: cluster.presence === 'heard_about' ? ['heard_about'] : ['attended'],
          metadata,
        })
        .select('id')
        .single();

      if (inserted.error) throw inserted.error;
      arcId = inserted.data.id;
    }

    const links: Array<{
      user_id: string;
      arc_id: string;
      resolved_event_id?: string;
      journal_entry_id?: string;
      user_presence: UserPresence;
      temporal_role: TemporalRole;
      sort_time: string;
      importance_score: number;
    }> = [];

    for (const e of cluster.events) {
      const t = new Date(e.start_time);
      links.push({
        user_id: userId,
        arc_id: arcId,
        resolved_event_id: e.id,
        user_presence: eventPresence(e),
        temporal_role: inferTemporalRole(t, anchorStart, anchorEnd),
        sort_time: e.start_time,
        importance_score: cluster.anchorEventIds.includes(e.id) ? 0.9 : 0.6,
      });
    }

    for (const m of moments) {
      const sortTime = m.date ?? m.created_at;
      const t = new Date(sortTime);
      links.push({
        user_id: userId,
        arc_id: arcId,
        journal_entry_id: m.id,
        user_presence: cluster.presence,
        temporal_role: inferTemporalRole(t, anchorStart, anchorEnd),
        sort_time: sortTime,
        importance_score: 0.55,
      });
    }

    if (links.length > 0) {
      const eventLinks = links.filter(l => l.resolved_event_id);
      const journalLinks = links.filter(l => l.journal_entry_id);

      if (eventLinks.length > 0) {
        await supabaseAdmin
          .from('arc_event_links')
          .upsert(eventLinks, { onConflict: 'arc_id,resolved_event_id' });
      }
      if (journalLinks.length > 0) {
        await supabaseAdmin
          .from('arc_event_links')
          .upsert(journalLinks, { onConflict: 'arc_id,journal_entry_id' });
      }
    }

    return true;
  }

  /** Mark concurrent occasion arcs on the same day as overlapped. */
  private async linkOverlappingOccasions(userId: string, sinceIso: string): Promise<void> {
    const { data: occasions } = await supabaseAdmin
      .from('life_arcs')
      .select('id, start_date')
      .eq('user_id', userId)
      .eq('arc_type', 'occasion')
      .gte('start_date', sinceIso.slice(0, 10));

    if (!occasions || occasions.length < 2) return;

    const byDay = new Map<string, string[]>();
    for (const o of occasions) {
      if (!o.start_date) continue;
      const ids = byDay.get(o.start_date) ?? [];
      ids.push(o.id);
      byDay.set(o.start_date, ids);
    }

    for (const [, ids] of byDay) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          await arcRelationshipService
            .upsert(userId, {
              source_arc_id: ids[i],
              target_arc_id: ids[j],
              relationship_type: 'overlapped',
              description: 'Concurrent occasions on the same day',
              confidence: 0.75,
            })
            .catch(() => undefined);
        }
      }
    }
  }
}

export const dayOccasionService = new DayOccasionService();
