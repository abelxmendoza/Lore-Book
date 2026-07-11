/**
 * Membership inference — "X is in <group>" statements from conversation.
 *
 * Conservative by design: a membership edge is only inferred when the message
 * EXPLICITLY states membership ("Poppy is in Static Petals", "I joined the
 * chess club", "Marco plays bass for Voltra") AND both sides resolve to
 * already-known records (a character card and an organization by name/alias).
 * Co-occurrence alone never creates membership — that's groupDetection's
 * separate, gated candidate flow.
 *
 * Inferred rows carry a '[inferred]' notes marker with message provenance and
 * NEVER overwrite a user-managed row ("leaves" only close inferred rows).
 */

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

export type MembershipStatement = {
  memberName: string;
  orgName: string;
  action: 'join' | 'member' | 'leave';
  role?: string;
};

const MEMBER_PATTERNS: Array<{ re: RegExp; action: MembershipStatement['action']; roleGroup?: number }> = [
  // "Poppy is in Static Petals" / "Poppy is part of Static Petals"
  { re: /\b([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+)?)\s+is\s+(?:in|part of|a member of)\s+(?:the\s+)?([A-Z][\w'’&. -]{2,60})/g, action: 'member' },
  // "Poppy joined Static Petals"
  { re: /\b([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+)?)\s+(?:joined|signed with)\s+(?:the\s+)?([A-Z][\w'’&. -]{2,60})/g, action: 'join' },
  // "Marco plays bass for/in Voltra" (role captured)
  { re: /\b([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+)?)\s+(?:plays|sings|drums)\s*([\w ]{0,20}?)\s+(?:for|in|with)\s+(?:the\s+)?([A-Z][\w'’&. -]{2,60})/g, action: 'member', roleGroup: 2 },
  // "Poppy left/quit Static Petals"
  { re: /\b([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+)?)\s+(?:left|quit|is no longer in)\s+(?:the\s+)?([A-Z][\w'’&. -]{2,60})/g, action: 'leave' },
];

/** Extract explicit membership statements. Pure — no DB, no LLM. */
export function extractMembershipStatements(text: string): MembershipStatement[] {
  const out: MembershipStatement[] = [];
  for (const { re, action, roleGroup } of MEMBER_PATTERNS) {
    const rx = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      const memberName = m[1]?.trim();
      const orgName = (roleGroup ? m[3] : m[2])?.trim().replace(/[.,;:!?]+$/, '');
      const role = roleGroup ? m[roleGroup]?.trim() || undefined : undefined;
      if (!memberName || !orgName || memberName.toLowerCase() === orgName.toLowerCase()) continue;
      out.push({ memberName, orgName, action, role });
    }
  }
  return out;
}

class MembershipInferenceService {
  /**
   * Resolve statements against KNOWN orgs + characters and upsert membership
   * edges. Unknown names are ignored (creation stays with the existing
   * suggestion flows) — inference only connects records that already exist.
   */
  async processMessage(userId: string, text: string, messageId?: string): Promise<number> {
    const statements = extractMembershipStatements(text);
    if (statements.length === 0) return 0;

    try {
      const [{ data: orgs }, { data: chars }] = await Promise.all([
        supabaseAdmin.from('organizations').select('id, name, aliases').eq('user_id', userId).limit(500),
        supabaseAdmin.from('characters').select('id, name, alias').eq('user_id', userId).limit(1000),
      ]);
      if (!orgs?.length || !chars?.length) return 0;

      const orgByKey = new Map<string, { id: string; name: string }>();
      for (const o of orgs) {
        orgByKey.set(String(o.name ?? '').trim().toLowerCase(), { id: o.id, name: o.name });
        for (const a of o.aliases ?? []) orgByKey.set(String(a).trim().toLowerCase(), { id: o.id, name: o.name });
      }
      const charByKey = new Map<string, { id: string; name: string }>();
      for (const c of chars) {
        charByKey.set(String(c.name ?? '').trim().toLowerCase(), { id: c.id, name: c.name });
        for (const a of c.alias ?? []) charByKey.set(String(a).trim().toLowerCase(), { id: c.id, name: c.name });
      }

      // Greedy captures can trail lowercase words ("Static Petals now") —
      // resolve by progressively trimming trailing tokens until a known org matches.
      const resolveOrg = (raw: string) => {
        const tokens = raw.split(/\s+/);
        for (let end = tokens.length; end > 0; end--) {
          const hit = orgByKey.get(tokens.slice(0, end).join(' ').toLowerCase());
          if (hit) return hit;
        }
        return undefined;
      };

      let applied = 0;
      for (const st of statements) {
        const org = resolveOrg(st.orgName);
        const member = charByKey.get(st.memberName.toLowerCase());
        if (!org || !member) continue;

        const { data: existing } = await supabaseAdmin
          .from('organization_members')
          .select('id, status, notes')
          .eq('user_id', userId)
          .eq('organization_id', org.id)
          .eq('character_id', member.id)
          .maybeSingle();

        if (st.action === 'leave') {
          // Close only rows we inferred — never touch user-managed memberships.
          if (existing && String(existing.notes ?? '').startsWith('[inferred]')) {
            await supabaseAdmin
              .from('organization_members')
              .update({ status: 'former', left_at: new Date().toISOString() })
              .eq('id', existing.id);
            applied += 1;
          }
          continue;
        }

        if (existing) continue; // already connected — nothing to infer

        const { error } = await supabaseAdmin.from('organization_members').insert({
          user_id: userId,
          organization_id: org.id,
          character_id: member.id,
          character_name: member.name,
          role: st.role || null,
          status: 'active',
          // organization_members has no metadata column — provenance lives in
          // notes with the [inferred] marker that gates automated updates.
          notes: `[inferred] from conversation${messageId ? ` (message ${messageId})` : ''}: "${st.memberName} — ${st.orgName}"`,
        });
        if (!error) applied += 1;
      }
      if (applied > 0) {
        logger.info({ userId, applied }, 'Membership inference applied explicit statements');
      }
      return applied;
    } catch (err) {
      logger.debug({ err, userId }, 'Membership inference failed (non-fatal)');
      return 0;
    }
  }
}

export const membershipInferenceService = new MembershipInferenceService();
