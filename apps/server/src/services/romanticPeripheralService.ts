/**
 * Vicarious romantic periphery — other partners/lovers a relationship person may have.
 */
import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { isIndividualPersonName } from '../utils/personNameValidation';
import {
  hasVicariousRomanticSignals,
  parseVicariousEpisode,
  type VicariousRomanticHit,
} from './ontology/vicariousRomanticIntelligence';
import { resolveRomanticPartner } from './romanticLexicalIngestionService';
import { supabaseAdmin } from './supabaseClient';

export type RomanticPeripheralTier = 'suspected' | 'confirmed' | 'dismissed';

export type RomanticPeripheral = {
  id: string;
  user_id: string;
  anchor_relationship_id: string | null;
  anchor_person_id: string;
  anchor_person_type: 'character' | 'omega_entity';
  peripheral_person_id: string | null;
  peripheral_person_type: 'character' | 'omega_entity' | null;
  peripheral_surface: string;
  role: string;
  tier: RomanticPeripheralTier;
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

type MentionedEntity = {
  id: string;
  name: string;
  type: 'character' | 'omega_entity';
};

const MIN_CONFIDENCE = 0.65;

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
  rows: RomanticPeripheral[]
): Promise<RomanticPeripheral[]> {
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

export async function listPeripheralsForRelationship(
  userId: string,
  relationshipId: string,
  includeDismissed = false
): Promise<RomanticPeripheral[]> {
  let query = supabaseAdmin
    .from('romantic_peripherals')
    .select('*')
    .eq('user_id', userId)
    .eq('anchor_relationship_id', relationshipId)
    .order('confidence', { ascending: false });

  if (!includeDismissed) query = query.neq('tier', 'dismissed');

  const { data, error } = await query;
  if (error) {
    if ((error as { code?: string }).code === 'PGRST205') return [];
    throw error;
  }
  return enrichPeripherals(userId, (data ?? []) as RomanticPeripheral[]);
}

async function upsertPeripheral(
  userId: string,
  hit: VicariousRomanticHit,
  anchor: { personId: string; personType: 'character' | 'omega_entity'; name: string },
  anchorRelationshipId: string | null,
  peripheral: { personId: string | null; personType: 'character' | 'omega_entity' | null },
  messageId?: string
): Promise<RomanticPeripheral | null> {
  if (hit.confidence < MIN_CONFIDENCE) return null;

  const surfaceKey = normalizeNameKey(hit.objectSurface);
  const { data: existing } = await supabaseAdmin
    .from('romantic_peripherals')
    .select('*')
    .eq('user_id', userId)
    .eq('anchor_person_id', anchor.personId)
    .eq('anchor_person_type', anchor.personType)
    .ilike('peripheral_surface', hit.objectSurface)
    .neq('tier', 'dismissed')
    .maybeSingle();

  const sourceIds = new Set<string>(existing?.source_message_ids ?? []);
  if (messageId) sourceIds.add(messageId);

  const payload = {
    user_id: userId,
    anchor_relationship_id: anchorRelationshipId,
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
      surface_key: surfaceKey,
    },
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('romantic_peripherals')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as RomanticPeripheral;
  }

  const { data, error } = await supabaseAdmin
    .from('romantic_peripherals')
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data as RomanticPeripheral;
}

export async function applyVicariousHit(
  userId: string,
  hit: VicariousRomanticHit,
  messageId?: string,
  anchorOverride?: { personId: string; personType: 'character' | 'omega_entity'; name: string }
): Promise<RomanticPeripheral | null> {
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

  const anchorRelationshipId = await findAnchorRelationshipId(
    userId,
    anchor.personId,
    anchor.personType
  );

  return upsertPeripheral(
    userId,
    hit,
    anchor,
    anchorRelationshipId,
    { personId: peripheralPersonId, personType: peripheralPersonType },
    messageId
  );
}

export async function ingestVicariousFromMessage(
  userId: string,
  rawText: string,
  messageId: string,
  anchorNames: string[] = [],
  mentionedEntities: MentionedEntity[] = []
): Promise<{ saved: number; peripherals: RomanticPeripheral[] }> {
  if (!rawText?.trim() || !hasVicariousRomanticSignals(rawText)) {
    return { saved: 0, peripherals: [] };
  }

  const hits = parseVicariousEpisode(rawText, anchorNames);
  const peripherals: RomanticPeripheral[] = [];

  for (const hit of hits) {
    try {
      const anchorFromMention = mentionedEntities.find(
        (e) => normalizeNameKey(e.name) === normalizeNameKey(hit.subjectName)
      );
      const anchor = anchorFromMention
        ? { personId: anchorFromMention.id, personType: anchorFromMention.type, name: anchorFromMention.name }
        : undefined;

      const saved = await applyVicariousHit(userId, hit, messageId, anchor);
      if (saved) peripherals.push(saved);
    } catch (err) {
      logger.debug({ err, userId, subject: hit.subjectName }, 'Vicarious hit failed (non-blocking)');
    }
  }

  if (peripherals.length > 0) {
    logger.debug({ userId, messageId, saved: peripherals.length }, 'Vicarious romantic periphery ingested');
  }

  return { saved: peripherals.length, peripherals };
}

export async function confirmPeripheral(userId: string, peripheralId: string): Promise<RomanticPeripheral> {
  const { data, error } = await supabaseAdmin
    .from('romantic_peripherals')
    .update({ tier: 'confirmed', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', peripheralId)
    .select('*')
    .single();
  if (error) throw error;
  const [enriched] = await enrichPeripherals(userId, [data as RomanticPeripheral]);
  return enriched;
}

export async function dismissPeripheral(userId: string, peripheralId: string): Promise<RomanticPeripheral> {
  const { data, error } = await supabaseAdmin
    .from('romantic_peripherals')
    .update({ tier: 'dismissed', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', peripheralId)
    .select('*')
    .single();
  if (error) throw error;
  const [enriched] = await enrichPeripherals(userId, [data as RomanticPeripheral]);
  return enriched;
}

export async function promotePeripheralToCharacter(
  userId: string,
  peripheralId: string
): Promise<{ peripheral: RomanticPeripheral; characterId: string }> {
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('romantic_peripherals')
    .select('*')
    .eq('user_id', userId)
    .eq('id', peripheralId)
    .single();
  if (fetchErr || !row) throw fetchErr ?? new Error('Peripheral not found');

  if (row.peripheral_person_id && row.peripheral_person_type === 'character') {
    const [enriched] = await enrichPeripherals(userId, [row as RomanticPeripheral]);
    return { peripheral: enriched, characterId: row.peripheral_person_id };
  }

  const displayName = row.peripheral_surface;
  const { data: character, error: createErr } = await supabaseAdmin
    .from('characters')
    .insert({
      user_id: userId,
      name: isIndividualPersonName(displayName) ? displayName : `Unknown (${displayName})`,
      role: `Romantic periphery — ${row.role}`,
      summary: (row.metadata as { lexical_evidence?: string })?.lexical_evidence ?? '',
      tags: ['romantic-peripheral', row.role],
      proximity_level: row.proximity ?? 'third_party',
      has_met: row.has_met ?? false,
      associated_with_character_ids: [row.anchor_person_id],
      is_nickname: !isIndividualPersonName(displayName),
      context_of_mention: `Suspected connection via ${row.anchor_person_id}`,
      status: 'active',
      metadata: {
        source: 'romantic_peripheral',
        peripheral_id: peripheralId,
        tier: row.tier,
      },
    })
    .select('id')
    .single();
  if (createErr) throw createErr;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('romantic_peripherals')
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

  const [enriched] = await enrichPeripherals(userId, [updated as RomanticPeripheral]);
  return { peripheral: enriched, characterId: character.id };
}
