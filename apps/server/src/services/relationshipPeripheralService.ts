/**
 * Multi-domain relationship periphery — vicarious links for any subject character.
 */
import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { isIndividualPersonName } from '../utils/personNameValidation';
import {
  hasVicariousRelationshipSignals,
  parseVicariousRelationships,
  type RelationshipPeripheryDomain,
  type VicariousRelationshipHit,
} from './ontology/vicariousRelationshipIntelligence';
import { resolveRomanticPartner } from './romanticLexicalIngestionService';
import { supabaseAdmin } from './supabaseClient';

const TABLE = 'relationship_peripherals';

export type RelationshipPeripheralTier = 'suspected' | 'confirmed' | 'dismissed';

export type RelationshipPeripheral = {
  id: string;
  user_id: string;
  domain: RelationshipPeripheryDomain;
  anchor_relationship_id: string | null;
  anchor_person_id: string;
  anchor_person_type: 'character' | 'omega_entity';
  peripheral_person_id: string | null;
  peripheral_person_type: 'character' | 'omega_entity' | null;
  peripheral_surface: string;
  role: string;
  tier: RelationshipPeripheralTier;
  confidence: number;
  has_met: boolean;
  proximity: string;
  associated_via: string;
  source_message_ids: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  anchor_name?: string;
  peripheral_name?: string;
};

/** @deprecated use RelationshipPeripheral */
export type RomanticPeripheral = RelationshipPeripheral;

type MentionedEntity = {
  id: string;
  name: string;
  type: 'character' | 'omega_entity';
};

const MIN_CONFIDENCE = 0.65;

const DOMAIN_TAGS: Record<RelationshipPeripheryDomain, string> = {
  romantic: 'romantic-peripheral',
  family: 'family-peripheral',
  social: 'social-peripheral',
  professional: 'work-peripheral',
  mentor: 'mentor-peripheral',
  adversarial: 'adversarial-peripheral',
  creative: 'creative-peripheral',
};

async function findAnchorRelationshipId(
  userId: string,
  personId: string,
  personType: 'character' | 'omega_entity'
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('romantic_relationships')
    .select('id')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('person_type', personType)
    .order('is_current', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function enrichPeripherals(
  userId: string,
  rows: RelationshipPeripheral[]
): Promise<RelationshipPeripheral[]> {
  if (rows.length === 0) return [];

  const charIds = new Set<string>();
  for (const row of rows) {
    if (row.anchor_person_type === 'character') charIds.add(row.anchor_person_id);
    if (row.peripheral_person_type === 'character' && row.peripheral_person_id) {
      charIds.add(row.peripheral_person_id);
    }
  }

  const nameById = new Map<string, string>();
  if (charIds.size > 0) {
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId)
      .in('id', [...charIds]);
    for (const c of chars ?? []) nameById.set(c.id, c.name);
  }

  return rows.map((row) => ({
    ...row,
    anchor_name: nameById.get(row.anchor_person_id) ?? (row.metadata?.anchor_name as string | undefined),
    peripheral_name:
      (row.peripheral_person_id ? nameById.get(row.peripheral_person_id) : undefined) ??
      row.peripheral_surface,
  }));
}

export async function listPeripheralsForCharacter(
  userId: string,
  characterId: string,
  options: { domain?: RelationshipPeripheryDomain; includeDismissed?: boolean } = {}
): Promise<RelationshipPeripheral[]> {
  const { domain, includeDismissed = false } = options;
  let query = supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('anchor_person_id', characterId)
    .eq('anchor_person_type', 'character')
    .order('confidence', { ascending: false });
  if (domain) query = query.eq('domain', domain);
  if (!includeDismissed) query = query.neq('tier', 'dismissed');

  const { data, error } = await query;
  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') return [];
    throw error;
  }
  return enrichPeripherals(userId, (data ?? []) as RelationshipPeripheral[]);
}

export async function listPeripheralsForRelationship(
  userId: string,
  relationshipId: string,
  includeDismissed = false
): Promise<RelationshipPeripheral[]> {
  let query = supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('anchor_relationship_id', relationshipId)
    .eq('domain', 'romantic')
    .order('confidence', { ascending: false });
  if (!includeDismissed) query = query.neq('tier', 'dismissed');

  const { data, error } = await query;
  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') return [];
    throw error;
  }
  return enrichPeripherals(userId, (data ?? []) as RelationshipPeripheral[]);
}

async function upsertPeripheral(
  userId: string,
  hit: VicariousRelationshipHit,
  anchor: { personId: string; personType: 'character' | 'omega_entity'; name: string },
  anchorRelationshipId: string | null,
  peripheral: { personId: string | null; personType: 'character' | 'omega_entity' | null },
  messageId?: string
): Promise<RelationshipPeripheral | null> {
  if (hit.confidence < MIN_CONFIDENCE) return null;

  const { data: existing } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('anchor_person_id', anchor.personId)
    .eq('anchor_person_type', anchor.personType)
    .eq('domain', hit.domain)
    .ilike('peripheral_surface', hit.objectSurface)
    .neq('tier', 'dismissed')
    .maybeSingle();

  const sourceIds = new Set<string>(existing?.source_message_ids ?? []);
  if (messageId) sourceIds.add(messageId);

  const payload = {
    user_id: userId,
    domain: hit.domain,
    anchor_relationship_id: hit.domain === 'romantic' ? anchorRelationshipId : null,
    anchor_person_id: anchor.personId,
    anchor_person_type: anchor.personType,
    peripheral_person_id: peripheral.personId,
    peripheral_person_type: peripheral.personType,
    peripheral_surface: hit.objectSurface,
    role: hit.role,
    tier: hit.tier,
    confidence: Math.max(existing?.confidence ?? 0, hit.confidence),
    has_met: hit.hasMet || Boolean(existing?.has_met),
    proximity: hit.proximity,
    associated_via: 'chat_extract',
    source_message_ids: [...sourceIds],
    metadata: {
      ...(typeof existing?.metadata === 'object' && existing.metadata ? existing.metadata : {}),
      lexical_evidence: hit.evidence,
      glossary_cues: hit.cues,
      ontology_tags: hit.ontologyTags,
      anchor_name: anchor.name,
      parsed_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as RelationshipPeripheral;
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data as RelationshipPeripheral;
}

export async function applyVicariousRelationshipHit(
  userId: string,
  hit: VicariousRelationshipHit,
  messageId?: string,
  anchorOverride?: { personId: string; personType: 'character' | 'omega_entity'; name: string }
): Promise<RelationshipPeripheral | null> {
  const anchor =
    anchorOverride ?? (await resolveRomanticPartner(userId, hit.subjectName));
  if (!anchor) return null;

  let peripheralPersonId: string | null = null;
  let peripheralPersonType: 'character' | 'omega_entity' | null = null;
  if (hit.objectName) {
    const resolved = await resolveRomanticPartner(userId, hit.objectName);
    if (resolved) {
      peripheralPersonId = resolved.personId;
      peripheralPersonType = resolved.personType;
    }
  }

  const anchorRelationshipId =
    hit.domain === 'romantic'
      ? await findAnchorRelationshipId(userId, anchor.personId, anchor.personType)
      : null;

  return upsertPeripheral(
    userId,
    hit,
    anchor,
    anchorRelationshipId,
    { personId: peripheralPersonId, personType: peripheralPersonType },
    messageId
  );
}

export async function ingestRelationshipPeripheralsFromMessage(
  userId: string,
  rawText: string,
  messageId: string,
  anchorNames: string[] = [],
  mentionedEntities: MentionedEntity[] = []
): Promise<{ saved: number; peripherals: RelationshipPeripheral[] }> {
  if (!rawText?.trim() || !hasVicariousRelationshipSignals(rawText)) {
    return { saved: 0, peripherals: [] };
  }

  const hits = parseVicariousRelationships(rawText, anchorNames);
  const peripherals: RelationshipPeripheral[] = [];

  for (const hit of hits) {
    try {
      const anchorFromMention = mentionedEntities.find(
        (e) => normalizeNameKey(e.name) === normalizeNameKey(hit.subjectName)
      );
      const anchor = anchorFromMention
        ? { personId: anchorFromMention.id, personType: anchorFromMention.type, name: anchorFromMention.name }
        : undefined;

      const saved = await applyVicariousRelationshipHit(userId, hit, messageId, anchor);
      if (saved) peripherals.push(saved);
    } catch (err) {
      logger.debug({ err, userId, subject: hit.subjectName, domain: hit.domain }, 'Vicarious hit failed');
    }
  }

  if (peripherals.length > 0) {
    logger.debug({ userId, messageId, saved: peripherals.length }, 'Relationship periphery ingested');
  }

  return { saved: peripherals.length, peripherals };
}

export async function confirmPeripheral(
  userId: string,
  peripheralId: string
): Promise<RelationshipPeripheral> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({ tier: 'confirmed', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', peripheralId)
    .select('*')
    .single();
  if (error) throw error;
  const [enriched] = await enrichPeripherals(userId, [data as RelationshipPeripheral]);
  return enriched;
}

export async function dismissPeripheral(
  userId: string,
  peripheralId: string
): Promise<RelationshipPeripheral> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({ tier: 'dismissed', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', peripheralId)
    .select('*')
    .single();
  if (error) throw error;
  const [enriched] = await enrichPeripherals(userId, [data as RelationshipPeripheral]);
  return enriched;
}

export async function promotePeripheralToCharacter(
  userId: string,
  peripheralId: string
): Promise<{ peripheral: RelationshipPeripheral; characterId: string }> {
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('id', peripheralId)
    .single();
  if (fetchErr || !row) throw fetchErr ?? new Error('Peripheral not found');

  if (row.peripheral_person_id && row.peripheral_person_type === 'character') {
    const [enriched] = await enrichPeripherals(userId, [row as RelationshipPeripheral]);
    return { peripheral: enriched, characterId: row.peripheral_person_id };
  }

  const domain = (row.domain ?? 'romantic') as RelationshipPeripheryDomain;
  const tag = DOMAIN_TAGS[domain] ?? 'relationship-peripheral';
  const displayName = row.peripheral_surface;

  const { data: character, error: createErr } = await supabaseAdmin
    .from('characters')
    .insert({
      user_id: userId,
      name: isIndividualPersonName(displayName) ? displayName : `Unknown (${displayName})`,
      role: `${domain} periphery — ${row.role}`,
      summary: (row.metadata as { lexical_evidence?: string })?.lexical_evidence ?? '',
      tags: [tag, 'relationship-peripheral', row.role],
      proximity_level: row.proximity ?? 'third_party',
      has_met: row.has_met ?? false,
      associated_with_character_ids: [row.anchor_person_id],
      is_nickname: !isIndividualPersonName(displayName),
      context_of_mention: `Vicarious ${domain} link via character ${row.anchor_person_id}`,
      status: 'active',
      metadata: {
        source: 'relationship_peripheral',
        peripheral_id: peripheralId,
        domain,
        tier: row.tier,
      },
    })
    .select('id')
    .single();
  if (createErr) throw createErr;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from(TABLE)
    .update({
      peripheral_person_id: character.id,
      peripheral_person_type: 'character',
      tier: 'confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', peripheralId)
    .select('*')
    .single();
  if (updateErr) throw updateErr;

  const [enriched] = await enrichPeripherals(userId, [updated as RelationshipPeripheral]);
  return { peripheral: enriched, characterId: character.id };
}

export async function listPeripheralsForUser(
  userId: string,
  options: {
    domain?: RelationshipPeripheryDomain;
    includeDismissed?: boolean;
    limit?: number;
  } = {}
): Promise<RelationshipPeripheral[]> {
  const { domain, includeDismissed = false, limit = 200 } = options;
  let query = supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (!includeDismissed) query = query.neq('tier', 'dismissed');
  if (domain) query = query.eq('domain', domain);
  const { data, error } = await query;
  if (error) throw error;
  return enrichPeripherals(userId, (data ?? []) as RelationshipPeripheral[]);
}

export type PeripheryAnalytics = {
  total: number;
  suspected: number;
  confirmed: number;
  dismissed: number;
  byDomain: Record<string, number>;
  confirmRate: number;
  crossAnchorSurfaces: Array<{ surface: string; anchorCount: number; domains: string[] }>;
  topAnchors: Array<{ anchorPersonId: string; anchorName: string; count: number }>;
  recent: RelationshipPeripheral[];
};

export async function getPeripheryAnalytics(userId: string): Promise<PeripheryAnalytics> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const rows = (data ?? []) as RelationshipPeripheral[];
  const enriched = await enrichPeripherals(userId, rows);

  const byDomain: Record<string, number> = {};
  const anchorCounts = new Map<string, { name: string; count: number }>();
  const surfaceAnchors = new Map<string, { anchors: Set<string>; domains: Set<string> }>();

  let suspected = 0;
  let confirmed = 0;
  let dismissed = 0;

  for (const row of enriched) {
    byDomain[row.domain] = (byDomain[row.domain] ?? 0) + 1;
    if (row.tier === 'suspected') suspected++;
    else if (row.tier === 'confirmed') confirmed++;
    else if (row.tier === 'dismissed') dismissed++;

    const anchorKey = row.anchor_person_id;
    const existing = anchorCounts.get(anchorKey) ?? { name: row.anchor_name ?? anchorKey, count: 0 };
    existing.count++;
    anchorCounts.set(anchorKey, existing);

    const surfaceKey = normalizeNameKey(row.peripheral_surface);
    const surfaceEntry = surfaceAnchors.get(surfaceKey) ?? { anchors: new Set(), domains: new Set() };
    surfaceEntry.anchors.add(anchorKey);
    surfaceEntry.domains.add(row.domain);
    surfaceAnchors.set(surfaceKey, surfaceEntry);
  }

  const crossAnchorSurfaces = Array.from(surfaceAnchors.entries())
    .filter(([, v]) => v.anchors.size > 1)
    .map(([surface, v]) => ({
      surface,
      anchorCount: v.anchors.size,
      domains: Array.from(v.domains),
    }))
    .sort((a, b) => b.anchorCount - a.anchorCount)
    .slice(0, 8);

  const topAnchors = Array.from(anchorCounts.entries())
    .map(([anchorPersonId, { name, count }]) => ({
      anchorPersonId,
      anchorName: name,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const activeTotal = suspected + confirmed;
  const confirmRate = activeTotal > 0 ? confirmed / activeTotal : 0;

  return {
    total: enriched.length,
    suspected,
    confirmed,
    dismissed,
    byDomain,
    confirmRate,
    crossAnchorSurfaces,
    topAnchors,
    recent: enriched.filter((r) => r.tier !== 'dismissed').slice(0, 12),
  };
}

// Romantic-compat aliases
export const ingestVicariousFromMessage = ingestRelationshipPeripheralsFromMessage;
export const applyVicariousHit = applyVicariousRelationshipHit;
