/**
 * Explicit Dating & Romance writes from chat — status updates / delete.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';

export type RomanceWriteResult = {
  summary: string;
  operation: 'status' | 'delete';
  relationshipId: string | null;
  partnerName: string;
  status: string | null;
};

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my|with)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapRomanceStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, '_');
  if (s.includes('broke') || s === 'ex') return 'ex';
  if (s.includes('no_contact') || s === 'nocontact') return 'no_contact';
  if (s.includes('complicated')) return 'complicated';
  if (s.includes('crush')) return 'crush';
  if (s.includes('married') || s.includes('partner')) return 'partner';
  if (s.includes('dating')) return 'dating';
  return s;
}

async function findRomanceByPartner(userId: string, name: string) {
  const key = normalizeNameKey(name);
  const { data } = await supabaseAdmin
    .from('romantic_relationships')
    .select('id, status, partner_name, character_id, metadata')
    .eq('user_id', userId);
  return (
    (data ?? []).find((row) => {
      if (normalizeNameKey(String(row.partner_name ?? '')) === key) return true;
      const aliases = Array.isArray((row.metadata as Record<string, unknown> | null)?.aliases)
        ? (((row.metadata as Record<string, unknown>).aliases as unknown[]) ?? [])
        : [];
      return aliases.some((a) => typeof a === 'string' && normalizeNameKey(a) === key);
    }) ?? null
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
    await supabaseAdmin
      .from('romantic_relationships')
      .delete()
      .eq('id', existing.id)
      .eq('user_id', userId);
    return {
      summary: `Deleted the romance record for **${existing.partner_name ?? name}**.`,
      operation: 'delete',
      relationshipId: existing.id as string,
      partnerName: String(existing.partner_name ?? name),
      status: null,
    };
  }

  const breakup = text.match(
    /\b(?:we\s+)?(?:broke\s*up|ended\s+(?:things|it)|are\s+no\s+longer\s+dating)\s+(?:with\s+)?(.{1,60})$/i,
  );
  if (breakup) {
    const name = cleanName(breakup[1]);
    const existing = await findRomanceByPartner(userId, name);
    if (!existing) throw new Error(`I couldn't find a romance record for "${name}".`);
    await supabaseAdmin
      .from('romantic_relationships')
      .update({ status: 'ex', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId);
    return {
      summary: `Marked your relationship with **${existing.partner_name ?? name}** as ex.`,
      operation: 'status',
      relationshipId: existing.id as string,
      partnerName: String(existing.partner_name ?? name),
      status: 'ex',
    };
  }

  const status = text.match(
    /\b(?:mark|set)\s+(.{1,60}?)\s+(?:as\s+)?(dating|ex|broke\s*up|no\s*contact|complicated|crush|partner|married)\b/i,
  );
  if (status) {
    const name = cleanName(status[1]);
    const next = mapRomanceStatus(status[2]);
    const existing = await findRomanceByPartner(userId, name);
    if (!existing) throw new Error(`I couldn't find a romance record for "${name}".`);
    await supabaseAdmin
      .from('romantic_relationships')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId);
    return {
      summary: `Marked **${existing.partner_name ?? name}** as ${next.replace(/_/g, ' ')}.`,
      operation: 'status',
      relationshipId: existing.id as string,
      partnerName: String(existing.partner_name ?? name),
      status: next,
    };
  }

  throw new Error('Try “mark Jamie as dating”, “we broke up with Jamie”, or “delete the romance record for Jamie”.');
}
