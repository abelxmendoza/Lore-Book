/**
 * Explicit Dating & Romance writes from chat — status updates / delete.
 */

import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { identityLedgerService } from '../identity/identityLedgerService';
import { supabaseAdmin } from '../supabaseClient';

import { resolveCharacterByName } from './foundationRecallDataService';

export type RomanceWriteResult = {
  summary: string;
  operation: 'status' | 'delete';
  relationshipId: string | null;
  partnerName: string;
  status: string | null;
};

/** Must match the DB check constraint on romantic_relationships.status. */
const CANONICAL_STATUSES = [
  'active', 'on_break', 'ended', 'complicated', 'paused',
  'ghosted', 'blocked', 'unrequited', 'fading', 'rekindled',
] as const;
type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

type ExistingRomance = {
  id: string;
  status: string;
  metadata: Record<string, unknown> | null;
  characterName: string;
};

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my|with)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map free chat phrasing to the canonical romantic_relationships.status enum. */
function mapRomanceStatus(raw: string): CanonicalStatus | null {
  const s = raw.toLowerCase().trim();
  if (/\b(broke\s*up|breakup|split\s*up|ended?|no\s*longer\s*(dating|together))\b/.test(s)) return 'ended';
  if (/\b(on\s*(?:a\s*)?break|taking\s*space|need(?:ed)?\s*space)\b/.test(s)) return 'on_break';
  if (/\bcomplicated\b/.test(s)) return 'complicated';
  if (/\bpaused?\b/.test(s)) return 'paused';
  if (/\bghost(?:ed|ing)?\b/.test(s)) return 'ghosted';
  if (/\bblock(?:ed)?\b/.test(s)) return 'blocked';
  if (/\bunrequited\b/.test(s)) return 'unrequited';
  if (/\bfad(?:ing|ed)\b/.test(s)) return 'fading';
  if (/\b(rekindl(?:ed|ing)|back\s*together|got\s*back)\b/.test(s)) return 'rekindled';
  if (/\bactive\b/.test(s)) return 'active';
  return null;
}

/** Resolve "with Jamie" style partner names to their live romantic_relationships row. */
async function findRomanceByPartner(userId: string, name: string): Promise<ExistingRomance | null> {
  const character = await resolveCharacterByName(userId, name);
  if (!character) return null;

  const { data, error } = await supabaseAdmin
    .from('romantic_relationships')
    .select('id, status, metadata')
    .eq('user_id', userId)
    .eq('person_id', character.id)
    .eq('person_type', 'character')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, userId, name }, 'romanceWriteService: relationship lookup failed');
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    status: data.status as string,
    metadata: (data.metadata as Record<string, unknown> | null) ?? null,
    characterName: character.name,
  };
}

/**
 * Apply a status correction the same way the Dating & Romance modal does:
 * mark it user_confirmed (so the passive auto-detector never silently
 * reverts it) and record the change in the identity ledger for history.
 */
async function applyStatusUpdate(
  userId: string,
  existing: ExistingRomance,
  nextStatus: CanonicalStatus,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('romantic_relationships')
    .update({
      status: nextStatus,
      is_current: !['ended', 'ghosted', 'blocked'].includes(nextStatus),
      ...(nextStatus === 'ended' ? { end_date: now } : {}),
      ...(nextStatus === 'active' ? { end_date: null } : {}),
      updated_at: now,
      metadata: {
        ...(existing.metadata ?? {}),
        status_source: 'user_confirmed',
        status_confirmed_at: now,
      },
    })
    .eq('id', existing.id)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Could not update the relationship status: ${error.message}`);
  }

  identityLedgerService
    .recordMutation({
      userId,
      entityId: existing.id,
      entityType: 'romantic_relationship',
      mutationType: 'ENTITY_UPDATED',
      previousValue: { status: existing.status },
      newValue: { status: nextStatus },
      reason: 'user_corrected_status_via_chat',
      source: 'USER',
      metadata: { partner_name: existing.characterName },
    })
    .catch((err) =>
      logger.warn({ err, userId, entityId: existing.id }, 'Failed to record romance chat correction in identity ledger'),
    );
}

export async function writeRomanceFromChat(userId: string, message: string): Promise<RomanceWriteResult> {
  const text = message.trim();

  const del = text.match(
    /\b(?:delete|remove)\s+(?:the\s+)?(?:romance|relationship|dating)\s+(?:record\s+)?(?:for|with)\s+(.{1,60})$/i,
  );
  if (del) {
    const name = cleanName(del[1]);
    const existing = await findRomanceByPartner(userId, name);
    if (!existing) throw new Error(`I couldn't find a romance record for "${name}".`);
    const { error } = await supabaseAdmin
      .from('romantic_relationships')
      .delete()
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (error) throw new Error(`Could not delete the relationship: ${error.message}`);
    return {
      summary: `Deleted the romance record for **${existing.characterName}**.`,
      operation: 'delete',
      relationshipId: existing.id,
      partnerName: existing.characterName,
      status: null,
    };
  }

  // Direct breakup phrasing — "we broke up with Jamie" / "ended things with Jamie".
  const breakup = text.match(
    /\b(?:we\s+)?(?:broke\s*up|ended\s+(?:things|it)|are\s+no\s+longer\s+dating)\s+(?:with\s+)?(.{1,60})$/i,
  );
  if (breakup) {
    const name = cleanName(breakup[1]);
    const existing = await findRomanceByPartner(userId, name);
    if (!existing) throw new Error(`I couldn't find a romance record for "${name}".`);
    await applyStatusUpdate(userId, existing, 'ended');
    return {
      summary: `Marked your relationship with **${existing.characterName}** as ended.`,
      operation: 'status',
      relationshipId: existing.id,
      partnerName: existing.characterName,
      status: 'ended',
    };
  }

  // Free-form lifecycle phrasing — "Jamie and I are on a break", "things are getting
  // complicated with Jamie", "we got back together with Jamie".
  const lifecycle = text.match(
    /\b(.{1,60}?)\s+(?:and\s+i|and\s+me)?\s*(?:are|is|got|and\s+i\s+are)\s+(on\s*(?:a\s*)?break|complicated|paused|ghosted|blocked|unrequited|fading|faded|back\s*together|rekindled)\b/i,
  );
  if (lifecycle) {
    const name = cleanName(lifecycle[1]);
    const mapped = mapRomanceStatus(lifecycle[2]);
    if (mapped) {
      const existing = await findRomanceByPartner(userId, name);
      if (existing) {
        await applyStatusUpdate(userId, existing, mapped);
        return {
          summary: `Marked **${existing.characterName}** as ${mapped.replace(/_/g, ' ')}.`,
          operation: 'status',
          relationshipId: existing.id,
          partnerName: existing.characterName,
          status: mapped,
        };
      }
    }
  }

  // Explicit command — "mark/set Jamie as ended|paused|ghosted|...".
  const status = text.match(/\b(?:mark|set)\s+(.{1,60}?)\s+(?:as|to)\s+(.{1,40})$/i);
  if (status) {
    const name = cleanName(status[1]);
    const mapped = mapRomanceStatus(status[2]);
    if (!mapped) {
      throw new Error(
        `I didn't recognize that status. Try one of: ${CANONICAL_STATUSES.join(', ').replace(/_/g, ' ')}.`,
      );
    }
    const existing = await findRomanceByPartner(userId, name);
    if (!existing) throw new Error(`I couldn't find a romance record for "${name}".`);
    await applyStatusUpdate(userId, existing, mapped);
    return {
      summary: `Marked **${existing.characterName}** as ${mapped.replace(/_/g, ' ')}.`,
      operation: 'status',
      relationshipId: existing.id,
      partnerName: existing.characterName,
      status: mapped,
    };
  }

  throw new Error(
    'Try "mark Jamie as ended", "we broke up with Jamie", "Jamie and I are on a break", or "delete the romance record for Jamie".',
  );
}
