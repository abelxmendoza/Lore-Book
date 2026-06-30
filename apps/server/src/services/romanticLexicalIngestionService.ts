/**
 * Live + batch romantic lexical ingestion — applies glossary/ontology parsing
 * to a single message and upserts Love & Relationships records.
 */

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { isIndividualPersonName } from '../utils/personNameValidation';
import {
  hasRomanticSignals,
  parseRomanticEpisode,
  type RomanticLexicalHit,
} from './ontology/romanticIntelligence';
import {
  romanticRelationshipDetector,
  type DetectedRomanticRelationship,
} from './conversationCentered/romanticRelationshipDetector';
import { extractAndLogInteraction } from './conversationCentered/romanticInteractionExtractor';
import { assessRomanticPartnerEligibility } from './conversationCentered/romanticEligibility';
import { organizationService } from './organizationService';
import { omegaMemoryService } from './omegaMemoryService';
import { supabaseAdmin } from './supabaseClient';
import type { EntityType } from '../types/omegaMemory';

export type ResolvedRomanticPartner = {
  personId: string;
  personType: 'character' | 'omega_entity';
  name: string;
};

export type AppliedRomanticLexicalHit = {
  relationshipId: string;
  personId: string;
  personType: 'character' | 'omega_entity';
  partnerName: string;
  hit: RomanticLexicalHit;
};

export type RomanticLexicalIngestResult = {
  saved: number;
  relationships: AppliedRomanticLexicalHit[];
};

type MentionedEntity = {
  id: string;
  name: string;
  type: 'character' | 'omega_entity';
};

const MIN_CONFIDENCE = 0.65;

export async function resolveRomanticPartner(
  userId: string,
  name: string
): Promise<ResolvedRomanticPartner | null> {
  if (!isIndividualPersonName(name)) return null;
  const key = normalizeNameKey(name);

  const { data: characters } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, status')
    .eq('user_id', userId)
    .neq('status', 'archived');

  for (const row of characters ?? []) {
    const keys = [normalizeNameKey(row.name), ...((row.alias as string[] | null) ?? []).map(normalizeNameKey)];
    if (keys.includes(key)) {
      return { personId: row.id, personType: 'character', name: row.name };
    }
  }

  const resolved = await omegaMemoryService.resolveEntities(userId, [
    { name, type: 'PERSON' as EntityType },
  ]);
  const entity = resolved[0];
  if (!entity?.id) return null;

  const { data: linkedCharacter } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId)
    .eq('omega_entity_id', entity.id)
    .neq('status', 'archived')
    .maybeSingle();

  if (linkedCharacter?.id) {
    return { personId: linkedCharacter.id, personType: 'character', name: linkedCharacter.name };
  }

  return {
    personId: entity.id,
    personType: 'omega_entity',
    name: entity.primary_name ?? name,
  };
}

function matchMentionedPartner(
  hit: RomanticLexicalHit,
  mentioned: MentionedEntity[]
): ResolvedRomanticPartner | null {
  const key = normalizeNameKey(hit.partnerName);
  for (const entity of mentioned) {
    if (!isIndividualPersonName(entity.name)) continue;
    if (normalizeNameKey(entity.name) === key) {
      return { personId: entity.id, personType: entity.type, name: entity.name };
    }
  }
  return null;
}

export async function applyRomanticLexicalHit(
  userId: string,
  hit: RomanticLexicalHit,
  messageId?: string,
  partnerOverride?: ResolvedRomanticPartner
): Promise<AppliedRomanticLexicalHit | null> {
  if (hit.confidence < MIN_CONFIDENCE) return null;

  const partner = partnerOverride ?? (await resolveRomanticPartner(userId, hit.partnerName));
  if (!partner) return null;

  // Skip role labels / third-party partners / band names before touching the DB.
  const knownOrganizationNames = await organizationService
    .listOrganizationLabels(userId)
    .catch(() => [] as string[]);
  const eligibility = assessRomanticPartnerEligibility({
    name: partner.name,
    evidence: hit.evidence,
    knownOrganizationNames,
  });
  if (!eligibility.eligible) return null;

  const detected: DetectedRomanticRelationship = {
    personId: partner.personId,
    personType: partner.personType,
    relationshipType: hit.relationshipType,
    status: hit.status,
    confidence: hit.confidence,
    evidence: hit.evidence,
    isSituationship: hit.isSituationship,
    exclusivityStatus: hit.isSituationship ? 'not_exclusive' : 'unknown',
    partnerName: partner.name,
  };

  await romanticRelationshipDetector.saveRelationship(userId, detected, messageId);

  const { data: relRow } = await supabaseAdmin
    .from('romantic_relationships')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('person_id', partner.personId)
    .eq('person_type', partner.personType)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!relRow?.id) return null;

  await supabaseAdmin
    .from('romantic_relationships')
    .update({
      metadata: {
        ...(typeof relRow.metadata === 'object' && relRow.metadata ? relRow.metadata : {}),
        lexical_evidence: hit.evidence,
        glossary_cues: hit.cues,
        ontology_tags: hit.ontologyTags,
        parsed_at: new Date().toISOString(),
        parsing: 'lexical_intelligence',
        source_message_id: messageId,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', relRow.id);

  if (messageId) {
    await extractAndLogInteraction(userId, relRow.id, hit.evidence, messageId);
  }

  return {
    relationshipId: relRow.id,
    personId: partner.personId,
    personType: partner.personType,
    partnerName: partner.name,
    hit,
  };
}

/** Parse one message and upsert romantic relationships from lexical intelligence. */
export async function ingestRomanticLexicalFromMessage(
  userId: string,
  rawText: string,
  messageId: string,
  mentionedEntities: MentionedEntity[] = []
): Promise<RomanticLexicalIngestResult> {
  if (!rawText?.trim() || !hasRomanticSignals(rawText)) {
    return { saved: 0, relationships: [] };
  }

  const hits = parseRomanticEpisode(rawText);
  const bestByPartner = new Map<string, RomanticLexicalHit>();
  for (const hit of hits) {
    const key = normalizeNameKey(hit.partnerName);
    const prev = bestByPartner.get(key);
    if (!prev || hit.confidence > prev.confidence) bestByPartner.set(key, hit);
  }

  const relationships: AppliedRomanticLexicalHit[] = [];

  for (const hit of bestByPartner.values()) {
    try {
      const partner =
        matchMentionedPartner(hit, mentionedEntities) ??
        (await resolveRomanticPartner(userId, hit.partnerName));
      if (!partner) continue;

      const applied = await applyRomanticLexicalHit(userId, hit, messageId, partner);
      if (applied) relationships.push(applied);
    } catch (err) {
      logger.debug({ err, userId, partner: hit.partnerName }, 'Lexical romantic hit failed (non-blocking)');
    }
  }

  if (relationships.length > 0) {
    logger.debug(
      { userId, messageId, saved: relationships.length },
      'Live lexical romantic ingestion'
    );
  }

  return { saved: relationships.length, relationships };
}
