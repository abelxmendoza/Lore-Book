/**
 * Explicit swim-lane life arc writes from chat — rename / re-lane / re-date.
 * Same shape as locationWriteService.ts/projectWriteService.ts: regex
 * extraction, no LLM field parsing, applied through the existing arcService
 * CRUD (no parallel write path).
 */
import { arcService, type ArcTrack } from '../continuityRuntime/arcs/arcService';

export type LifeArcWriteResult = {
  summary: string;
  operation: 'rename' | 'relane' | 'redate';
  arcId: string;
  arcTitle: string;
};

const TRACK_VALUES: ArcTrack[] = ['career', 'romance', 'relationships', 'creative', 'health', 'inner', 'mixed', 'custom'];

function cleanTitle(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findArcByTitle(userId: string, title: string) {
  const key = cleanTitle(title).toLowerCase();
  const arcs = await arcService.listForUser(userId);
  return arcs.find((a) => a.title.trim().toLowerCase() === key) ?? null;
}

function parseLane(raw: string): ArcTrack | null {
  const key = cleanTitle(raw).toLowerCase();
  return TRACK_VALUES.find((t) => t === key) ?? null;
}

/**
 * Deliberately narrow, honest date-range parser — matches the platform's
 * stance against fabricating precision. Supports what a chat message can
 * unambiguously express: a bare year, a year range, "YYYY-ongoing", or exact
 * ISO dates. Anything else asks the user to be more specific rather than
 * guessing.
 */
function parseDateRange(raw: string): { start_date: string; end_date: string | null } {
  const text = cleanTitle(raw);

  const isoRange = text.match(/^(\d{4}-\d{2}-\d{2})\s*(?:to|–|-)\s*(\d{4}-\d{2}-\d{2})$/);
  if (isoRange) return { start_date: isoRange[1], end_date: isoRange[2] };

  const isoSingle = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoSingle) return { start_date: isoSingle[1], end_date: isoSingle[1] };

  const ongoing = text.match(/^(\d{4})\s*(?:–|-)?\s*ongoing$/i);
  if (ongoing) return { start_date: `${ongoing[1]}-01-01`, end_date: null };

  const yearRange = text.match(/^(\d{4})\s*(?:–|-|to)\s*(\d{4})$/);
  if (yearRange) return { start_date: `${yearRange[1]}-01-01`, end_date: `${yearRange[2]}-12-31` };

  const yearOnly = text.match(/^(\d{4})$/);
  if (yearOnly) return { start_date: `${yearOnly[1]}-01-01`, end_date: `${yearOnly[1]}-12-31` };

  throw new Error(
    `I couldn't parse "${text}" as a date. Try a year ("2019"), a year range ("2019 to 2021"), "2019-ongoing", or exact dates ("2019-03-15 to 2019-06-01").`,
  );
}

export async function writeLifeArcFromChat(userId: string, message: string): Promise<LifeArcWriteResult> {
  const text = message.trim();

  const rename = text.match(/\b(?:rename)\s+(?:the\s+|my\s+)?arc\s+(.{1,60}?)\s+to\s+(.{1,60})$/i);
  if (rename) {
    const from = cleanTitle(rename[1]);
    const to = cleanTitle(rename[2]);
    const existing = await findArcByTitle(userId, from);
    if (!existing) throw new Error(`I couldn't find an arc named "${from}" to rename.`);
    const updated = await arcService.update(userId, existing.id, { title: to });
    return {
      summary: `Renamed the arc **${existing.title}** to **${updated.title}**.`,
      operation: 'rename',
      arcId: updated.id,
      arcTitle: updated.title,
    };
  }

  const relane = text.match(/\b(?:move|put)\s+(?:the\s+|my\s+)?arc\s+(.{1,60}?)\s+(?:to|into)\s+(?:my\s+|the\s+)?(.{1,30}?)\s+lane\b/i);
  if (relane) {
    const arcName = cleanTitle(relane[1]);
    const lane = parseLane(relane[2]);
    if (!lane) {
      throw new Error(
        `I don't recognize "${cleanTitle(relane[2])}" as a lane. Lanes are: ${TRACK_VALUES.join(', ')}.`,
      );
    }
    const existing = await findArcByTitle(userId, arcName);
    if (!existing) throw new Error(`I couldn't find an arc named "${arcName}" to move.`);
    const updated = await arcService.update(userId, existing.id, { track: lane });
    return {
      summary: `Moved the arc **${existing.title}** to your **${lane}** lane.`,
      operation: 'relane',
      arcId: updated.id,
      arcTitle: updated.title,
    };
  }

  const redate = text.match(/\b(?:set|change)\s+(?:the\s+)?(?:dates?|time\s*frame|when)\s+(?:of|for)\s+(?:the\s+|my\s+)?arc\s+(.{1,60}?)\s+to\s+(.{1,60})$/i);
  if (redate) {
    const arcName = cleanTitle(redate[1]);
    const existing = await findArcByTitle(userId, arcName);
    if (!existing) throw new Error(`I couldn't find an arc named "${arcName}" to reschedule.`);
    const { start_date, end_date } = parseDateRange(redate[2]);
    const updated = await arcService.update(userId, existing.id, { start_date, end_date });
    const range = updated.end_date ? `${updated.start_date} – ${updated.end_date}` : `${updated.start_date} – ongoing`;
    return {
      summary: `Updated the arc **${existing.title}** to ${range}.`,
      operation: 'redate',
      arcId: updated.id,
      arcTitle: updated.title,
    };
  }

  throw new Error(
    'Try "rename the arc X to Y", "move the arc X to my Creative lane", or "change the dates of arc X to 2019 to 2021".',
  );
}
