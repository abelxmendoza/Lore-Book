/**
 * Applies group intelligence classifications to organization rows.
 */
import { logger } from '../logger';
import { CANONICAL_GROUP_TYPES } from '../constants/groupTypes';
import { normalizeNameKey } from '../utils/nameNormalization';
import { classifyGroup, groupDuplicateScore } from './ontology/groupIntelligence';
import { getOntologySchemaState } from './ontology/ontologySchemaService';
import { supabaseAdmin } from './supabaseClient';

export type OrganizationNormalizationReport = {
  processed: number;
  householdsNested: number;
  familiesEnsured: number;
  communitiesLinked: number;
  companiesClassified: number;
  misclassificationsFixed: number;
  skipped: number;
  schemaReady: boolean;
};

type OrgRow = {
  id: string;
  name: string;
  group_type?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  parent_group_id?: string | null;
  social_category?: string | null;
};

const SAFE_GROUP_TYPES = new Set<string>(CANONICAL_GROUP_TYPES);

function safeGroupType(suggested: string): string {
  return SAFE_GROUP_TYPES.has(suggested) ? suggested : 'other';
}

function isConstraintError(message: string | undefined): boolean {
  if (!message) return false;
  return /check constraint|invalid input value|violates/i.test(message);
}

class OrganizationNormalizationService {
  private findParentFamily(rows: OrgRow[]): OrgRow | undefined {
    const families = rows.filter((r) => {
      const c = classifyGroup(r.name, '', r.group_type ?? r.type);
      return c.isFamily || c.category === 'FAMILY' || r.social_category === 'FAMILY';
    });
    return families.find((r) => /\bmy\s+family\b/i.test(r.name)) ?? families[0];
  }

  async normalizeUserOrganizations(userId: string, opts: { dryRun?: boolean } = {}): Promise<OrganizationNormalizationReport> {
    const { dryRun = false } = opts;
    const schema = await getOntologySchemaState();

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, group_type, type, metadata, parent_group_id, social_category')
      .eq('user_id', userId);

    if (error) throw error;
    const rows = ([...(data ?? [])] as OrgRow[]).sort((a, b) => {
      const ca = classifyGroup(a.name, '', a.group_type ?? a.type);
      const cb = classifyGroup(b.name, '', b.group_type ?? b.type);
      if (ca.isFamily && !cb.isFamily) return -1;
      if (cb.isFamily && !ca.isFamily) return 1;
      return 0;
    });

    const report: OrganizationNormalizationReport = {
      processed: 0,
      householdsNested: 0,
      familiesEnsured: 0,
      communitiesLinked: 0,
      companiesClassified: 0,
      misclassificationsFixed: 0,
      skipped: 0,
      schemaReady: schema.organizations,
    };

    for (const row of rows) {
      const stored = row.group_type ?? row.type ?? 'other';
      const classification = classifyGroup(row.name, '', stored);
      report.processed += 1;

      const meta = { ...(row.metadata ?? {}) } as Record<string, unknown>;
      const groupType = safeGroupType(classification.suggestedGroupType);

      meta.social_classification = {
        category: classification.category,
        subcategory: classification.subcategory,
        reason: classification.reason,
        confidence: classification.confidence,
      };
      meta.root_type = 'GROUP';
      meta.social_category = classification.category;
      meta.social_subcategory = classification.subcategory ?? null;

      const updates: Record<string, unknown> = { metadata: meta };

      if (schema.organizations) {
        updates.root_type = 'GROUP';
        updates.social_category = classification.category;
        updates.social_subcategory = classification.subcategory ?? null;
        updates.group_type = groupType;
      }

      if (classification.isFamily) {
        report.familiesEnsured += 1;
        meta.social_role = 'family_root';
      }

      if (classification.isHousehold) {
        const parent = this.findParentFamily(rows);
        if (parent && parent.id !== row.id) {
          if (schema.organizations) updates.parent_group_id = parent.id;
          meta.parent_group_id = parent.id;
          meta.parent_family_name = parent.name;
          report.householdsNested += 1;
        }
        if (stored === 'family') report.misclassificationsFixed += 1;
      }

      if (classification.category === 'COMMUNITY' || classification.category === 'SCENE') {
        report.communitiesLinked += 1;
        meta.community_type = classification.subcategory;
      }

      if (classification.category === 'COMPANY') report.companiesClassified += 1;

      if (classification.possessive) {
        meta.possessive_owner = classification.possessive.ownerName;
        meta.kin_relation = classification.possessive.ownerRelation;
      }

      updates.metadata = meta;

      if (!dryRun) {
        let { error: updateError } = await supabaseAdmin
          .from('organizations')
          .update(updates)
          .eq('id', row.id)
          .eq('user_id', userId);

        if (updateError && isConstraintError(updateError.message) && updates.group_type === 'household') {
          const fallback = { ...updates, group_type: 'other' };
          delete fallback.type;
          ({ error: updateError } = await supabaseAdmin
            .from('organizations')
            .update(fallback)
            .eq('id', row.id)
            .eq('user_id', userId));
        }

        if (updateError) {
          logger.warn({ updateError, orgId: row.id }, 'Organization normalization failed');
          report.skipped += 1;
        }
      }
    }

    await this.linkCommunityVenues(userId, rows, dryRun);
    logger.info({ userId, report, dryRun }, 'Organization normalization completed');
    return report;
  }

  private async linkCommunityVenues(userId: string, rows: OrgRow[], dryRun: boolean) {
    const communities = rows.filter((r) => {
      const c = classifyGroup(r.name, '', r.group_type ?? r.type);
      return c.category === 'COMMUNITY' || c.category === 'SCENE';
    });
    if (communities.length === 0) return;

    const venueNames = ['club metro', 'first street pool', 'gothicumbia'];
    for (const community of communities) {
      const meta = { ...(community.metadata ?? {}) } as Record<string, unknown>;
      const linked = Array.isArray(meta.linked_venue_names) ? [...(meta.linked_venue_names as string[])] : [];
      let changed = false;
      for (const v of venueNames) {
        if (!linked.some((l) => normalizeNameKey(l) === v)) {
          linked.push(v.replace(/\b\w/g, (c) => c.toUpperCase()));
          changed = true;
        }
      }
      if (changed && !dryRun) {
        meta.linked_venue_names = linked;
        await supabaseAdmin.from('organizations').update({ metadata: meta }).eq('id', community.id).eq('user_id', userId);
      }
    }
  }

  async getMergeSuggestions(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, group_type, social_category, usage_count, metadata')
      .eq('user_id', userId);
    if (error) throw error;
    const rows = data ?? [];
    const suggestions: Array<{
      sourceId: string; targetId: string; sourceName: string; targetName: string;
      confidence: number; reason: string; evidence: string[];
    }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        const pairKey = [a.id, b.id].sort().join(':');
        if (seen.has(pairKey)) continue;
        const score = groupDuplicateScore(a.name, b.name);
        const catA = a.social_category ?? (a.metadata as Record<string, unknown> | null)?.social_category;
        const catB = b.social_category ?? (b.metadata as Record<string, unknown> | null)?.social_category;
        const sameCategory = catA && catA === catB;
        const confidence = sameCategory ? Math.max(score, 0.75) : score;
        if (confidence < 0.65) continue;
        seen.add(pairKey);
        const target = (a.usage_count ?? 0) >= (b.usage_count ?? 0) ? a : b;
        const source = target.id === a.id ? b : a;
        suggestions.push({
          sourceId: source.id, targetId: target.id,
          sourceName: source.name, targetName: target.name,
          confidence, reason: confidence >= 0.9 ? 'same group' : 'overlap candidate',
          evidence: [`categories: ${catA ?? '?'} / ${catB ?? '?'}`],
        });
      }
    }
    return suggestions.sort((x, y) => y.confidence - x.confidence);
  }
}

export const organizationNormalizationService = new OrganizationNormalizationService();
