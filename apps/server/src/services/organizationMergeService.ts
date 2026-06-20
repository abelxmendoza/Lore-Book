// =====================================================
// ORGANIZATION MERGE SERVICE
// Purpose: Detect and consolidate duplicate organizations/groups, mirroring the
//          character book's dedup/merge. Re-points all child records (members,
//          stories, events, locations, relationships) onto a surviving primary,
//          unions metadata/aliases, and deletes the duplicate.
// =====================================================

import { logger } from '../logger';
import { identityLedgerService } from './identity/identityLedgerService';
import { supabaseAdmin } from './supabaseClient';
import { normalizeNameKey, namesOverlapByContainment } from '../utils/nameNormalization';

interface OrgRow {
  id: string;
  name: string;
  aliases?: string[] | null;
  description?: string | null;
  usage_count?: number | null;
  confidence?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export interface DuplicateCluster {
  primary_id: string;
  primary_name: string;
  duplicate_ids: string[];
  names: string[];
  reason: 'same_name' | 'member_overlap';
}

export interface OrgMergeReport {
  primary_id: string;
  merged_ids: string[];
  members_moved: number;
  members_deduped: number;
  records_moved: number;
}

class OrganizationMergeService {
  /**
   * Find clusters of likely-duplicate organizations for a user.
   * Two orgs are duplicates when their names match (normalized / containment)
   * or they share a strong majority of members.
   */
  async findDuplicates(userId: string): Promise<DuplicateCluster[]> {
    const { data: orgs, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, aliases, usage_count, confidence, created_at')
      .eq('user_id', userId);

    if (error || !orgs || orgs.length < 2) return [];

    // Member sets per org (for overlap detection).
    const memberMap = new Map<string, Set<string>>();
    for (const org of orgs as OrgRow[]) {
      const { data: members } = await supabaseAdmin
        .from('organization_members')
        .select('character_name')
        .eq('organization_id', org.id);
      memberMap.set(
        org.id,
        new Set(((members ?? []) as Array<{ character_name: string }>).map(m => m.character_name.toLowerCase()))
      );
    }

    const used = new Set<string>();
    const clusters: DuplicateCluster[] = [];

    const rank = (o: OrgRow) => (o.usage_count ?? 0) * 100 + (o.confidence ?? 0) * 10;

    for (let i = 0; i < orgs.length; i++) {
      const a = orgs[i] as OrgRow;
      if (used.has(a.id)) continue;
      const aKey = normalizeNameKey(a.name);
      const aNames = [a.name, ...(a.aliases ?? [])].map(normalizeNameKey);
      const aMembers = memberMap.get(a.id) ?? new Set();

      const group: OrgRow[] = [a];
      let reason: DuplicateCluster['reason'] = 'same_name';

      for (let j = i + 1; j < orgs.length; j++) {
        const b = orgs[j] as OrgRow;
        if (used.has(b.id)) continue;
        const bKey = normalizeNameKey(b.name);
        const bNames = [b.name, ...(b.aliases ?? [])].map(normalizeNameKey);

        const nameMatch =
          aKey === bKey ||
          aNames.some(an => bNames.some(bn => an === bn || namesOverlapByContainment(an, bn)));

        let memberMatch = false;
        if (!nameMatch) {
          const bMembers = memberMap.get(b.id) ?? new Set();
          const smaller = Math.min(aMembers.size, bMembers.size);
          if (smaller >= 2) {
            const overlap = [...aMembers].filter(m => bMembers.has(m)).length;
            memberMatch = overlap >= Math.ceil(smaller * 0.7);
          }
        }

        if (nameMatch || memberMatch) {
          group.push(b);
          used.add(b.id);
          if (memberMatch && !nameMatch) reason = 'member_overlap';
        }
      }

      if (group.length > 1) {
        used.add(a.id);
        const primary = [...group].sort((x, y) => rank(y) - rank(x))[0];
        clusters.push({
          primary_id: primary.id,
          primary_name: primary.name,
          duplicate_ids: group.filter(o => o.id !== primary.id).map(o => o.id),
          names: group.map(o => o.name),
          reason,
        });
      }
    }

    return clusters;
  }

  /**
   * Merge one or more duplicate orgs into a primary. Re-points all child records,
   * unions aliases/metadata, and deletes the duplicates.
   */
  /**
   * Authority resolver (mirrors locationMergeService.resolveCanonicalLocationId).
   * The Groups Book reads `organizations` directly, so it emits organizations.id;
   * this guards against a stray people_places id by mapping to the canonical org by
   * name. Orgs are not auto-created here, so an unmatched mention returns null.
   */
  async resolveCanonicalOrganizationId(userId: string, id: string): Promise<string | null> {
    const { data: existing } = await supabaseAdmin
      .from('organizations').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (existing) return (existing as { id: string }).id;

    const { data: pp } = await supabaseAdmin
      .from('people_places').select('id, name').eq('id', id).eq('user_id', userId).maybeSingle();
    if (!pp) return null;
    const { data: byName } = await supabaseAdmin
      .from('organizations').select('id').eq('user_id', userId).ilike('name', (pp as { name: string }).name).maybeSingle();
    return byName ? (byName as { id: string }).id : null;
  }

  async merge(userId: string, primaryId: string, duplicateIds: string[]): Promise<OrgMergeReport> {
    // Resolve to the canonical `organizations` authority before lookups.
    const resolvedPrimary = await this.resolveCanonicalOrganizationId(userId, primaryId);
    if (resolvedPrimary) primaryId = resolvedPrimary;
    duplicateIds = (await Promise.all(
      duplicateIds.map(async (d) => (await this.resolveCanonicalOrganizationId(userId, d)) ?? d)
    )).filter((d) => d !== primaryId);

    const report: OrgMergeReport = {
      primary_id: primaryId,
      merged_ids: [],
      members_moved: 0,
      members_deduped: 0,
      records_moved: 0,
    };

    const { data: primary } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', primaryId)
      .eq('user_id', userId)
      .single();
    if (!primary) throw new Error('Primary organization not found');

    let aliases = new Set<string>([...(primary.aliases ?? [])]);
    let metadata: Record<string, unknown> = { ...(primary.metadata ?? {}) };
    let usage = primary.usage_count ?? 0;
    let description: string | undefined = primary.description ?? undefined;

    for (const dupId of duplicateIds) {
      if (dupId === primaryId) continue;
      const { data: dup } = await supabaseAdmin
        .from('organizations')
        .select('*')
        .eq('id', dupId)
        .eq('user_id', userId)
        .single();
      if (!dup) continue;

      // Members: move those not already present (by name), delete exact dupes.
      const primaryNames = new Set(
        ((await supabaseAdmin.from('organization_members').select('character_name').eq('organization_id', primaryId)).data ?? [])
          .map((m: { character_name: string }) => m.character_name.toLowerCase())
      );
      const { data: dupMembers } = await supabaseAdmin
        .from('organization_members')
        .select('id, character_name')
        .eq('organization_id', dupId);
      for (const m of (dupMembers ?? []) as Array<{ id: string; character_name: string }>) {
        if (primaryNames.has(m.character_name.toLowerCase())) {
          await supabaseAdmin.from('organization_members').delete().eq('id', m.id);
          report.members_deduped++;
        } else {
          await supabaseAdmin.from('organization_members').update({ organization_id: primaryId }).eq('id', m.id);
          primaryNames.add(m.character_name.toLowerCase());
          report.members_moved++;
        }
      }

      // Simple re-point for the rest.
      for (const table of ['organization_stories', 'organization_events', 'organization_locations']) {
        const { data: moved } = await supabaseAdmin
          .from(table)
          .update({ organization_id: primaryId })
          .eq('organization_id', dupId)
          .select('id');
        report.records_moved += moved?.length ?? 0;
      }

      // Relationships use from/to columns; re-point both, drop self-links.
      await supabaseAdmin.from('organization_relationships').update({ from_org_id: primaryId }).eq('from_org_id', dupId);
      await supabaseAdmin.from('organization_relationships').update({ to_org_id: primaryId }).eq('to_org_id', dupId);
      await supabaseAdmin.from('organization_relationships').delete().eq('from_org_id', primaryId).eq('to_org_id', primaryId);

      // Union identity/metadata; keep richer description; sum usage.
      (dup.aliases ?? []).forEach((a: string) => aliases.add(a));
      if (dup.name && dup.name !== primary.name) aliases.add(dup.name);
      metadata = { ...(dup.metadata ?? {}), ...metadata };
      if (!description || (dup.description && dup.description.length > description.length)) {
        description = dup.description ?? description;
      }
      usage += dup.usage_count ?? 0;

      await supabaseAdmin.from('organizations').delete().eq('id', dupId).eq('user_id', userId);
      report.merged_ids.push(dupId);
    }

    // Persist combined identity onto the primary.
    const { count: memberCount } = await supabaseAdmin
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', primaryId);

    await supabaseAdmin
      .from('organizations')
      .update({
        aliases: [...aliases].filter(a => a && a !== primary.name),
        metadata,
        description,
        usage_count: usage,
        member_count: memberCount ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', primaryId)
      .eq('user_id', userId);

    if (report.merged_ids.length > 0) {
      void identityLedgerService.recordMutation({
        userId,
        entityId: primaryId,
        entityType: 'organization',
        mutationType: 'ENTITY_MERGED',
        previousValue: { merged_ids: report.merged_ids },
        newValue: { id: primaryId, canonical_name: primary.name, aliases: [...aliases].filter(a => a && a !== primary.name) },
        reason: `Merged ${report.merged_ids.length} organization(s) into "${primary.name}"`,
        source: 'USER',
        metadata: { primaryId, mergedIds: report.merged_ids },
      });
    }

    logger.info({ userId, ...report }, 'Merged organizations');
    return report;
  }
}

export const organizationMergeService = new OrganizationMergeService();
