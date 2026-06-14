// =====================================================
// ORGANIZATION RELATIONSHIP INFERENCE
// Learns group↔group links (subgroups, inner circles, family
// households, scene/community ties) from chat text, name nesting,
// and member overlap — persisted to organization_relationships.
// =====================================================

import { logger } from '../logger';
import { config } from '../config';
import { openai } from './openaiClient';
import {
  organizationService,
  type Organization,
  type OrgRelationshipType,
} from './organizationService';

const INFERRED_PREFIX = '[auto-inferred]';
const LLM_INFERRED_PREFIX = '[auto-inferred:llm]';

/** Map LLM / legacy relationship labels → G1 org edge (child → parent for hierarchies). */
function mapLlmRelationship(
  llmType: string,
  fromOrg: Organization,
  toOrg: Organization
): { fromOrgId: string; toOrgId: string; type: OrgRelationshipType } | null {
  const t = llmType.toLowerCase().replace(/\s+/g, '_');

  if (t === 'parent_group_of' || t === 'parent_of') {
    return { fromOrgId: toOrg.id, toOrgId: fromOrg.id, type: 'part_of' };
  }
  if (t === 'subgroup_of' || t === 'chapter_of' || t === 'branch_of' || t === 'part_of') {
    return { fromOrgId: fromOrg.id, toOrgId: toOrg.id, type: 'part_of' };
  }
  if (t === 'spawned_from' || t === 'split_from' || t === 'evolved_from') {
    return { fromOrgId: fromOrg.id, toOrgId: toOrg.id, type: 'spawned_from' };
  }
  if (t === 'affiliated_with' || t === 'partner_of' || t === 'overlaps_with') {
    return { fromOrgId: fromOrg.id, toOrgId: toOrg.id, type: 'affiliated_with' };
  }
  if (t === 'competitor_of' || t === 'rival_of') {
    return { fromOrgId: fromOrg.id, toOrgId: toOrg.id, type: 'rival_of' };
  }
  if (t === 'merged_with') {
    return { fromOrgId: fromOrg.id, toOrgId: toOrg.id, type: 'merged_with' };
  }
  if (t === 'succeeded_by' || t === 'replaced_by' || t === 'predecessor_of') {
    return { fromOrgId: fromOrg.id, toOrgId: toOrg.id, type: 'succeeded_by' };
  }
  if (t === 'collaborated_with') {
    return { fromOrgId: fromOrg.id, toOrgId: toOrg.id, type: 'collaborated_with' };
  }
  return null;
}

function textMentionsOrgs(text: string, orgs: Organization[]): Organization[] {
  const lower = text.toLowerCase();
  return orgs.filter(o => {
    const n = o.name.toLowerCase();
    if (n.length >= 3 && lower.includes(n)) return true;
    return (o.aliases ?? []).some(a => a.length >= 3 && lower.includes(a.toLowerCase()));
  });
}

/** "child part_of parent" — from_org is the smaller / nested group. */
export type InferredOrgLink = {
  fromOrgId: string;
  toOrgId: string;
  relationshipType: OrgRelationshipType;
  confidence: number;
  reason: string;
};

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripArticles(name: string): string {
  return name.replace(/^(?:the|my|our)\s+/i, '').trim();
}

const PART_OF_TEXT = [
  /\b([A-Z][\w\s'’.-]{2,48}?)\s+(?:is\s+(?:a\s+)?(?:subgroup|subset|part|branch|arm|wing|offshoot|chapter|household|inner circle|core group|splinter)\s+of)\s+(?:the\s+|my\s+)?([A-Z][\w\s'’.-]{2,48})/gi,
  /\b([A-Z][\w\s'’.-]{2,48}?)\s+(?:belongs to|is under|rolls up to|is part of)\s+(?:the\s+|my\s+)?([A-Z][\w\s'’.-]{2,48})/gi,
  /\b(?:inner circle|core group|main circle|household)\s+of\s+(?:the\s+|my\s+)?([A-Z][\w\s'’.-]{2,48})/gi,
  /\b([A-Z][\w\s'’.-]{2,48}?)(?:'s|’s)\s+household\s+(?:is\s+)?(?:part of|within|under)\s+(?:the\s+|my\s+)?([A-Z][\w\s'’.-]{2,48})/gi,
];

const AFFILIATED_TEXT = [
  /\b([A-Z][\w\s'’.-]{2,48}?)\s+(?:scene|community)\s+(?:and|vs\.?|versus|&)\s+(?:the\s+)?([A-Z][\w\s'’.-]{2,48}?)\s+(?:scene|community)/gi,
  /\b([A-Z][\w\s'’.-]{2,48}?)\s+(?:is related to|is connected to|overlaps with)\s+(?:the\s+)?([A-Z][\w\s'’.-]{2,48})/gi,
];

const NESTING_SUFFIXES: Array<{ pattern: RegExp; type: OrgRelationshipType }> = [
  { pattern: /\binner circle\b/i, type: 'part_of' },
  { pattern: /\bcore group\b/i, type: 'part_of' },
  { pattern: /\bmain circle\b/i, type: 'part_of' },
  { pattern: /\bhousehold\b/i, type: 'part_of' },
  { pattern: /\bchapter\b/i, type: 'part_of' },
  { pattern: /\bbranch\b/i, type: 'part_of' },
  { pattern: /\bscene\b/i, type: 'affiliated_with' },
  { pattern: /\bcommunity\b/i, type: 'affiliated_with' },
];

export class OrganizationRelationshipInferenceService {
  private findOrgByName(orgs: Organization[], rawName: string): Organization | null {
    const target = normalizeName(stripArticles(rawName));
    if (!target) return null;
    for (const org of orgs) {
      if (normalizeName(org.name) === target) return org;
      for (const alias of org.aliases ?? []) {
        if (normalizeName(alias) === target) return org;
      }
    }
    // Fuzzy: one name contains the other when both are multi-word
    for (const org of orgs) {
      const n = normalizeName(org.name);
      if (n.includes(target) || target.includes(n)) {
        if (Math.min(n.length, target.length) >= 4) return org;
      }
    }
    return null;
  }

  /** Parse chat text for explicit group↔group statements. */
  inferLinksFromText(userId: string, text: string, orgs?: Organization[]): InferredOrgLink[] {
    if (!text || text.length < 12) return [];
    const allOrgs = orgs ?? [];
    const links: InferredOrgLink[] = [];
    const seen = new Set<string>();

    const push = (from: Organization, to: Organization, type: OrgRelationshipType, confidence: number, reason: string) => {
      if (from.id === to.id) return;
      const key = `${from.id}|${to.id}|${type}`;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ fromOrgId: from.id, toOrgId: to.id, relationshipType: type, confidence, reason });
    };

    for (const pattern of PART_OF_TEXT) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        if (match.length >= 3) {
          const child = this.findOrgByName(allOrgs, match[1].trim());
          const parent = this.findOrgByName(allOrgs, match[2].trim());
          if (child && parent) push(child, parent, 'part_of', 0.88, `Chat: "${match[0].trim()}"`);
        } else if (match.length >= 2) {
          const parent = this.findOrgByName(allOrgs, match[1].trim());
          // "inner circle of Los Goths" — child org must be found by context elsewhere
          if (parent) {
            const childCandidate = allOrgs.find(o =>
              normalizeName(o.name).includes('inner circle') &&
              normalizeName(o.name).includes(normalizeName(stripArticles(parent.name)))
            );
            if (childCandidate) push(childCandidate, parent, 'part_of', 0.82, `Chat: "${match[0].trim()}"`);
          }
        }
      }
    }

    for (const pattern of AFFILIATED_TEXT) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const a = this.findOrgByName(allOrgs, match[1].trim());
        const b = this.findOrgByName(allOrgs, match[2].trim());
        if (a && b) push(a, b, 'affiliated_with', 0.75, `Chat: "${match[0].trim()}"`);
      }
    }

    return links;
  }

  /**
   * Family households (e.g. "Tía Grace's Household") roll up to the main family org ("My Family").
   */
  inferFamilyHouseholdLinks(orgs: Organization[]): InferredOrgLink[] {
    const familyOrgs = orgs.filter(o => o.group_type === 'family' || o.type === 'family');
    if (familyOrgs.length < 2) return [];

    const households = familyOrgs.filter(o =>
      /\bhousehold\b/i.test(o.name) || /\bhouse\b/i.test(o.name)
    );
    if (households.length === 0) return [];

    let mainFamily = familyOrgs.find(o =>
      /\bmy family\b/i.test(o.name) ||
      normalizeName(o.name) === 'family' ||
      normalizeName(o.name) === 'our family'
    );
    if (!mainFamily) {
      const nonHousehold = familyOrgs.filter(o => !households.some(h => h.id === o.id));
      if (nonHousehold.length === 1) mainFamily = nonHousehold[0];
      else if (nonHousehold.length > 1) {
        mainFamily = nonHousehold.sort((a, b) =>
          (b.members?.length ?? 0) - (a.members?.length ?? 0)
        )[0];
      }
    }
    if (!mainFamily) return [];

    const links: InferredOrgLink[] = [];
    for (const h of households) {
      if (h.id === mainFamily.id) continue;
      links.push({
        fromOrgId: h.id,
        toOrgId: mainFamily.id,
        relationshipType: 'part_of',
        confidence: 0.86,
        reason: `Family household "${h.name}" rolls up to "${mainFamily.name}"`,
      });
    }
    return links;
  }

  /** Name nesting: "Los Goths Inner Circle" ⊃ "Los Goths". */
  inferLinksFromNameNesting(orgs: Organization[]): InferredOrgLink[] {
    const links: InferredOrgLink[] = [];
    const seen = new Set<string>();

    for (const child of orgs) {
      const cn = normalizeName(child.name);
      for (const parent of orgs) {
        if (child.id === parent.id) continue;
        const pn = normalizeName(parent.name);
        if (pn.length < 4 || cn.length <= pn.length + 2) continue;
        if (!cn.includes(pn)) continue;

        let relType: OrgRelationshipType = 'part_of';
        for (const rule of NESTING_SUFFIXES) {
          if (rule.pattern.test(child.name)) {
            relType = rule.type;
            break;
          }
        }
        // "Los Goths Scene" vs "Los Goths" → affiliated; "Los Goths Inner Circle" → part_of
        if (/\bscene\b/i.test(child.name) && !/\binner circle\b/i.test(child.name)) {
          relType = 'affiliated_with';
        }

        const key = `${child.id}|${parent.id}|${relType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({
          fromOrgId: child.id,
          toOrgId: parent.id,
          relationshipType: relType,
          confidence: 0.78,
          reason: `Name nesting: "${child.name}" contains "${parent.name}"`,
        });
      }
    }
    return links;
  }

  /**
   * LLM pass for subtle phrasing ("the tight-knit core of the scene",
   * "household within my family", "Los Goths inner circle vs the wider community").
   */
  async inferLinksFromLlm(
    userId: string,
    text: string,
    orgs: Organization[]
  ): Promise<InferredOrgLink[]> {
    if (!text || text.length < 30 || orgs.length < 2) return [];
    const mentioned = textMentionsOrgs(text, orgs);
    if (mentioned.length < 2) return [];

    try {
      const orgList = orgs
        .map(o => `- ${o.name}${o.group_type ? ` (${o.group_type})` : ''}: ${(o.members ?? []).map(m => m.character_name).slice(0, 6).join(', ') || 'unknown members'}`)
        .join('\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You detect relationships BETWEEN organizations/groups in personal journal chat.

Known organizations:
${orgList}

Return JSON:
{
  "relationships": [
    {
      "fromOrg": "exact name from list",
      "toOrg": "exact name from list",
      "relationshipType": "part_of" | "spawned_from" | "affiliated_with" | "rival_of" | "collaborated_with" | "merged_with" | "succeeded_by" | "subgroup_of" | "parent_group_of",
      "confidence": 0.0-1.0,
      "evidence": "short quote from message"
    }
  ]
}

Rules:
- part_of / subgroup_of: smaller nested group → larger container (household within family, inner circle within scene)
- parent_group_of: reverse direction of part_of (parent contains child)
- affiliated_with: related peers (scene vs community, overlapping circles)
- rival_of: opposing sides
- Only include relationships explicitly supported by the message. confidence >= 0.65.
- Use exact organization names from the list.`,
          },
          { role: 'user', content: text.slice(0, 4000) },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return [];

      const parsed = JSON.parse(raw) as {
        relationships?: Array<{
          fromOrg?: string;
          toOrg?: string;
          relationshipType?: string;
          confidence?: number;
          evidence?: string;
        }>;
      };

      const links: InferredOrgLink[] = [];
      const seen = new Set<string>();

      for (const rel of parsed.relationships ?? []) {
        if ((rel.confidence ?? 0) < 0.65) continue;
        const fromOrg = this.findOrgByName(orgs, rel.fromOrg ?? '');
        const toOrg = this.findOrgByName(orgs, rel.toOrg ?? '');
        if (!fromOrg || !toOrg) continue;

        const mapped = mapLlmRelationship(rel.relationshipType ?? 'affiliated_with', fromOrg, toOrg);
        if (!mapped) continue;

        const key = `${mapped.fromOrgId}|${mapped.toOrgId}|${mapped.type}`;
        if (seen.has(key)) continue;
        seen.add(key);

        links.push({
          fromOrgId: mapped.fromOrgId,
          toOrgId: mapped.toOrgId,
          relationshipType: mapped.type,
          confidence: rel.confidence ?? 0.75,
          reason: `LLM: ${rel.evidence ?? rel.relationshipType ?? 'inferred from chat'}`,
        });
      }
      return links;
    } catch (error) {
      logger.debug({ error, userId }, 'LLM organization relationship inference failed');
      return [];
    }
  }

  /** Member overlap: smaller roster mostly inside larger → part_of. */
  async inferLinksFromMemberOverlap(userId: string, orgs?: Organization[]): Promise<InferredOrgLink[]> {
    const allOrgs = orgs ?? await organizationService.listOrganizations(userId);
    const memberSets = new Map<string, Set<string>>();

    await Promise.all(allOrgs.map(async org => {
      const members = await organizationService.getMembers(org.id);
      memberSets.set(
        org.id,
        new Set(members.map(m => m.character_id).filter((id): id is string => Boolean(id)))
      );
    }));

    const links: InferredOrgLink[] = [];
    const seen = new Set<string>();

    for (const child of allOrgs) {
      const childSet = memberSets.get(child.id);
      if (!childSet || childSet.size === 0 || childSet.size > 25) continue;

      for (const parent of allOrgs) {
        if (child.id === parent.id) continue;
        const parentSet = memberSets.get(parent.id);
        if (!parentSet || parentSet.size === 0) continue;
        if (childSet.size >= parentSet.size) continue;

        const overlap = [...childSet].filter(id => parentSet.has(id)).length;
        const ratio = overlap / childSet.size;
        if (ratio < 0.72) continue;

        let relType: OrgRelationshipType = 'part_of';
        const childName = normalizeName(child.name);
        if (childName.includes('inner circle') || childName.includes('core')) {
          relType = 'spawned_from';
        } else if (parent.group_type === 'family' || childName.includes('household')) {
          relType = 'part_of';
        } else if (childName.includes('scene') && parentNameIncludes(parent.name, 'community', 'goth', 'crew')) {
          relType = 'affiliated_with';
        }

        const key = `${child.id}|${parent.id}|${relType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({
          fromOrgId: child.id,
          toOrgId: parent.id,
          relationshipType: relType,
          confidence: 0.7 + ratio * 0.2,
          reason: `Member overlap: ${overlap}/${childSet.size} of "${child.name}" also in "${parent.name}"`,
        });
      }
    }
    return links;
  }

  /** Run all inference passes and persist high-confidence links. */
  async reconcileUserOrganizations(userId: string, text?: string): Promise<{ created: number; skipped: number; llm: number }> {
    const orgs = await organizationService.listOrganizations(userId);
    if (orgs.length < 2) return { created: 0, skipped: 0, llm: 0 };

    const textLinks = text ? this.inferLinksFromText(userId, text, orgs) : [];
    const householdLinks = this.inferFamilyHouseholdLinks(orgs);
    const nestLinks = this.inferLinksFromNameNesting(orgs);
    const overlapLinks = await this.inferLinksFromMemberOverlap(userId, orgs);
    const llmLinks = text ? await this.inferLinksFromLlm(userId, text, orgs) : [];

    const merged = new Map<string, InferredOrgLink>();
    for (const link of [...textLinks, ...householdLinks, ...nestLinks, ...overlapLinks, ...llmLinks]) {
      const key = `${link.fromOrgId}|${link.toOrgId}|${link.relationshipType}`;
      const existing = merged.get(key);
      if (!existing || link.confidence > existing.confidence) merged.set(key, link);
    }

    let created = 0;
    let skipped = 0;
    let llm = 0;
    for (const link of merged.values()) {
      if (link.confidence < 0.72) { skipped++; continue; }
      const isLlm = llmLinks.some(l =>
        l.fromOrgId === link.fromOrgId && l.toOrgId === link.toOrgId && l.relationshipType === link.relationshipType
      );
      const prefix = isLlm ? LLM_INFERRED_PREFIX : INFERRED_PREFIX;
      if (isLlm) llm++;
      const ok = await organizationService.ensureRelationship(
        userId,
        link.fromOrgId,
        link.toOrgId,
        link.relationshipType,
        `${prefix} ${link.reason}`
      );
      if (ok) created++;
      else skipped++;
    }

    if (created > 0) {
      logger.info({ userId, created, skipped, llm }, 'Inferred organization relationships');
    }
    return { created, skipped, llm };
  }

  /** Called after each user chat message (non-blocking). */
  async processAfterChat(userId: string, text: string): Promise<void> {
    try {
      await this.reconcileUserOrganizations(userId, text);
    } catch (error) {
      logger.warn({ error, userId }, 'Organization relationship inference failed');
    }
  }
}

function parentNameIncludes(name: string, ...needles: string[]): boolean {
  const n = normalizeName(name);
  return needles.some(k => n.includes(k));
}

export const organizationRelationshipInferenceService = new OrganizationRelationshipInferenceService();
