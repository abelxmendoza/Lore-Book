/**
 * User↔organization relationship-state transitions — "I applied to X",
 * "interviewing with X", "started at X", "left X".
 *
 * Conservative by design, mirrors membershipInferenceService.ts: pure regex,
 * no LLM, and the organization must already resolve to a known record (name
 * or alias) — this never fabricates an organization.
 *
 * On a match: updates organizations.user_relationship (+ started_at/ended_at
 * for the CURRENT state) and appends one row to
 * organization_relationship_history so every transition is preserved even
 * though the "current state" columns get overwritten on each change.
 */

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import type { UserRelationship } from './organizationService';

export type RelationshipTransitionStatement = {
  orgName: string;
  toRelationship: UserRelationship;
  evidence: string;
  setStartedAt?: boolean;
  setEndedAt?: boolean;
};

const TRANSITION_PATTERNS: Array<{
  re: RegExp;
  toRelationship: UserRelationship;
  setStartedAt?: boolean;
  setEndedAt?: boolean;
}> = [
  {
    re: /\bapplied to\s+(?:the\s+)?([A-Z][\w'’&. -]{1,60})/g,
    toRelationship: 'applicant',
  },
  {
    re: /\b(?:interviewing with|interview with|had an interview with)\s+(?:the\s+)?([A-Z][\w'’&. -]{1,60})/g,
    toRelationship: 'interview_candidate',
  },
  {
    re: /\b(?:got (?:the|an) offer from|hired at|hired by|started at|starting at|joined)\s+(?:the\s+)?([A-Z][\w'’&. -]{1,60})/g,
    toRelationship: 'employee',
    setStartedAt: true,
  },
  {
    re: /\b(?:left|quit|resigned from|laid off from|fired from)\s+(?:the\s+)?([A-Z][\w'’&. -]{1,60})/g,
    toRelationship: 'former_employee',
    setEndedAt: true,
  },
];

/** Extract explicit relationship-transition statements. Pure — no DB, no LLM. */
export function extractRelationshipTransitions(text: string): RelationshipTransitionStatement[] {
  const out: RelationshipTransitionStatement[] = [];
  for (const { re, toRelationship, setStartedAt, setEndedAt } of TRANSITION_PATTERNS) {
    const rx = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      const orgName = m[1]?.trim().replace(/[.,;:!?]+$/, '');
      if (!orgName) continue;
      out.push({ orgName, toRelationship, evidence: m[0].trim(), setStartedAt, setEndedAt });
    }
  }
  return out;
}

class OrganizationRelationshipStateService {
  /**
   * Resolve statements against KNOWN organizations (by name/alias) and record
   * the transition. Unknown organization names are ignored — this only
   * connects records that already exist, the same rule membershipInferenceService
   * follows for membership edges.
   */
  async processMessage(userId: string, text: string, messageId?: string): Promise<number> {
    const statements = extractRelationshipTransitions(text);
    if (statements.length === 0) return 0;

    try {
      const { data: orgs } = await supabaseAdmin
        .from('organizations')
        .select('id, name, aliases, user_relationship')
        .eq('user_id', userId)
        .limit(500);
      if (!orgs?.length) return 0;

      type OrgRow = { id: string; name: string; user_relationship: string };
      const orgByKey = new Map<string, OrgRow>();
      for (const o of orgs as Array<OrgRow & { aliases?: string[] | null }>) {
        orgByKey.set(String(o.name ?? '').trim().toLowerCase(), o);
        for (const a of o.aliases ?? []) orgByKey.set(String(a).trim().toLowerCase(), o);
      }

      // Greedy captures can trail lowercase words ("Amazon for the role") —
      // resolve by progressively trimming trailing tokens until a known org
      // matches, same approach as membershipInferenceService.resolveOrg.
      const resolveOrg = (raw: string): OrgRow | undefined => {
        const tokens = raw.split(/\s+/);
        for (let end = tokens.length; end > 0; end--) {
          const hit = orgByKey.get(tokens.slice(0, end).join(' ').toLowerCase());
          if (hit) return hit;
        }
        return undefined;
      };

      let applied = 0;
      const now = new Date().toISOString();
      for (const st of statements) {
        const org = resolveOrg(st.orgName);
        if (!org || org.user_relationship === st.toRelationship) continue;

        const patch: Record<string, unknown> = {
          user_relationship: st.toRelationship,
          updated_at: now,
        };
        if (st.setStartedAt) patch.user_relationship_started_at = now;
        if (st.setEndedAt) patch.user_relationship_ended_at = now;

        const { error: updateError } = await supabaseAdmin
          .from('organizations')
          .update(patch)
          .eq('id', org.id)
          .eq('user_id', userId);
        if (updateError) continue;

        const { error: historyError } = await supabaseAdmin
          .from('organization_relationship_history')
          .insert({
            user_id: userId,
            organization_id: org.id,
            from_relationship: org.user_relationship,
            to_relationship: st.toRelationship,
            evidence: st.evidence,
            confidence: 0.85,
            source_message_id: messageId ?? null,
          });
        if (!historyError) applied += 1;
      }

      if (applied > 0) {
        logger.info({ userId, applied }, 'Organization relationship state transitions applied');
      }
      return applied;
    } catch (err) {
      logger.debug({ err, userId }, 'Organization relationship state inference failed (non-fatal)');
      return 0;
    }
  }
}

export const organizationRelationshipStateService = new OrganizationRelationshipStateService();
