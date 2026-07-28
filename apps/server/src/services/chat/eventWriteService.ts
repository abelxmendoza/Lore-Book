/**
 * Explicit Life Log Event writes from chat — "we played a backyard show at …".
 * Reuses createUserPostedEvent (same path as the Events book composer).
 */

import { createUserPostedEvent } from '../events/userPostedEventService';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';

export type EventWriteResult = {
  summary: string;
  operation: 'create';
  eventId: string;
  eventTitle: string;
  locationName: string | null;
};

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findLocationByName(
  userId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const key = normalizeNameKey(name);
  const { data } = await supabaseAdmin.from('locations').select('id, name, metadata').eq('user_id', userId);
  const hit = (data ?? []).find((row) => {
    const meta = (row.metadata as Record<string, unknown> | null) ?? null;
    if (String(meta?.migration_status ?? '') === 'moved') return false;
    if (meta?.place_book_visible === false) return false;
    if (normalizeNameKey(String(row.name ?? '')) === key) return true;
    const aliases = Array.isArray(meta?.aliases) ? (meta!.aliases as unknown[]) : [];
    return aliases.some((a) => typeof a === 'string' && normalizeNameKey(a) === key);
  });
  if (!hit) return null;
  return { id: hit.id as string, name: hit.name as string };
}

/**
 * Parse patterns like:
 * - "we played a backyard show at Northwind Depot"
 * - "post an event: House Show at Ritual Coffee on 2024-06-01"
 * - "add a life log event called Backyard Flyer Show at the amphitheater"
 * - "save event Birthday at Marcus's house"
 */
export function parseEventWriteRequest(message: string): {
  title: string;
  locationName: string | null;
  dateIso: string | null;
  story: string | null;
} | null {
  const text = message.trim();
  if (!text) return null;

  const dated = text.match(
    /\b(?:post|add|save|create)\s+(?:an?\s+)?(?:life\s*log\s+)?event\b[:\s]+(.{1,80}?)\s+(?:at|@)\s+(.{1,60}?)(?:\s+on\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2}(?:,\s*\d{4})?))?(?:\s*[-—:]\s*(.{1,200}))?$/i,
  );
  if (dated) {
    return {
      title: cleanName(dated[1]),
      locationName: cleanName(dated[2]),
      dateIso: dated[3] ? normalizeLooseDate(dated[3]) : null,
      story: dated[4]?.trim() || null,
    };
  }

  const played = text.match(
    /\b(?:we|i)\s+(?:played|hosted|threw)\s+(?:a\s+|an\s+|the\s+)?(.{1,80}?)\s+(?:at|@)\s+(.{1,60})$/i,
  );
  if (played) {
    return {
      title: cleanName(played[1]),
      locationName: cleanName(played[2]),
      dateIso: null,
      story: text,
    };
  }

  const namedHappening = text.match(
    /\b(?:we|i)\s+(?:went\s+to|had)\s+(?:a\s+|an\s+|the\s+)?((?:show|gig|concert|party|festival|event|birthday|wedding|meetup|open\s*mic).{0,40}?)\s+(?:at|@)\s+(.{1,60})$/i,
  );
  if (namedHappening) {
    return {
      title: cleanName(namedHappening[1]),
      locationName: cleanName(namedHappening[2]),
      dateIso: null,
      story: text,
    };
  }

  const saveEvent = text.match(
    /\b(?:save|add|post)\s+(?:an?\s+)?event\s+(?:called\s+|named\s+)?(.{1,80}?)\s+(?:at|@)\s+(.{1,60})$/i,
  );
  if (saveEvent) {
    return {
      title: cleanName(saveEvent[1]),
      locationName: cleanName(saveEvent[2]),
      dateIso: null,
      story: null,
    };
  }

  return null;
}

function normalizeLooseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export async function writeEventFromChat(
  userId: string,
  message: string,
): Promise<EventWriteResult> {
  const parsed = parseEventWriteRequest(message);
  if (!parsed || !parsed.title) {
    throw new Error(
      'Try “we played a backyard show at Northwind Depot” or “post an event: House Show at Ritual Coffee”.',
    );
  }

  let locationId: string | null = null;
  let locationName = parsed.locationName;
  if (locationName) {
    const existing = await findLocationByName(userId, locationName);
    if (existing) {
      locationId = existing.id;
      locationName = existing.name;
    }
  }

  const startTime = parsed.dateIso
    ? new Date(`${parsed.dateIso}T12:00:00.000Z`).toISOString()
    : new Date().toISOString();

  const created = await createUserPostedEvent(userId, {
    title: parsed.title,
    start_time: startTime,
    location_id: locationId,
    location_name: locationName,
    story: parsed.story,
  });

  const placeBit = locationName ? ` at **${locationName}**` : '';
  return {
    summary: `Posted **${created.title}**${placeBit} to your Life Log.`,
    operation: 'create',
    eventId: created.id,
    eventTitle: created.title,
    locationName,
  };
}
