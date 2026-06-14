// =====================================================
// SOCIETY MAPPING SERVICE (orchestration)
// Purpose: Periodically read a user's WHOLE history (all conversations + journal
//          entries), reduce each to its people + signals, then run the pure
//          society mapper to:
//            • link employers/agencies/schools to their people across sessions,
//            • cluster recurring co-mentions into typed social groups,
//            • infer org↔org affiliations (agency → workplace).
//
//          High-confidence named results (employers/institutions with members)
//          auto-create via the existing candidate pipeline; fuzzier social
//          clusters surface as review candidates. Everything is idempotent:
//          clusters carry a stable source id so re-runs never inflate counts.
//
// Cost model: deterministic + cached only. No LLM calls in this phase. The
//             aggregation reuses the 60s character-name cache, and work is
//             bounded per user.
// =====================================================

import { logger } from '../../logger';
import { characterConnectionService } from '../characterConnectionService';
import { groupCandidateService } from '../groupCandidateService';
import { groupDetectionService } from '../groupDetectionService';
import { organizationService } from '../organizationService';
import { supabaseAdmin } from '../supabaseClient';
import {
  extractPublicEntityNames,
  extractSignalCategories,
  HIRING_PLACEMENT_SIGNAL,
  STAFFING_SIGNAL,
} from './signals';
import { mapSociety, type SocietyContext } from './societyMapper';
import { societyResolver } from './societyResolver';

interface MapUserOptions {
  sinceDays?: number;
  messageCap?: number;
  journalCap?: number;
  dryRun?: boolean;
}

interface MapUserSummary {
  contexts: number;
  clusters: number;
  affiliations: number;
  applied: boolean;
}

class SocietyMappingService {
  async mapUser(userId: string, options: MapUserOptions = {}): Promise<MapUserSummary> {
    const sinceDays = options.sinceDays ?? 365;
    const messageCap = options.messageCap ?? 2000;
    const journalCap = options.journalCap ?? 500;
    const dryRun = options.dryRun ?? false;
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    const contexts = await this.buildContexts(userId, cutoff, messageCap, journalCap);
    if (contexts.length === 0) {
      return { contexts: 0, clusters: 0, affiliations: 0, applied: false };
    }

    const mapped = mapSociety(contexts);

    // Feedback loop: drop clusters the user already dismissed BEFORE spending an
    // LLM call resolving them (and before re-surfacing). The ingest path also
    // re-checks, but filtering here saves the resolver cost.
    const survivors: typeof mapped.clusters = [];
    for (const cluster of mapped.clusters) {
      if (await groupCandidateService.wasRejected(userId, cluster.memberNames, cluster.name)) continue;
      survivors.push(cluster);
    }

    // Phase 3: one batched LLM pass to name/classify the fuzzy social clusters
    // the rules couldn't settle. Falls back to deterministic results on error.
    const clusters = await societyResolver.resolve(userId, survivors);
    const affiliations = mapped.affiliations;

    if (dryRun) {
      logger.info(
        { userId, contexts: contexts.length, clusters: clusters.length, affiliations: affiliations.length,
          preview: clusters.map(c => ({ name: c.name, type: c.group_type, members: c.memberNames, conf: c.confidence })) },
        'SocietyMapping (dry-run): would create'
      );
      return { contexts: contexts.length, clusters: clusters.length, affiliations: affiliations.length, applied: false };
    }

    // 1. Persist clusters through the existing candidate/auto-create pipeline,
    //    each under its own stable source id so re-runs are idempotent.
    for (const cluster of clusters) {
      try {
        await groupCandidateService.ingestExternalDetections(
          userId,
          [{
            name: cluster.name,
            members: cluster.memberNames,
            member_ids: cluster.memberIds,
            context: cluster.context,
            confidence: cluster.confidence,
            group_type: cluster.group_type,
            membership_model: cluster.membership_model,
            user_relationship: cluster.user_relationship,
            is_public_entity: cluster.is_public_entity,
            metadata: cluster.metadata,
          }],
          cluster.key
        );
      } catch (error) {
        logger.debug({ error, userId, cluster: cluster.name }, 'SocietyMapping: failed to ingest cluster');
      }
    }

    // 2. Infer org↔org affiliations (agency → workplace).
    let appliedAffiliations = 0;
    for (const affiliation of affiliations) {
      try {
        const applied = await this.applyAffiliation(userId, affiliation.fromName, affiliation.toName, affiliation.type, affiliation.notes);
        if (applied) appliedAffiliations += 1;
      } catch (error) {
        logger.debug({ error, userId, affiliation }, 'SocietyMapping: failed to apply affiliation');
      }
    }

    logger.info(
      { userId, contexts: contexts.length, clusters: clusters.length, affiliations: appliedAffiliations },
      'SocietyMapping: applied'
    );
    return { contexts: contexts.length, clusters: clusters.length, affiliations: appliedAffiliations, applied: true };
  }

  /** Reduce a user's chat sessions + journal entries to society contexts. */
  private async buildContexts(userId: string, cutoff: string, messageCap: number, journalCap: number): Promise<SocietyContext[]> {
    const contexts: SocietyContext[] = [];

    // Chat: group user messages by session so co-occurrence spans the whole
    // conversation, not a single turn.
    try {
      const { data: msgs } = await supabaseAdmin
        .from('chat_messages')
        .select('id, session_id, content, created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(messageCap);

      const bySession = new Map<string, string[]>();
      for (const m of (msgs ?? []) as Array<{ id: string; session_id: string | null; content: string }>) {
        const key = m.session_id ? `conv:${m.session_id}` : `msg:${m.id}`;
        const list = bySession.get(key) ?? [];
        list.push(m.content ?? '');
        bySession.set(key, list);
      }

      for (const [baseId, texts] of bySession) {
        contexts.push(...await this.toContexts(userId, baseId, texts.join('\n')));
      }
    } catch (error) {
      logger.debug({ error, userId }, 'SocietyMapping: chat scan failed');
    }

    // Journal: each entry is its own context.
    try {
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, date')
        .eq('user_id', userId)
        .gte('date', cutoff)
        .order('date', { ascending: true })
        .limit(journalCap);

      for (const e of (entries ?? []) as Array<{ id: string; content: string }>) {
        contexts.push(...await this.toContexts(userId, `journal:${e.id}`, e.content ?? ''));
      }
    } catch (error) {
      logger.debug({ error, userId }, 'SocietyMapping: journal scan failed');
    }

    return contexts;
  }

  /**
   * Split one session/entry into small windows (≈1–2 sentences) and turn each
   * into a context. Fine granularity is what keeps co-occurrence honest: people
   * are only linked when mentioned together in the same breath, not merely in
   * the same long life-update. Cross-session strength still accumulates because
   * windows from different sessions all feed the same graph.
   */
  private async toContexts(userId: string, baseId: string, text: string): Promise<SocietyContext[]> {
    const windows = this.splitIntoWindows(text);
    const out: SocietyContext[] = [];
    let i = 0;
    for (const window of windows) {
      const members = await groupDetectionService.extractMembers(userId, window);
      const employerNames = groupDetectionService.extractEmployerNamesPublic(window);
      if (members.length === 0 && employerNames.length === 0) continue;
      out.push({
        contextId: `${baseId}#${i++}`,
        members,
        signals: extractSignalCategories(window),
        employerNames,
        publicEntityNames: extractPublicEntityNames(window),
        hiringPlacement: HIRING_PLACEMENT_SIGNAL.test(window),
        staffing: STAFFING_SIGNAL.test(window),
        snippet: window.slice(0, 200),
      });
    }
    return out;
  }

  private static readonly MAX_WINDOWS_PER_SOURCE = 80;
  private static readonly WINDOW_CHARS = 240;

  /** Greedy sentence packing into ~240-char windows. */
  private splitIntoWindows(text: string): string[] {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
    const windows: string[] = [];
    let buf = '';
    for (const sentence of sentences) {
      if (buf && (buf.length + sentence.length) > SocietyMappingService.WINDOW_CHARS) {
        windows.push(buf);
        buf = sentence;
      } else {
        buf = buf ? `${buf} ${sentence}` : sentence;
      }
      if (windows.length >= SocietyMappingService.MAX_WINDOWS_PER_SOURCE) break;
    }
    if (buf && windows.length < SocietyMappingService.MAX_WINDOWS_PER_SOURCE) windows.push(buf);
    return windows;
  }

  /** Find (or create) both org endpoints and link them if not already linked. */
  private async applyAffiliation(
    userId: string,
    fromName: string,
    toName: string,
    type: Parameters<typeof organizationService.addRelationship>[3],
    notes?: string
  ): Promise<boolean> {
    const from = await this.findOrgByName(userId, fromName);
    if (!from) return false; // never invent the agency side
    const to = await this.findOrCreateWorkplace(userId, toName);
    if (!to) return false;
    if (from === to) return false;

    const existing = await organizationService.getRelationships(userId, from);
    if (existing.some(r => (r.from_org_id === from && r.to_org_id === to) || (r.from_org_id === to && r.to_org_id === from))) {
      return false;
    }
    await organizationService.addRelationship(userId, from, to, type, notes);
    return true;
  }

  private async findOrgByName(userId: string, name: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('user_id', userId)
      .or(`name.ilike.${name},aliases.cs.{${name}}`)
      .limit(1);
    return (data ?? [])[0]?.id ?? null;
  }

  private async findOrCreateWorkplace(userId: string, name: string): Promise<string | null> {
    const existing = await this.findOrgByName(userId, name);
    if (existing) return existing;
    try {
      const org = await organizationService.createOrganization(userId, {
        name,
        aliases: [],
        group_type: 'company',
        type: 'company',
        membership_model: 'fuzzy',
        user_relationship: 'member',
        is_public_entity: false,
        description: `Workplace linked automatically from a hiring/placement mention.`,
        status: 'active',
        metadata: { source: 'society_mapper', anchor: 'workplace' },
      });
      return org.id;
    } catch {
      return null;
    }
  }
}

export const societyMappingService = new SocietyMappingService();
