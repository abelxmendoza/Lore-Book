/**
 * Materialize Events from spatial references the place pipeline rejected as events.
 *
 * The Spatial Context Resolver tags "Ink Fest", "Ink's Ska Prom", "Gemini Show"
 * etc. as EVENT/MUSIC_EVENT so they don't leak into Places. This turns those tags
 * into actual Event cards — deduped by title, so it's idempotent and safe to call
 * repeatedly during ingestion.
 */
import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { classifySpatialReference } from '../lorebook/quality/spatialContextResolver';

import { EventStorage } from './storageService';

export interface SpatialEventRef {
  /** The candidate text the place guard rejected as an event. */
  name: string;
  /** A source line for context / provenance. */
  evidence?: string;
}

export async function materializeSpatialEvents(
  userId: string,
  refs: SpatialEventRef[],
  deps: { storage?: EventStorage } = {},
): Promise<{ created: number; eventIds: string[] }> {
  // Re-classify each ref and keep only genuine events (strips the organizer:
  // "Ink's Ska Prom" → title "Ska Prom", organizer "Ink").
  const events: Array<{ title: string; organizer?: string; evidence?: string }> = [];
  const seen = new Set<string>();
  for (const r of refs) {
    const cls = classifySpatialReference(r.name);
    if (cls.referenceType !== 'event') continue;
    const title = (cls.eventName || r.name).trim();
    const key = normalizeNameKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    events.push({ title, organizer: cls.organizer, evidence: r.evidence });
  }
  if (events.length === 0) return { created: 0, eventIds: [] };

  const storage = deps.storage ?? new EventStorage();
  const existing = await storage.loadAll(userId).catch(() => []);
  const existingTitles = new Set(existing.map((e) => normalizeNameKey(e.canonical_title)));

  const eventIds: string[] = [];
  for (const ev of events) {
    const key = normalizeNameKey(ev.title);
    if (existingTitles.has(key)) continue; // idempotent — never duplicate an event
    existingTitles.add(key);
    const summary = [ev.organizer ? `Organized by ${ev.organizer}.` : '', ev.evidence ?? '']
      .filter(Boolean)
      .join(' ')
      .trim();
    try {
      const created = await storage.createEvent(userId, {
        canonical_title: ev.title,
        summary: summary || undefined,
        confidence: 0.6,
      });
      if (created?.id) eventIds.push(created.id);
      logger.info({ userId, title: ev.title, organizer: ev.organizer }, 'Materialized event from spatial reference');
    } catch (err) {
      logger.debug({ err, userId, title: ev.title }, 'Event materialization failed');
    }
  }
  return { created: eventIds.length, eventIds };
}
