/**
 * Persist attach-or-alias onto an existing canonical card.
 * Uses existing alias / metadata columns — no migrations.
 */

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import { organizationService } from '../../organizationService';
import { skillService } from '../../skills/skillService';
import type { AttachCanonIndex, AttachCanonRecord, AttachPlan } from './suggestionAttachTypes';
import type { LoreBookDomain } from '../parser/loreBookParserTypes';

const EVIDENCE_META_KEY = 'lorebook_attach_evidence';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

async function patchOmega(userId: string, plan: AttachPlan): Promise<void> {
  const { data } = await supabaseAdmin
    .from('omega_entities')
    .select('id, aliases, mention_count, metadata')
    .eq('id', plan.target.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return;

  const metadata = asRecord(data.metadata);
  metadata[EVIDENCE_META_KEY] = plan.nextEvidence;
  if (plan.contextualRole) metadata.contextual_role = plan.contextualRole;
  if (plan.typeConflict) metadata.rejected_incoming_type = plan.incomingTypeNormalized ? undefined : 'normalized';

  await supabaseAdmin
    .from('omega_entities')
    .update({
      aliases: plan.nextAliases,
      mention_count: plan.nextMentionCount,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.target.id)
    .eq('user_id', userId);
}

async function patchOrganization(userId: string, plan: AttachPlan): Promise<void> {
  const current = await organizationService.findByName(userId, plan.target.name);
  const metadata = asRecord((current as { metadata?: unknown } | null)?.metadata);
  metadata[EVIDENCE_META_KEY] = plan.nextEvidence;
  if (plan.contextualRole) metadata.contextual_role = plan.contextualRole;
  if (plan.typeConflict) {
    metadata.rejected_incoming_type = plan.candidate;
    metadata.canonical_type_preserved = plan.target.canonicalType ?? true;
  }
  await organizationService.updateOrganization(userId, plan.target.id, {
    aliases: plan.nextAliases,
    metadata,
  } as Parameters<typeof organizationService.updateOrganization>[2]);
}

async function patchSkill(userId: string, plan: AttachPlan): Promise<void> {
  await skillService.updateSkillMetadata(userId, plan.target.id, {
    aliases: plan.nextAliases,
    [EVIDENCE_META_KEY]: plan.nextEvidence,
  });
}

async function patchLocation(userId: string, plan: AttachPlan): Promise<void> {
  const { data } = await supabaseAdmin
    .from('locations')
    .select('id, aliases, metadata')
    .eq('id', plan.target.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (data) {
    const metadata = asRecord(data.metadata);
    metadata[EVIDENCE_META_KEY] = plan.nextEvidence;
    const aliases = plan.nextAliases;
    await supabaseAdmin
      .from('locations')
      .update({
        aliases,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.target.id)
      .eq('user_id', userId);
    return;
  }

  await patchOmega(userId, plan);
}

async function patchProject(userId: string, plan: AttachPlan): Promise<void> {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('id, metadata')
    .eq('id', plan.target.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return;
  const metadata = asRecord(data.metadata);
  metadata.aliases = plan.nextAliases;
  metadata[EVIDENCE_META_KEY] = plan.nextEvidence;
  await supabaseAdmin
    .from('projects')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', plan.target.id)
    .eq('user_id', userId);
}

export async function applyAttachPlan(userId: string, plan: AttachPlan): Promise<void> {
  const domain = plan.target.domain;
  try {
    if (domain === 'characters' || domain === 'quests') {
      await patchOmega(userId, plan);
      return;
    }
    if (domain === 'organizations' || domain === 'groups' || domain === 'schools') {
      await patchOrganization(userId, plan);
      return;
    }
    if (domain === 'skills') {
      await patchSkill(userId, plan);
      return;
    }
    if (domain === 'locations') {
      await patchLocation(userId, plan);
      return;
    }
    if (domain === 'projects') {
      await patchProject(userId, plan);
    }
  } catch (err) {
    logger.debug({ err, userId, domain, id: plan.target.id }, 'attach-or-alias persist failed (non-blocking)');
  }
}

function mapOmegaType(type: string): LoreBookDomain | null {
  if (type === 'PERSON' || type === 'CHARACTER') return 'characters';
  if (type === 'LOCATION') return 'locations';
  if (type === 'ORG') return 'organizations';
  return null;
}

export type AttachCanonLoadResult = {
  index: AttachCanonIndex;
  status: 'ok' | 'degraded';
  successfulLoads: number;
  failedLoads: number;
};

export async function loadAttachCanonResult(userId: string): Promise<AttachCanonLoadResult> {
  const index: AttachCanonIndex = {};
  let successfulLoads = 0;
  let failedLoads = 0;
  const push = (domain: LoreBookDomain, record: AttachCanonRecord) => {
    index[domain] = index[domain] ?? [];
    index[domain]!.push(record);
  };

  try {
    const { data: omega, error } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name, aliases, type, mention_count, metadata')
      .eq('user_id', userId)
      .limit(500);
    if (error) throw error;
    for (const row of omega ?? []) {
      const domain = mapOmegaType(String(row.type ?? ''));
      if (!domain) continue;
      const metadata = asRecord(row.metadata);
      push(domain, {
        id: String(row.id),
        name: String(row.primary_name ?? ''),
        aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
        domain,
        userId,
        mentionCount: Number(row.mention_count ?? 1) || 1,
        evidence: Array.isArray(metadata[EVIDENCE_META_KEY])
          ? (metadata[EVIDENCE_META_KEY] as AttachCanonRecord['evidence'])
          : [],
      });
    }
    successfulLoads += 1;
  } catch (err) {
    failedLoads += 1;
    logger.debug({ err, userId }, 'attach canon omega load failed');
  }

  try {
    const orgs = await organizationService.listOrganizations(userId);
    for (const org of orgs) {
      const metadata = asRecord((org as { metadata?: unknown }).metadata);
      push('organizations', {
        id: org.id,
        name: org.name,
        aliases: org.aliases ?? [],
        domain: 'organizations',
        canonicalType: String((org as { type?: string; group_type?: string }).type ?? org.group_type ?? ''),
        userId,
        evidence: Array.isArray(metadata[EVIDENCE_META_KEY])
          ? (metadata[EVIDENCE_META_KEY] as AttachCanonRecord['evidence'])
          : [],
      });
    }
    successfulLoads += 1;
  } catch (err) {
    failedLoads += 1;
    logger.debug({ err, userId }, 'attach canon org load failed');
  }

  try {
    const skills = await skillService.getSkills(userId, { active_only: false });
    for (const skill of skills) {
      const metadata = asRecord(skill.metadata);
      const aliases = Array.isArray(metadata.aliases) ? metadata.aliases.map(String) : [];
      push('skills', {
        id: skill.id,
        name: skill.skill_name,
        aliases,
        domain: 'skills',
        userId,
        mentionCount: skill.practice_count,
        evidence: Array.isArray(metadata[EVIDENCE_META_KEY])
          ? (metadata[EVIDENCE_META_KEY] as AttachCanonRecord['evidence'])
          : [],
      });
    }
    successfulLoads += 1;
  } catch (err) {
    failedLoads += 1;
    logger.debug({ err, userId }, 'attach canon skill load failed');
  }

  try {
    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('id, name, metadata')
      .eq('user_id', userId)
      .limit(300);
    if (error) throw error;
    for (const row of projects ?? []) {
      const metadata = asRecord(row.metadata);
      push('projects', {
        id: String(row.id),
        name: String(row.name ?? ''),
        aliases: Array.isArray(metadata.aliases) ? metadata.aliases.map(String) : [],
        domain: 'projects',
        userId,
        evidence: Array.isArray(metadata[EVIDENCE_META_KEY])
          ? (metadata[EVIDENCE_META_KEY] as AttachCanonRecord['evidence'])
          : [],
      });
    }
    successfulLoads += 1;
  } catch (err) {
    failedLoads += 1;
    logger.debug({ err, userId }, 'attach canon project load failed');
  }

  try {
    const { data: locations, error } = await supabaseAdmin
      .from('locations')
      .select('id, name, aliases, metadata')
      .eq('user_id', userId)
      .limit(300);
    if (error) throw error;
    for (const row of locations ?? []) {
      const metadata = asRecord(row.metadata);
      const colAliases = Array.isArray(row.aliases) ? row.aliases.map(String) : [];
      const metaAliases = Array.isArray(metadata.aliases) ? metadata.aliases.map(String) : [];
      push('locations', {
        id: String(row.id),
        name: String(row.name ?? ''),
        aliases: [...new Set([...colAliases, ...metaAliases])],
        domain: 'locations',
        userId,
        evidence: Array.isArray(metadata[EVIDENCE_META_KEY])
          ? (metadata[EVIDENCE_META_KEY] as AttachCanonRecord['evidence'])
          : [],
      });
    }
    successfulLoads += 1;
  } catch (err) {
    failedLoads += 1;
    logger.debug({ err, userId }, 'attach canon location load failed');
  }

  try {
    const { data: characters, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId)
      .limit(400);
    if (error) throw error;
    for (const row of characters ?? []) {
      const metadata = asRecord(row.metadata);
      const distinctFrom = [
        ...((metadata.confirmed_distinct_from as string[]) ?? []),
        ...((metadata.distinct_from as string[]) ?? []),
      ].map(String);
      push('characters', {
        id: String(row.id),
        name: String(row.name ?? ''),
        aliases: Array.isArray(row.alias) ? row.alias.map(String) : [],
        domain: 'characters',
        userId,
        distinctFrom,
      });
    }
    successfulLoads += 1;
  } catch (err) {
    failedLoads += 1;
    logger.debug({ err, userId }, 'attach canon character load failed');
  }

  try {
    const { data: quests, error } = await supabaseAdmin
      .from('quests')
      .select('id, title, status')
      .eq('user_id', userId)
      .limit(300);
    if (error) throw error;
    for (const row of quests ?? []) {
      push('quests', {
        id: String(row.id),
        name: String(row.title ?? ''),
        aliases: [],
        domain: 'quests',
        status: String(row.status ?? ''),
        userId,
      });
    }
    successfulLoads += 1;
  } catch (err) {
    failedLoads += 1;
    logger.debug({ err, userId }, 'attach canon quest load failed');
  }

  const status: 'ok' | 'degraded' = failedLoads > 0 && successfulLoads === 0 ? 'degraded' : 'ok';
  return { index, status, successfulLoads, failedLoads };
}

export async function loadAttachCanonIndex(userId: string): Promise<AttachCanonIndex> {
  return (await loadAttachCanonResult(userId)).index;
}

export function qualityContextFromCanon(
  records: AttachCanonRecord[],
): { knownInBook: Set<string>; knownInBookIds: Map<string, string> } {
  const knownInBook = new Set<string>();
  const knownInBookIds = new Map<string, string>();
  for (const record of records) {
    knownInBook.add(record.name);
    knownInBookIds.set(record.name.toLowerCase(), record.id);
    for (const alias of record.aliases) {
      knownInBook.add(alias);
      knownInBookIds.set(alias.toLowerCase(), record.id);
    }
  }
  return { knownInBook, knownInBookIds };
}
