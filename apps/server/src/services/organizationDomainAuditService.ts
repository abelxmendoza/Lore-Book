/**
 * Phase 1 — Organization Domain Audit.
 */
import { normalizeNameKey } from '../utils/nameNormalization';
import { classifyGroup, groupDuplicateScore, type SocialGroupClass } from './ontology/groupIntelligence';
import { supabaseAdmin } from './supabaseClient';

export type OrganizationDomainAudit = {
  userId: string;
  groupCount: number;
  byCategory: Record<SocialGroupClass, number>;
  duplicates: Array<{ names: string[]; ids: string[]; confidence: number; reason: string }>;
  mergeSuggestions: Array<{
    sourceName: string;
    targetName: string;
    sourceId: string;
    targetId: string;
    confidence: number;
    reason: string;
    evidence: string[];
  }>;
  misclassifications: Array<{ id: string; name: string; storedType: string; expectedCategory: SocialGroupClass; issue: string }>;
  memberCounts: Array<{ id: string; name: string; members: number }>;
  relationshipCount: number;
  topLevelViolations: Array<{ id: string; name: string; issue: string }>;
};

type OrgRow = {
  id: string;
  name: string;
  group_type?: string | null;
  type?: string | null;
  social_category?: string | null;
  parent_group_id?: string | null;
};

class OrganizationDomainAuditService {
  async audit(userId: string): Promise<OrganizationDomainAudit> {
    const { data: orgs, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, group_type, type, social_category, parent_group_id, metadata')
      .eq('user_id', userId)
      .order('name');

    if (error) throw error;
    const rows = (orgs ?? []) as OrgRow[];

    const { count: relCount } = await supabaseAdmin
      .from('organization_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const byCategory: Record<SocialGroupClass, number> = {
      COMPANY: 0, INSTITUTION: 0, COMMUNITY: 0, SCENE: 0, FAMILY: 0, HOUSEHOLD: 0,
      TEAM: 0, BAND: 0, EVENT_GROUP: 0, FRIEND_GROUP: 0, PROJECT: 0, UNKNOWN: 0,
    };

    const misclassifications: OrganizationDomainAudit['misclassifications'] = [];
    const topLevelViolations: OrganizationDomainAudit['topLevelViolations'] = [];
    const memberCounts: OrganizationDomainAudit['memberCounts'] = [];

    for (const row of rows) {
      const stored = row.group_type ?? row.type ?? 'other';
      const c = classifyGroup(row.name, '', stored);
      const category = (row.social_category as SocialGroupClass) ?? c.category;
      byCategory[category] = (byCategory[category] ?? 0) + 1;

      const { count } = await supabaseAdmin
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', row.id);
      memberCounts.push({ id: row.id, name: row.name, members: count ?? 0 });

      if (c.isHousehold && stored === 'family') {
        misclassifications.push({
          id: row.id, name: row.name, storedType: stored,
          expectedCategory: 'HOUSEHOLD',
          issue: 'household misclassified as family',
        });
      }
      if (c.category === 'COMMUNITY' && stored === 'company') {
        misclassifications.push({
          id: row.id, name: row.name, storedType: stored,
          expectedCategory: 'COMMUNITY',
          issue: 'community misclassified as company',
        });
      }
      if (c.isHousehold && !row.parent_group_id) {
        topLevelViolations.push({ id: row.id, name: row.name, issue: 'household without parent_group_id (should nest under family)' });
      }
    }

    const duplicates: OrganizationDomainAudit['duplicates'] = [];
    const mergeSuggestions: OrganizationDomainAudit['mergeSuggestions'] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        const pairKey = [a.id, b.id].sort().join(':');
        if (seen.has(pairKey)) continue;
        const exact = normalizeNameKey(a.name) === normalizeNameKey(b.name);
        const score = groupDuplicateScore(a.name, b.name);
        if (!exact && score < 0.65) continue;
        seen.add(pairKey);
        const confidence = exact ? 1 : score;
        duplicates.push({ names: [a.name, b.name], ids: [a.id, b.id], confidence, reason: exact ? 'exact duplicate' : 'name overlap' });
        mergeSuggestions.push({
          sourceName: a.name, targetName: b.name, sourceId: a.id, targetId: b.id,
          confidence, reason: exact ? 'exact duplicate' : 'same group candidate',
          evidence: [`score ${confidence.toFixed(2)}`, `types: ${a.group_type} vs ${b.group_type}`],
        });
      }
    }

    return {
      userId,
      groupCount: rows.length,
      byCategory,
      duplicates,
      mergeSuggestions: mergeSuggestions.sort((a, b) => b.confidence - a.confidence),
      misclassifications,
      memberCounts: memberCounts.sort((a, b) => b.members - a.members),
      relationshipCount: relCount ?? 0,
      topLevelViolations,
    };
  }

  toMarkdown(audit: OrganizationDomainAudit): string {
    const lines = [
      '# Organization Domain Audit', '',
      `User: \`${audit.userId}\``, '',
      '## Summary', '',
      `- **Group count:** ${audit.groupCount}`,
      `- **Relationships:** ${audit.relationshipCount}`,
      `- **Duplicate pairs:** ${audit.duplicates.length}`,
      `- **Misclassifications:** ${audit.misclassifications.length}`,
      `- **Top-level violations:** ${audit.topLevelViolations.length}`,
      '', '## Classification breakdown', '',
      '| Category | Count |', '| --- | --- |',
      ...Object.entries(audit.byCategory).map(([k, v]) => `| ${k} | ${v} |`),
      '',
    ];
    if (audit.misclassifications.length) {
      lines.push('## Misclassifications', '');
      for (const m of audit.misclassifications) lines.push(`- **${m.name}** (${m.storedType}) → ${m.expectedCategory}: ${m.issue}`);
      lines.push('');
    }
    if (audit.mergeSuggestions.length) {
      lines.push('## Merge suggestions', '');
      for (const s of audit.mergeSuggestions.slice(0, 20)) {
        lines.push(`- **${s.sourceName}** ↔ **${s.targetName}** (${(s.confidence * 100).toFixed(0)}%)`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }
}

export const organizationDomainAuditService = new OrganizationDomainAuditService();
