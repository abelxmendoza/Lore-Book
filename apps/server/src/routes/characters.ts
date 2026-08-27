import { randomUUID } from 'crypto';

import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';
import { guardOpenAiRoute } from '../middleware/apiProtection';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { checkAiRequestLimit } from '../middleware/subscription';
import { characterAnalyticsService } from '../services/characterAnalyticsService';
import { characterIdentityIndexService } from '../services/characterIdentityIndexService';
import { findSimilarCharacter } from '../services/characterDeduplicationService';
import { characterMergeService } from '../services/characterMergeService';
import { characterRegistry } from '../services/characterRegistry';
import { countCanonicalEventsForCharacters } from '../services/characters/canonicalCharacterEventCount';
import { entityAttributeDetector } from '../services/conversationCentered/entityAttributeDetector';
import { peoplePlacesService } from '../services/peoplePlacesService';
import { supabaseAdmin } from '../services/supabaseClient';
import { characterAvatarUrl, avatarStyleFor } from '../utils/avatar';
import { cacheAvatar } from '../utils/cacheAvatar';
import { incrementAiRequestCount } from '../services/usageTracking';
import { displayAvatarUrl, backfillMissingAvatars } from '../services/characterAvatarService';
import {
  normalizeNameKey,
  normalizeDuplicateKey,
  isTrailingPossessiveVariant,
  splitPersonName,
} from '../utils/nameNormalization';
import { classifyMentionKind } from '../utils/entityMentionClassifier';
import { resolveCompanionSpecies } from '../utils/companionSpecies';
import { selfCharacterService } from '../services/selfCharacterService';
import { characterRestoreService } from '../services/characterRestoreService';
import { characterConversationRescanService } from '../services/characterConversationRescanService';
import { asyncHandler } from '../utils/asyncHandler';
import { createMemoryUpload } from '../middleware/multerConfig';
import {
  filterValidAliases,
  shouldMergeCharacterRecords,
} from '../services/characters/aliasConstraintService';
import { dedupeRelationshipsByPerson } from '../services/relationships/dedupeCharacterRelationships';
import {
  isSelfCharacterMetadata,
  resolveRelatedPersonType,
} from '../services/relationships/relatedPersonType';
import {
  characterConsolidationReviewService,
} from '../services/characters/characterConsolidationReviewService';
import {
  filterSelfCandidatesForIncoming,
  isSelfCharacterRow,
} from '../services/identity/selfIdentityGuard';
import {
  confirmPeripheral,
  dismissPeripheral,
  listPeripheralsForCharacter,
  promotePeripheralToCharacter,
} from '../services/relationshipPeripheralService';
import { characterTitleRoutes } from './characterTitleRoutes';
import { characterCardAuditService } from '../services/characters/audit/characterCardAuditService';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip malformed optional UUID fields so suggestion adds don't 400 on legacy ids. */
function sanitizeCharacterCreateBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const record = { ...(body as Record<string, unknown>) };
  for (const key of ['omegaEntityId', 'questionId'] as const) {
    const value = record[key];
    if (typeof value === 'string' && !UUID_RE.test(value.trim())) {
      delete record[key];
    }
  }
  return record;
}

const createCharacterSchema = z.object({
  name: z.string().min(1),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  alias: z.array(z.string()).optional(),
  pronouns: z.string().optional(),
  /** Non-null marks this as a pet or robot companion rather than a person. */
  species: z.string().optional(),
  /** Surrounding mention text from a suggestion — used to infer companion species. */
  context: z.string().max(4000).optional(),
  kind: z.enum(['person', 'pet']).optional(),
  archetype: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isNickname: z.boolean().optional(),
  proximity: z.enum(['direct', 'indirect', 'distant', 'unmet', 'third_party']).optional(),
  hasMet: z.boolean().optional(),
  relationshipDepth: z.enum(['close', 'moderate', 'casual', 'acquaintance', 'mentioned_only']).optional(),
  associatedWith: z.array(z.string()).optional(), // Character names
  likelihoodToMeet: z.enum(['likely', 'possible', 'unlikely', 'never']).optional(),
  social_media: z
    .object({
      instagram: z.string().optional(),
      twitter: z.string().optional(),
      facebook: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
      website: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional()
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  omegaEntityId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
  suggestionId: z.string().optional(),
});

const updateCharacterSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  alias: z.array(z.string()).optional(),
  pronouns: z.string().optional(),
  /** Non-null marks this as a pet (dog, cat, etc.) rather than a person. */
  species: z.string().optional(),
  archetype: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isNickname: z.boolean().optional(),
  proximity: z.enum(['direct', 'indirect', 'distant', 'unmet', 'third_party']).optional(),
  hasMet: z.boolean().optional(),
  relationshipDepth: z.enum(['close', 'moderate', 'casual', 'acquaintance', 'mentioned_only']).optional(),
  associatedWith: z.array(z.string()).optional(), // Character names
  likelihoodToMeet: z.enum(['likely', 'possible', 'unlikely', 'never']).optional(),
  social_media: z
    .object({
      instagram: z.string().optional(),
      twitter: z.string().optional(),
      facebook: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
      website: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional()
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** Manual pin. A level sets metadata.importance_level_source='user_confirmed'; null clears the pin and re-scores. */
  importanceLevel: z.enum(['protagonist', 'major', 'supporting', 'minor', 'background']).nullable().optional(),
});

const resolveEntityQuestionSchema = z.object({
  selected_character_ids: z.array(z.string().uuid()).default([]),
  create_new: z.boolean().default(false),
  skip: z.boolean().default(false),
});

const mergeCharactersSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
  reason: z.string().optional(),
});

const keepSeparateSchema = z.object({
  left_id: z.string().uuid(),
  right_id: z.string().uuid(),
  decision: z.enum(['KEEP_SEPARATE', 'NOT_SAME_PERSON']).default('NOT_SAME_PERSON'),
  reason_code: z.string().optional(),
});

const NON_PERSON_NAME_PATTERNS = [
  /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way)\b/i,
  /\b(?:pool|billiards|bar|club|venue|theater|theatre|restaurant|cafe|coffee|lounge|park|beach|arena|stadium)\b/i,
  /\b(?:show|event|anniversary|party|night|set)\b/i,
  /\b(?:dj|band|artist|performer)\s+for\b/i,
];

function parseName(fullName: string): { firstName: string; lastName?: string } {
  return splitPersonName(fullName);
}

function cleanEntityName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function uniqueNames(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanEntityName(value);
    if (!cleaned) continue;
    const key = normalizeNameKey(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function looksLikeNonPersonName(name: string): boolean {
  const normalized = normalizeNameKey(name);
  if (normalized.split(' ').length > 5) return true;
  if (classifyMentionKind(name).kind !== 'person') return true;
  return NON_PERSON_NAME_PATTERNS.some(pattern => pattern.test(name));
}

function extractAliasPairs(message: string): Array<{ name: string; alias: string }> {
  const pairs: Array<{ name: string; alias: string }> = [];
  const akaPattern = /\b([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})\s+(?:aka|a\.k\.a\.|also known as)\s+([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})/gi;
  for (const match of message.matchAll(akaPattern)) {
    const before = message.slice(Math.max(0, match.index - 12), match.index);
    if (/\bfor\s+$/i.test(before)) continue;
    const name = cleanEntityName(match[1]);
    const alias = cleanEntityName(match[2]);
    if (name && alias && !looksLikeNonPersonName(name) && !looksLikeNonPersonName(alias)) {
      pairs.push({ name, alias });
    }
  }

  const realNamePattern = /\b([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})'?s?\s+name\s+is\s+([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2})/gi;
  for (const match of message.matchAll(realNamePattern)) {
    const alias = cleanEntityName(match[1]);
    const name = cleanEntityName(match[2]);
    if (name && alias && !looksLikeNonPersonName(name) && !looksLikeNonPersonName(alias)) {
      pairs.push({ name, alias });
    }
  }

  return pairs;
}

function nameHasMultipleParts(name: string): boolean {
  return normalizeNameKey(name).split(' ').filter(Boolean).length > 1;
}

function withAliasDisambiguatedName(name: string, aliases: string[]): string {
  if (nameHasMultipleParts(name) || aliases.length === 0) return name;
  return `${name} / ${aliases[0]}`;
}

function normalizeSignalText(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[._@-]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function displayNameHasFamilyTitle(name: string): boolean {
  const normalized = normalizeSignalText(name);
  return /^(?:my\s+)?(?:t[ií]o|t[ií]a|uncle|aunt|mom|mother|dad|father|grandma|grandpa|abuela|abuelo|cousin|sister|brother)(?:\s|$)/i.test(normalized);
}

function inferCharacterCategories(characterData: Partial<z.infer<typeof createCharacterSchema>>, displayName: string) {
  const confirmed = new Set<string>();
  const potential = new Set<string>();
  const metadata = characterData.metadata ?? {};
  const addKnown = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) confirmed.add(value.trim().toLowerCase());
    if (Array.isArray(value)) value.forEach(addKnown);
  };

  addKnown(characterData.archetype);
  addKnown(characterData.role);
  addKnown(characterData.tags);
  addKnown((metadata as any).relationship_type);
  addKnown((metadata as any).relationship_types);
  addKnown((metadata as any).categories);

  if (displayNameHasFamilyTitle(displayName)) confirmed.add('family');

  // Exclude raw display names/aliases from generic keyword scans. Stage names
  // can contain family words ("Oscuri.dad", "Goth Tio", "Mom Jeans") without
  // making the person family.
  const text = [
    characterData.summary,
    characterData.role,
    ...(characterData.tags ?? []),
    (characterData as any).context,
  ].map(normalizeSignalText).filter(Boolean).join(' ');

  if (/\b(?:my|his|her|their|our)\s+(?:grandmother|grandfather|mom|dad|mother|father|sister|brother|cousin|aunt|uncle|grandma|grandpa|abuela|abuelo|t[ií]o|t[ií]a|family)\b/.test(text) || /\bfamily\s+(?:member|side|relative)\b/.test(text)) confirmed.add('family');
  if (/\b(dated|dating|date|romantic|girlfriend|boyfriend|situationship|crush|ex|hooked up|went out|partner|wife|husband)\b/.test(text)) confirmed.add('romantic');
  if (/\b(mentor|mentorship|teacher|instructor|bootcamp|coach|professor|advisor|taught me|guided me)\b/.test(text)) confirmed.add('mentor');
  if (/\b(brighthire|northstar logistics|agency|recruiter|onboarding|hiring|background check|identity verification|paperwork|professional|colleague|coworker|co worker|job|career|client|manager|boss)\b/.test(text)) confirmed.add('professional');
  if (/\b(bandmate|creative|collaborator|collab|co founder|cofounder|artist|music|writing|producer|dj|show|set|song|studio|make music|record|perform)\b/.test(text)) confirmed.add('creative');
  if (/\b(friend|ally|buddy|roommate|homie|new friends?)\b/.test(text)) confirmed.add('friend');
  if (/\b(asked|might|could|potential(?:ly)?|want(?:ed)? to|trying to)\b.{0,40}\b(collab|collaborate|work together|make music|record|hire|book)\b/.test(text)) {
    potential.add('professional');
    confirmed.add('creative');
  }

  return {
    confirmed: [...confirmed],
    potential: [...potential].filter(category => !confirmed.has(category)),
  };
}

function inferInitialImportance(characterData: Partial<z.infer<typeof createCharacterSchema>>, categories: string[]) {
  let score = 10;
  if (characterData.proximity === 'direct') score += 18;
  if (characterData.proximity === 'indirect') score += 8;
  if (characterData.hasMet) score += 10;
  if (characterData.relationshipDepth === 'close') score += 30;
  if (characterData.relationshipDepth === 'moderate') score += 18;
  if (characterData.relationshipDepth === 'casual') score += 8;
  if (characterData.summary && characterData.summary.length > 80) score += 14;
  if (categories.some(category => ['family', 'romantic', 'mentor'].includes(category))) score += 18;
  if (categories.some(category => ['friend', 'creative', 'professional'].includes(category))) score += 8;

  const importanceScore = Math.max(0, Math.min(100, score));
  const importanceLevel =
    importanceScore >= 70 ? 'major' :
    importanceScore >= 40 ? 'supporting' :
    'minor';
  return { importanceLevel, importanceScore };
}

function mergeCharacterPayloads(characters: any[]): any[] {
  const merged: any[] = [];
  const keyToIndex = new Map<string, number>();

  for (const character of characters) {
    const name = cleanEntityName(character.name);
    if (!name || looksLikeNonPersonName(name)) continue;
    const aliases = filterValidAliases(name, uniqueNames(character.alias ?? [])).filter(
      alias => normalizeNameKey(alias) !== normalizeNameKey(name)
    );
    const keys = [name, ...aliases].map(normalizeNameKey);
    const existingIndex = keys.map(key => keyToIndex.get(key)).find(index => index !== undefined);

    if (existingIndex === undefined) {
      const next = { ...character, name, alias: aliases };
      merged.push(next);
      const index = merged.length - 1;
      for (const key of keys) keyToIndex.set(key, index);
      continue;
    }

    const existing = merged[existingIndex];
    if (!shouldMergeCharacterRecords(existing.name, name, existing.alias ?? [], aliases)) {
      const next = { ...character, name, alias: aliases };
      merged.push(next);
      const index = merged.length - 1;
      for (const key of keys) keyToIndex.set(key, index);
      continue;
    }

    existing.alias = filterValidAliases(
      existing.name,
      uniqueNames([...(existing.alias ?? []), ...aliases, name])
    ).filter(alias => normalizeNameKey(alias) !== normalizeNameKey(existing.name));
    existing.summary = [existing.summary, character.summary].filter(Boolean).join(' ');
    existing.tags = uniqueNames([...(existing.tags ?? []), ...(character.tags ?? [])]);
    for (const field of ['pronouns', 'archetype', 'role', 'proximity', 'hasMet', 'relationshipDepth', 'likelihoodToMeet']) {
      if (existing[field] === undefined && character[field] !== undefined) existing[field] = character[field];
    }
    existing.associatedWith = uniqueNames([...(existing.associatedWith ?? []), ...(character.associatedWith ?? [])]);
  }

  return merged;
}

async function findExistingByAnyName(userId: string, names: string[]) {
  if (names.length === 0) return null;
  const normalized = new Set(names.map(normalizeNameKey));
  const { data } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('user_id', userId);
  return filterSelfCandidatesForIncoming(names, (data ?? []) as any[]).find((row: any) => {
    const rowNames = [row.name, ...((row.alias ?? []) as string[])].map(normalizeNameKey);
    return rowNames.some(name => normalized.has(name));
  }) ?? null;
}

async function findExistingByAlias(userId: string, aliases: string[]) {
  if (aliases.length === 0) return null;
  const normalized = new Set(aliases.map(normalizeNameKey));
  const { data } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('user_id', userId);
  return filterSelfCandidatesForIncoming(aliases, (data ?? []) as any[]).find((row: any) => {
    const rowAliases = ((row.alias ?? []) as string[]).map(normalizeNameKey);
    return normalizeNameKey(row.name) !== normalizeNameKey(aliases[0] ?? '')
      && rowAliases.some(alias => normalized.has(alias));
  }) ?? null;
}

async function hasSameBarePrimaryName(userId: string, name: string) {
  if (nameHasMultipleParts(name)) return false;
  const nameKey = normalizeNameKey(name);
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata')
    .eq('user_id', userId);
  return filterSelfCandidatesForIncoming([name], (data ?? []) as any[])
    .some((row: any) => normalizeNameKey(row.name).split(' ').includes(nameKey));
}

async function mergeExtractedCharacterData(
  userId: string,
  characterId: string,
  characterData: z.infer<typeof createCharacterSchema>,
  opts: { preferIncomingName?: boolean; matchedMention?: string } = {}
) {
  const { data: existing } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!existing) return null;
  if (isSelfCharacterRow(existing) && !filterSelfCandidatesForIncoming([characterData.name], [existing]).length) {
    logger.warn(
      { userId, characterId, incomingName: characterData.name },
      'Blocked non-self character merge into protagonist card'
    );
    return null;
  }

  const incomingName = cleanEntityName(characterData.name);
  const existingAliases = Array.isArray(existing.alias) ? existing.alias : [];
  const inferredCategories = inferCharacterCategories(characterData, incomingName ?? existing.name);
  const canonicalName = opts.preferIncomingName && incomingName ? incomingName : existing.name;
  const aliases = filterValidAliases(
    canonicalName,
    uniqueNames([
      ...existingAliases,
      ...(characterData.alias ?? []),
      opts.matchedMention,
      opts.preferIncomingName ? existing.name : undefined,
    ])
  ).filter(alias => normalizeNameKey(alias) !== normalizeNameKey(canonicalName));

  const metadata = {
    ...((existing.metadata ?? {}) as Record<string, unknown>),
    ...(characterData.metadata ?? {}),
    ...(characterData.social_media ? { social_media: characterData.social_media } : {}),
    relationship_categories: uniqueNames([
      ...(((existing.metadata as any)?.relationship_categories ?? []) as string[]),
      ...inferredCategories.confirmed,
    ]),
    potential_relationship_categories: uniqueNames([
      ...(((existing.metadata as any)?.potential_relationship_categories ?? []) as string[]),
      ...inferredCategories.potential,
    ]),
    mention_count: Number((existing.metadata as any)?.mention_count ?? 0) + 1,
  };

  const payload: Record<string, unknown> = {
    alias: aliases,
    metadata,
    updated_at: new Date().toISOString(),
  };

  if (opts.preferIncomingName && incomingName && normalizeNameKey(incomingName) !== normalizeNameKey(existing.name)) {
    const nameParts = characterData.firstName
      ? { firstName: characterData.firstName, lastName: characterData.lastName }
      : parseName(incomingName);
    payload.name = incomingName;
    payload.first_name = nameParts.firstName || null;
    payload.last_name = nameParts.lastName || null;
    payload.is_nickname = false;
  } else if (!existing.first_name && characterData.firstName) {
    payload.first_name = characterData.firstName;
    if (characterData.lastName) payload.last_name = characterData.lastName;
  }

  if (!existing.role && characterData.role) payload.role = characterData.role;
  if (!existing.pronouns && characterData.pronouns) payload.pronouns = characterData.pronouns;
  if (!existing.species && characterData.species) payload.species = characterData.species;
  if (!existing.archetype && characterData.archetype) payload.archetype = characterData.archetype;
  if (!existing.summary && characterData.summary) {
    payload.summary = characterData.summary;
  } else if (existing.summary && characterData.summary && !existing.summary.includes(characterData.summary)) {
    payload.summary = `${existing.summary}\n\n${characterData.summary}`;
  }
  if (Array.isArray(characterData.tags) && characterData.tags.length > 0) {
    payload.tags = uniqueNames([...(existing.tags ?? []), ...characterData.tags]);
  }

  const { data: updated, error } = await supabaseAdmin
    .from('characters')
    .update(payload)
    .eq('id', characterId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return updated;
}

/** Link suggestion sources (omega entity, aliases) and refresh identity index after add/merge. */
async function finalizeCharacterSuggestionAdd(
  userId: string,
  character: { id: string; name: string; alias?: string[] | null },
  characterData: z.infer<typeof createCharacterSchema>
): Promise<void> {
  const { characterAuthorityService } = await import('../services/characterAuthorityService');
  const aliases = (character.alias as string[] | null) ?? [];
  await characterAuthorityService.registerCharacterAuthority(userId, character.id, character.name, aliases);

  if (characterData.omegaEntityId) {
    await characterAuthorityService.linkSourceRecord(
      userId,
      character.id,
      'omega_entities',
      characterData.omegaEntityId,
      characterData.name,
      'suggestion_add',
      1
    );
  }

  const incomingName = (characterData.name ?? '').trim();
  if (incomingName && normalizeNameKey(incomingName) !== normalizeNameKey(character.name)) {
    await characterAuthorityService.registerAliasLink(userId, character.id, incomingName, 'suggestion_add');
  }

  void characterIdentityIndexService.rebuild(userId).catch(() => {});

  const { hydrateEntityTimelineAfterSuggestionAccept } = await import('../services/lorebook/suggestions/suggestionEntityTimeline');
  await hydrateEntityTimelineAfterSuggestionAccept(userId, { kind: 'character', id: character.id });
}

/**
 * @swagger
 * /api/characters:
 *   post:
 *     summary: Create a new character
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               alias:
 *                 type: array
 *                 items:
 *                   type: string
 *               pronouns:
 *                 type: string
 *               archetype:
 *                 type: string
 *               role:
 *                 type: string
 *               status:
 *                 type: string
 *               summary:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               social_media:
 *                 type: object
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Character created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const body = sanitizeCharacterCreateBody(req.body);
    const parsed = createCharacterSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid character data', details: parsed.error.flatten() });
    }

    const characterData = parsed.data;
    const inferredSpecies = resolveCompanionSpecies({
      name: characterData.name,
      species: characterData.species,
      context: characterData.context,
      kind: characterData.kind,
    });
    if (inferredSpecies) characterData.species = inferredSpecies;
    const userId = req.user!.id;
    const createResult = await characterRegistry.runExclusive(userId, async () => {
      // An explicit or inferred species (e.g. "dog", "robot") is unambiguous
      // evidence that this row is a companion, not a person — skip the
      // person-shape gate, which has no pet/robot awareness (it never receives
      // message context here unless the client sent `context`).
      if (!characterData.species && looksLikeNonPersonName(characterData.name)) {
        return { type: 'reject' as const, reason: 'non_person_name' };
      }
      const hasExplicitAlias = (characterData.alias ?? []).length > 0;
      if (hasExplicitAlias && !nameHasMultipleParts(characterData.name)) {
        const existingByAlias = await findExistingByAlias(userId, characterData.alias ?? []);
        if (existingByAlias) {
          const updated = await mergeExtractedCharacterData(userId, existingByAlias.id, characterData, {
            preferIncomingName: true,
          });
          return { type: 'merge' as const, character: updated ?? existingByAlias };
        }
        if (await hasSameBarePrimaryName(userId, characterData.name)) {
          const realName = characterData.name;
          characterData.name = withAliasDisambiguatedName(characterData.name, characterData.alias ?? []);
          characterData.firstName = realName;
          characterData.lastName = undefined;
        }
      }
      const existingByName = await findExistingByAnyName(userId, [characterData.name, ...(characterData.alias ?? [])]);
      if (existingByName) {
        const existingNames = [existingByName.name, ...((existingByName.alias ?? []) as string[])].map(normalizeNameKey);
        const primaryAlreadyKnown = existingNames.includes(normalizeNameKey(characterData.name));
        const updated = await mergeExtractedCharacterData(userId, existingByName.id, characterData, {
          preferIncomingName: !primaryAlreadyKnown && (characterData.alias ?? []).some(alias => existingNames.includes(normalizeNameKey(alias))),
          matchedMention: primaryAlreadyKnown ? characterData.name : undefined,
        });
        return { type: 'merge' as const, character: updated ?? existingByName };
      }

      let decision = await characterRegistry.classifyForCreation(userId, characterData.name);
      if (decision.action === 'reject') {
        // Companion cards (pets, robots) may fail the person-name registry gate
        // (Omega1 is UNKNOWN/non-person shaped). Species is user-asserted.
        if (!characterData.species) {
          return { type: 'reject' as const, reason: decision.reason };
        }
        decision = { action: 'create', cleanName: characterData.name.trim() };
      }
      if (decision.action === 'merge') {
        const updated = await mergeExtractedCharacterData(userId, decision.characterId, characterData, {
          matchedMention: decision.cleanName,
        });
        const { data: existingChar } = await supabaseAdmin
          .from('characters')
          .select('*')
          .eq('id', decision.characterId)
          .eq('user_id', userId)
          .single();
        if (existingChar && isSelfCharacterRow(existingChar) && !filterSelfCandidatesForIncoming([decision.cleanName], [existingChar]).length) {
          logger.warn(
            { userId, characterId: decision.characterId, incomingName: decision.cleanName },
            'Blocked registry merge of non-self character into protagonist card'
          );
        } else {
          return { type: 'merge' as const, character: updated ?? existingChar };
        }
      }
      if (decision.action === 'defer') {
        await characterRegistry.recordPendingQuestion(userId, decision.cleanName, decision.candidates, null, decision.rawName);
        return { type: 'defer' as const, decision };
      }

      const id = randomUUID();

      // Determine avatar style based on character type/archetype
      const style = avatarStyleFor(characterData.archetype || characterData.role);
      const dicebearUrl = characterAvatarUrl(id, style);

      // Try to cache avatar (optional - failures are handled gracefully)
      let avatarUrl = dicebearUrl;
      try {
        avatarUrl = await cacheAvatar(id, dicebearUrl);
      } catch (error) {
        logger.warn({ error, characterId: id }, 'Avatar caching failed, using direct URL');
      }

      const nameParts = characterData.firstName
        ? { firstName: characterData.firstName, lastName: characterData.lastName }
        : parseName(decision.cleanName);

      // Determine if this is a nickname (if not explicitly set, check if it looks like a real name)
      const isNickname = characterData.isNickname ?? (!characterData.firstName && !characterData.lastName && !decision.cleanName.includes(' '));

      // Find associated character IDs if provided
      let associatedWithIds: string[] = [];
      if (characterData.associatedWith && characterData.associatedWith.length > 0) {
        const { data: associatedChars } = await supabaseAdmin
          .from('characters')
          .select('id')
          .eq('user_id', userId)
          .in('name', characterData.associatedWith);

        if (associatedChars) {
          associatedWithIds = associatedChars.map(c => c.id);
        }
      }

      // Fuzzy dedup remains as a last compatibility guard for manually entered
      // odd shapes after the registry has already rejected high-risk cases.
      const { data: existingForDedup } = await supabaseAdmin
        .from('characters')
        .select('id, name, alias, metadata')
        .eq('user_id', userId);
      const similar = findSimilarCharacter(
        decision.cleanName,
        filterSelfCandidatesForIncoming([decision.cleanName], (existingForDedup || []) as any[])
      );
      if (similar) {
        logger.info({ userId, existingId: similar.id, incomingName: decision.cleanName }, 'Dedup: returning existing character');
        const updated = await mergeExtractedCharacterData(userId, similar.id, characterData, {
          matchedMention: decision.cleanName,
        });
        const { data: existingChar } = await supabaseAdmin
          .from('characters')
          .select('*')
          .eq('id', similar.id)
          .eq('user_id', userId)
          .single();
        return { type: 'merge' as const, character: updated ?? existingChar };
      }

      // Merge social_media into metadata
      const inferredCategories = inferCharacterCategories(characterData, decision.cleanName);
      const inferredImportance = inferInitialImportance(characterData, inferredCategories.confirmed);
      const metadata: Record<string, unknown> = {
        ...(characterData.metadata || {}),
        ...(characterData.social_media ? { social_media: characterData.social_media } : {}),
        ...(characterData.omegaEntityId ? { omega_entity_id: characterData.omegaEntityId } : {}),
        ...(characterData.questionId ? { entity_question_id: characterData.questionId } : {}),
        ...(characterData.suggestionId ? { suggestion_id: characterData.suggestionId } : {}),
        relationship_categories: inferredCategories.confirmed,
        potential_relationship_categories: inferredCategories.potential,
        importance_inference: {
          source: 'initial_context',
          reason: 'Inferred from proximity, relationship depth, summary, and category signals',
          calculated_at: new Date().toISOString(),
        },
      };

      // Insert character with avatar
      const { data: character, error } = await supabaseAdmin
        .from('characters')
        .insert({
          id,
          user_id: userId,
          name: decision.cleanName,
          first_name: nameParts.firstName,
          last_name: nameParts.lastName || null,
          alias: filterValidAliases(decision.cleanName, characterData.alias ?? []),
          pronouns: characterData.pronouns || null,
          species: characterData.species || null,
          archetype: characterData.archetype || null,
          role: characterData.role || null,
          status: characterData.status || 'active',
          summary: characterData.summary || null,
          tags: characterData.tags || [],
          avatar_url: avatarUrl,
          is_nickname: isNickname,
          importance_level: inferredImportance.importanceLevel,
          importance_score: inferredImportance.importanceScore,
          proximity_level: characterData.proximity || 'direct',
          has_met: characterData.hasMet ?? true,
          relationship_depth: characterData.relationshipDepth || 'moderate',
          associated_with_character_ids: associatedWithIds,
          mentioned_by_character_ids: [],
          context_of_mention: null,
          likelihood_to_meet: characterData.likelihoodToMeet || 'likely',
          metadata,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single();

      if (error) {
        // Handle unique constraint violation (user_id, canonical_name/name)
        if (error.code === '23505') {
          const incomingKey = normalizeNameKey(decision.cleanName);
          const { data: existingRows } = await supabaseAdmin
            .from('characters')
            .select('*')
            .eq('user_id', userId);
          const existing = filterSelfCandidatesForIncoming([decision.cleanName], (existingRows ?? []) as any[])
            .find((row: any) => normalizeNameKey(row.name) === incomingKey);
          if (existing) {
            const updated = await mergeExtractedCharacterData(userId, existing.id, characterData, {
              matchedMention: decision.cleanName,
            });
            return { type: 'merge' as const, character: updated ?? existing };
          }
          return { type: 'conflict' as const };
        }
        logger.error({ err: error }, 'Failed to create character');
        throw error;
      }

      return { type: 'created' as const, character };
    });

    if (createResult.type === 'reject') {
      return res.status(400).json({ error: 'Character name was rejected', reason: createResult.reason });
    }
    if (createResult.type === 'defer') {
      return res.status(409).json({
        error: 'Character name is ambiguous',
        candidates: createResult.decision.candidates,
        question_queued: true,
      });
    }
    if (createResult.type === 'conflict') {
      return res.status(409).json({ error: 'Character with this canonical name already exists' });
    }
    if (createResult.type === 'merge') {
      let mergedCharacter = createResult.character;
      let restored = false;
      if (createResult.character.status === 'archived') {
        const { data: revived } = await supabaseAdmin
          .from('characters')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', createResult.character.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (revived) {
          mergedCharacter = revived;
          restored = true;
        }
      }
      await finalizeCharacterSuggestionAdd(userId, mergedCharacter, characterData);
      return res.status(200).json({ character: mergedCharacter, deduplicated: true, restored });
    }

    // Calculate importance asynchronously
    const { scoreAndPersistCharacter } = await import('../services/characters/characterImportanceService');
    scoreAndPersistCharacter(userId, createResult.character.id).catch(err => {
      logger.debug({ err, characterId: createResult.character.id }, 'Failed to calculate initial importance');
    });

    // New card arrived with a last name already set — check for a possible-family match.
    if (createResult.character.last_name) {
      const { familySurnameSuggestionService } = await import('../services/kinship/familySurnameSuggestionService');
      familySurnameSuggestionService.checkForSurnameMatches(userId, createResult.character.id).catch(err => {
        logger.debug({ err, characterId: createResult.character.id }, 'Failed to check surname matches after create');
      });
    }

    await finalizeCharacterSuggestionAdd(userId, createResult.character, characterData);

    res.status(201).json({ character: createResult.character });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create character');
    res.status(500).json({ error: 'Failed to create character' });
  }
});

router.get('/card-audit', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const report = await characterCardAuditService.audit(userId);
  res.json(report);
}));

router.post('/card-audit/backfill-provenance', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = z
    .object({
      force: z.boolean().optional(),
      characterIds: z.array(z.string()).optional(),
      // Opt-in Tier-2 LLM narrative. Off by default: the deterministic backfill
      // is free and runs regardless; this only adds a single batched OpenAI call.
      enrich: z.boolean().optional(),
    })
    .parse(req.body ?? {});
  const { characterProvenanceBackfillService } = await import(
    '../services/characters/audit/characterProvenanceBackfillService'
  );
  const report = await characterProvenanceBackfillService.backfillUser(userId, {
    force: body.force,
    characterIds: body.characterIds,
    enrich: body.enrich,
  });
  res.json({ success: true, report });
}));

router.post('/card-audit/apply', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = z.object({ dryRun: z.boolean().optional() }).parse(req.body ?? {});
  const { characterCardCleanupService } = await import(
    '../services/characters/audit/characterCardCleanupService'
  );
  const report = await characterCardCleanupService.applySafeFixes(userId, { dryRun: body.dryRun });
  res.json({ success: true, report });
}));

router.post('/card-audit/review/:id/resolve', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = z.object({ action: z.enum(['keep', 'delete']) }).parse(req.body ?? {});
  const { characterCardRescanAuditService } = await import(
    '../services/characters/audit/characterCardRescanAuditService'
  );
  const result = await characterCardRescanAuditService.resolveReviewSuggestion(
    userId,
    req.params.id,
    body.action,
  );
  if (!result.success) {
    return res.status(404).json({ success: false, error: result.error ?? 'resolve_failed' });
  }
  res.json({ success: true });
}));

router.get('/duplicates', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const includeKeepSeparate = req.query.include_keep_separate === 'true';
    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const groups = characterConsolidationReviewService.buildGroups(data ?? []);
    // Default: only surface groups that still need a merge/review decision.
    // Keep-separate / descriptor conversions are available via ?include_keep_separate=true
    // (and always available as actions on review groups).
    const filtered = includeKeepSeparate
      ? groups
      : groups.filter((g) =>
          ['merge', 'needs_identity_review', 'review', 'resolve_head_character'].includes(
            g.recommendation,
          ),
        );

    res.json({
      duplicate_groups: filtered,
      repair_plan: characterConsolidationReviewService.planRepairs(data ?? []),
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list duplicate characters');
    res.status(500).json({ error: 'Failed to list duplicate characters' });
  }
});

router.post('/consolidation/keep-separate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = keepSeparateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid keep-separate request', details: parsed.error.flatten() });
    }
    const userId = req.user!.id;
    const result = await characterConsolidationReviewService.persistDecision({
      userId,
      leftEntityId: parsed.data.left_id,
      rightEntityId: parsed.data.right_id,
      decision: parsed.data.decision,
      reasonCode: (parsed.data.reason_code as any) ?? 'DISTINCT_IDENTITY_ASSERTION',
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true, pair_key: result.pairKey, decision: parsed.data.decision });
  } catch (error) {
    logger.error({ err: error }, 'Failed to persist keep-separate decision');
    res.status(500).json({ error: 'Failed to mark characters as distinct' });
  }
});

router.post('/merge', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = mergeCharactersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid merge request', details: parsed.error.flatten() });
    }
    const { source_id, target_id, reason } = parsed.data;
    const userId = req.user!.id;
    const { data: mergeRows } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('user_id', userId)
      .in('id', [source_id, target_id]);
    const selfInvolved = (mergeRows ?? []).some(
      row => row.metadata?.is_self === true || row.metadata?.is_user === true
    );
    if (selfInvolved) {
      return res.status(400).json({ error: 'Cannot merge your own protagonist card' });
    }
    const report = await characterMergeService.merge(userId, source_id, target_id, {
      mergedBy: 'USER',
      reason,
    });
    const survivorId = report.targetId;
    const { data: mergedCharacter } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('id', survivorId)
      .eq('user_id', req.user!.id)
      .maybeSingle();
    const { socialStandingService } = await import('../services/socialStandingService');
    socialStandingService.recompute(req.user!.id).catch(err => {
      logger.debug({ err }, 'Failed to recompute standing after character merge');
    });
    const { refreshCharacterGraphAfterConsolidation } = await import(
      '../services/characterGraphRefreshService'
    );
    await refreshCharacterGraphAfterConsolidation(userId, { focusCharacterId: survivorId });
    res.json({ merged: true, report, character: mergedCharacter ?? null });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to merge characters');
    const message = error?.message ?? 'Failed to merge characters';
    const status = message.includes('not found')
      ? 404
      : message.includes('itself') || message.includes('Could not') || message.includes('blocked')
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/questions/:id/resolve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = resolveEntityQuestionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
    const { selected_character_ids, create_new, skip } = parsed.data;
    if (!skip && !create_new && selected_character_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Pick at least one option, create new, or skip' });
    }

    const result = await characterRegistry.resolveQuestion(req.user!.id, String(req.params.id), {
      selectedCharacterIds: selected_character_ids,
      createNew: create_new,
      skip,
    });
    if (!result.ok) {
      return res.status(404).json({ success: false, error: 'Question not found or already answered' });
    }
    res.json({ success: true, created_character_id: result.createdCharacterId ?? null });
  } catch (error) {
    logger.error({ err: error }, 'Failed to resolve character question');
    res.status(500).json({ success: false, error: 'Failed to resolve character question' });
  }
});

/**
 * @swagger
 * /api/characters:
 *   get:
 *     summary: List all characters
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of characters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 characters:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Character'
 *       500:
 *         description: Server error
 * /api/characters/list:
 *   get:
 *     summary: List all characters (alias of GET /api/characters)
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of characters
 */
router.get(['/', '/list'], requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Try to get from characters table first (new system)
    const { data: charactersData, error: charactersError } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    // If table doesn't exist or is empty, return empty array
    if (charactersError) {
      // Check if it's a "relation does not exist" error
      if (charactersError.code === '42P01' || charactersError.message?.includes('does not exist')) {
        logger.warn('Characters table does not exist yet, returning empty list');
        return res.json({ characters: [] });
      }
      throw charactersError;
    }

    if (charactersData && charactersData.length > 0) {
      const characterIds = charactersData.map(c => c.id);

      // Batch query memory counts for all characters (ONE query instead of N)
      const { data: memoryCountsData } = await supabaseAdmin
        .from('character_memories')
        .select('character_id')
        .in('character_id', characterIds);

      const memoryCounts = new Map<string, number>();
      memoryCountsData?.forEach(mem => {
        memoryCounts.set(mem.character_id, (memoryCounts.get(mem.character_id) || 0) + 1);
      });

      const canonicalEventCounts = await countCanonicalEventsForCharacters(req.user!.id, characterIds);

      const { data: factCountsData } = await supabaseAdmin
        .from('entity_facts')
        .select('entity_id')
        .eq('entity_type', 'character')
        .in('entity_id', characterIds);

      const { data: perceptionCountsData } = await supabaseAdmin
        .from('perception_entries')
        .select('subject_person_id, source_character_id')
        .eq('user_id', req.user!.id)
        .or(`subject_person_id.in.(${characterIds.join(',')}),source_character_id.in.(${characterIds.join(',')})`);

      const evidenceCounts = new Map<string, number>();
      const addEvidence = (id: string | null | undefined, amount = 1) => {
        if (!id) return;
        evidenceCounts.set(id, (evidenceCounts.get(id) || 0) + amount);
      };
      memoryCountsData?.forEach(mem => addEvidence(mem.character_id));
      canonicalEventCounts.forEach((count, id) => addEvidence(id, count));
      factCountsData?.forEach(fact => addEvidence(fact.entity_id));
      perceptionCountsData?.forEach(perception => {
        addEvidence(perception.subject_person_id);
        addEvidence(perception.source_character_id);
      });

      const knowledgeCounts = new Map<string, number>();
      factCountsData?.forEach(fact => {
        knowledgeCounts.set(fact.entity_id, (knowledgeCounts.get(fact.entity_id) || 0) + 1);
      });

      // Batch query relationships for all characters (ONE query instead of N)
      const { data: allRelationships } = await supabaseAdmin
        .from('character_relationships')
        .select('*')
        .or(`source_character_id.in.(${characterIds.join(',')}),target_character_id.in.(${characterIds.join(',')})`);

      // Group relationships by character
      const relationshipsByCharacter = new Map<string, typeof allRelationships>();
      const relationshipSets = new Map<string, Set<string>>();
      const addConnection = (fromId: string | null | undefined, toId: string | null | undefined) => {
        if (!fromId || !toId || fromId === toId) return;
        if (!relationshipSets.has(fromId)) relationshipSets.set(fromId, new Set());
        relationshipSets.get(fromId)!.add(toId);
      };
      
      allRelationships?.forEach(rel => {
        if ((rel.status ?? 'active') !== 'active') return;
        // Add to source character
        if (!relationshipsByCharacter.has(rel.source_character_id)) {
          relationshipsByCharacter.set(rel.source_character_id, []);
        }
        relationshipsByCharacter.get(rel.source_character_id)!.push(rel);
        addConnection(rel.source_character_id, rel.target_character_id);

        // Add to target character
        if (!relationshipsByCharacter.has(rel.target_character_id)) {
          relationshipsByCharacter.set(rel.target_character_id, []);
        }
        relationshipsByCharacter.get(rel.target_character_id)!.push(rel);
        addConnection(rel.target_character_id, rel.source_character_id);
      });

      charactersData.forEach(char => {
        (char.associated_with_character_ids ?? []).forEach((id: string) => addConnection(char.id, id));
        (char.mentioned_by_character_ids ?? []).forEach((id: string) => addConnection(char.id, id));
      });
      charactersData.forEach(char => {
        charactersData.forEach(other => {
          if ((other.associated_with_character_ids ?? []).includes(char.id)) addConnection(char.id, other.id);
          if ((other.mentioned_by_character_ids ?? []).includes(char.id)) addConnection(char.id, other.id);
        });
      });

      // Get all unique character IDs from relationships
      const relatedCharacterIds = new Set<string>();
      allRelationships?.forEach(rel => {
        relatedCharacterIds.add(rel.source_character_id);
        relatedCharacterIds.add(rel.target_character_id);
      });

      // Batch query character names (ONE query instead of N)
      const { data: relatedCharacters } = relatedCharacterIds.size > 0
        ? await supabaseAdmin
            .from('characters')
            .select('id, name')
            .in('id', Array.from(relatedCharacterIds))
        : { data: [] };

      const characterNameMap = new Map<string, string>(
        relatedCharacters?.map((c) => [c.id, c.name] as [string, string]) || []
      );

      // Batch query memories for all characters (ONE query instead of N)
      const { data: allMemories } = await supabaseAdmin
        .from('character_memories')
        .select('id, character_id, journal_entry_id, created_at, summary')
        .in('character_id', characterIds)
        .order('created_at', { ascending: false });

      const memoriesByCharacter = new Map<string, NonNullable<typeof allMemories>>();
      allMemories?.forEach((mem) => {
        if (!memoriesByCharacter.has(mem.character_id)) {
          memoriesByCharacter.set(mem.character_id, []);
        }
        const charMemories = memoriesByCharacter.get(mem.character_id)!;
        if (charMemories.length < 20) {
          charMemories.push(mem);
        }
      });

      const { resolveJournalEntryClocks, sharedMemoryFromLink } = await import('../services/temporal/journalMemoryTemporalLoader');
      const memoryClocks = await resolveJournalEntryClocks(
        req.user!.id,
        (allMemories ?? []).map((mem) => mem.journal_entry_id),
      );
      const selfIds = new Set(
        charactersData
          .filter((c) => isSelfCharacterMetadata((c.metadata ?? {}) as Record<string, unknown>, c.name))
          .map((c) => c.id),
      );
      const characterMetaById = new Map(
        charactersData.map((c) => [c.id, (c.metadata ?? {}) as Record<string, unknown>]),
      );

      // Map results back to characters (in-memory operation - FAST)
      const charactersWithStats = await Promise.all(charactersData.map(async (char) => {
        // Extract social_media from metadata if it exists
        const metadata = (char.metadata || {}) as Record<string, unknown>;
        const social_media = metadata.social_media as Record<string, string> | undefined;

        const relationships = relationshipsByCharacter.get(char.id) || [];
        const memories = memoriesByCharacter.get(char.id) || [];

        const characterData = {
          id: char.id,
          name: char.name,
          alias: char.alias || [],
          pronouns: char.pronouns,
          species: char.species,
          archetype: char.archetype,
          role: char.role,
          status: char.status || 'active',
          first_appearance: char.first_appearance,
          summary: char.summary,
          tags: char.tags || [],
          avatar_url: displayAvatarUrl(char),
          social_media: social_media || undefined,
          metadata: metadata,
          created_at: char.created_at,
          updated_at: char.updated_at,
          first_name: char.first_name ?? null,
          last_name: char.last_name ?? null,
          is_nickname: char.is_nickname ?? null,
          importance_level: char.importance_level ?? null,
          importance_score: char.importance_score ?? 0,
          proximity_level: char.proximity_level ?? null,
          has_met: char.has_met ?? null,
          relationship_depth: char.relationship_depth ?? null,
          associated_with_character_ids: char.associated_with_character_ids ?? [],
          mentioned_by_character_ids: char.mentioned_by_character_ids ?? [],
          context_of_mention: char.context_of_mention ?? null,
          likelihood_to_meet: char.likelihood_to_meet ?? null,
          memory_count: Math.max(memoryCounts.get(char.id) || 0, evidenceCounts.get(char.id) || 0),
          direct_memory_count: memoryCounts.get(char.id) || 0,
          knowledge_count: knowledgeCounts.get(char.id) || 0,
          relationship_count: relationshipSets.get(char.id)?.size || 0,
          relationships: dedupeRelationshipsByPerson(
            relationships
              .filter((rel) => {
                const status = String(rel.status ?? 'active').toLowerCase();
                return status !== 'superseded' && status !== 'deleted' && status !== 'inactive';
              })
              .slice(0, 50)
              .map((rel) => {
                const relatedCharId =
                  rel.source_character_id === char.id ? rel.target_character_id : rel.source_character_id;
                const otherMeta = characterMetaById.get(relatedCharId) ?? {};
                return {
                  id: rel.id,
                  character_id: relatedCharId,
                  character_name: characterNameMap.get(relatedCharId) || 'Unknown',
                  relationship_type: resolveRelatedPersonType({
                    storedType: String(rel.relationship_type ?? ''),
                    viewerIsSource: rel.source_character_id === char.id,
                    viewerIsSelf: selfIds.has(char.id),
                    otherIsSelf: selfIds.has(relatedCharId),
                    viewerRelationshipToYou:
                      typeof metadata.relationship_to_user === 'string' ? metadata.relationship_to_user : null,
                    otherRelationshipToYou:
                      typeof otherMeta.relationship_to_user === 'string' ? otherMeta.relationship_to_user : null,
                    otherName: characterNameMap.get(relatedCharId),
                  }),
                  closeness_score: rel.closeness_score,
                  summary: rel.summary,
                  status: rel.status,
                };
              }),
          ),
          shared_memories: memories.map((mem) => sharedMemoryFromLink(mem, memoryClocks.get(mem.journal_entry_id))),
        };

        // Calculate analytics (async, don't block)
        try {
          const analytics = await characterAnalyticsService.calculateAnalytics(
            req.user!.id,
            char.id,
            characterData
          );
          (characterData as any).analytics = analytics;
        } catch (error) {
          logger.debug({ error, characterId: char.id }, 'Failed to calculate character analytics, continuing without');
        }

        return characterData;
      }));

      const userId = req.user!.id;

      // Attach primary group affiliation for card surfaces (one batch query).
      try {
        const { organizationService } = await import('../services/organizationService');
        const preferredOrgIdByCharacter: Record<string, string | undefined> = {};
        for (const char of charactersWithStats) {
          const meta = (char.metadata ?? {}) as Record<string, unknown>;
          const preferred =
            (typeof meta.primary_organization_id === 'string' && meta.primary_organization_id) ||
            (typeof meta.primary_group_id === 'string' && meta.primary_group_id) ||
            undefined;
          if (preferred) preferredOrgIdByCharacter[char.id] = preferred;
        }
        const primaryByCharacter = await organizationService.getPrimaryAffiliationsByCharacterIds(
          userId,
          charactersWithStats.map((c) => c.id),
          { preferredOrgIdByCharacter },
        );
        for (const char of charactersWithStats) {
          const primary = primaryByCharacter[char.id];
          if (primary) (char as Record<string, unknown>).primary_organization = primary;
        }
      } catch (err) {
        logger.debug({ err, userId }, 'Primary organization attach failed (non-blocking)');
      }

      void backfillMissingAvatars(userId, charactersData, 25).catch((err) => {
        logger.debug({ err }, 'Avatar backfill failed (non-blocking)');
      });

      void (async () => {
        const { getInferenceState } = await import('../services/inference/inferenceStateService');
        const state = await getInferenceState(userId);
        const pfStale = charactersData.some((c) => {
          const meta = (c.metadata ?? {}) as Record<string, unknown>;
          if (!meta.public_figure && !meta.figure_type) return false;
          const conn = meta.public_figure_connection as { updated_at?: string } | undefined;
          if (!conn?.updated_at) return true;
          return Date.now() - new Date(conn.updated_at).getTime() > 24 * 60 * 60 * 1000;
        });
        const t1Stale = !state.last_t1_run_at
          || Date.now() - new Date(state.last_t1_run_at).getTime() > 30 * 60 * 1000;
        if (pfStale || t1Stale) {
          const { inferenceOrchestrator } = await import('../services/inference/inferenceOrchestrator');
          inferenceOrchestrator.schedule(userId, 'list_stale');
        }
      })().catch((err) => logger.debug({ err, userId }, 'Inference schedule on list failed'));

      return res.json({ characters: charactersWithStats });
    }

    // If no characters found, return empty array
    if (!charactersData || charactersData.length === 0) {
      return res.json({ characters: [] });
    }

    // Fallback to people_places table (legacy system) - only if characters table is truly empty
    try {
      const people = await peoplePlacesService.listEntities(req.user!.id, 'person');
      const characters = people.map((person) => ({
        id: person.id,
        name: person.name,
        alias: person.corrected_names || [],
        pronouns: undefined,
        species: undefined,
        archetype: undefined,
        role: undefined,
        status: 'active',
        first_appearance: person.first_mentioned_at,
        summary: undefined,
        tags: [],
        metadata: {},
        created_at: person.first_mentioned_at,
        updated_at: person.last_mentioned_at,
        memory_count: person.total_mentions,
        relationship_count: Object.values(person.relationship_counts || {}).reduce((a, b) => a + b, 0)
      }));
      return res.json({ characters });
    } catch (legacyError) {
      // If legacy system also fails, just return empty array
      logger.warn({ error: legacyError }, 'Legacy people_places fallback failed, returning empty characters');
      return res.json({ characters: [] });
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to list characters');
    // Return empty array instead of error - better UX
    res.json({ characters: [] });
  }
});

router.get('/registry', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const entries = await characterIdentityIndexService.list(req.user!.id, {
      search,
      limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
    });
    res.json({ success: true, entries });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Failed to list character registry');
    res.status(500).json({ success: false, error: 'Failed to list character registry' });
  }
});

router.post('/registry/rebuild', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await characterIdentityIndexService.rebuild(req.user!.id);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ err: error, userId: req.user?.id }, 'Failed to rebuild character registry');
    res.status(500).json({ success: false, error: 'Failed to rebuild character registry' });
  }
});

// ─── Self character (protagonist) ───────────────────────────────────────────

router.post(
  '/ensure-self',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const character = await selfCharacterService.ensureSelfCharacter(userId);
    if (!character) {
      return res.status(500).json({ success: false, error: 'Failed to ensure self character' });
    }
    return res.json({ success: true, character });
  })
);

router.post(
  '/self/sync',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const bodySchema = z.object({
      limit: z.number().int().min(1).max(200).optional(),
      sinceDays: z.number().int().min(1).max(365).optional(),
    });
    const body = bodySchema.parse(req.body ?? {});
    const result = await selfCharacterService.syncFromConversations(userId, body);
    return res.json({ success: true, ...result });
  })
);

router.get(
  '/self/profile',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const profile = await selfCharacterService.getSelfProfile(userId);
    if (!profile) {
      return res.status(500).json({ success: false, error: 'Failed to load self profile' });
    }
    return res.json({ success: true, ...profile });
  })
);

/** Sectioned Character Query for the protagonist (same contract as /:id/query). */
router.get(
  '/self/query',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const self = await selfCharacterService.ensureSelfCharacter(userId);
    if (!self?.id) {
      return res.status(404).json({ success: false, error: 'Self character not found' });
    }
    const sections = typeof req.query.sections === 'string' ? req.query.sections : 'core';
    const { getCharacterQuery } = await import('../services/characters/characterQueryService');
    const query = await getCharacterQuery(userId, self.id as string, {
      sections,
      subject: 'self',
    });
    if (!query) {
      return res.status(404).json({ success: false, error: 'Self character not found' });
    }
    return res.json({ success: true, query });
  })
);

router.post(
  '/restore',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const report = await characterRestoreService.restoreAllCharacters(userId);
    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, status, importance_level, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return res.json({ success: true, report, characterCount: characters?.length ?? 0 });
  })
);

router.post(
  '/self/repair',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const result = await selfCharacterService.repairSelfCharacterIdentity(userId);
    const character = await selfCharacterService.ensureSelfCharacter(userId);
    return res.json({ success: true, ...result, character });
  })
);

router.post(
  '/self/set-legal-name',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const bodySchema = z.object({
      legalName: z.string().trim().min(1).max(120),
    });
    const { legalName } = bodySchema.parse(req.body ?? {});

    const self = await selfCharacterService.ensureSelfCharacter(userId);
    if (!self?.id) {
      return res.status(500).json({ success: false, error: 'No self character' });
    }

    const parts = legalName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? legalName;
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
    const metadata = {
      ...((self.metadata as Record<string, unknown>) ?? {}),
      is_self: true,
      is_user: true,
      real_name: legalName,
    };

    const displayName = /^me$/i.test(String(self.name ?? '')) ? legalName : self.name;

    const { data: updated, error } = await supabaseAdmin
      .from('characters')
      .update({
        name: displayName,
        first_name: firstName,
        last_name: lastName,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', self.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !updated) {
      return res.status(500).json({ success: false, error: 'Failed to update legal name' });
    }

    return res.json({ success: true, character: updated, legalName });
  })
);

router.get(
  '/suggestions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const context = req.query.context === 'romantic' ? 'romantic' : 'general';
    const rescan = req.query.rescan === 'true';

    const { count: characterCount } = await supabaseAdmin
      .from('characters')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const shouldRescan =
      rescan ||
      ((characterCount ?? 0) < 5 &&
        !(await characterConversationRescanService.hasCompletedRescan(userId)));

    let rescanSummary: Awaited<ReturnType<typeof characterConversationRescanService.rescan>> | null = null;
    if (shouldRescan) {
      rescanSummary = await characterConversationRescanService.rescan(userId, { cardAudit: true });
    }

    const { characterSuggestionService } = await import('../services/characterSuggestionService');
    const { characterCardRescanAuditService } = await import(
      '../services/characters/audit/characterCardRescanAuditService'
    );
    const [suggestions, cardReviewSuggestions] = await Promise.all([
      characterSuggestionService.getSuggestions(userId, { context }),
      characterCardRescanAuditService.getPendingReviewSuggestions(userId),
    ]);
    res.json({
      success: true,
      suggestions,
      cardReviewSuggestions,
      count: suggestions.length,
      rescanSummary,
    });
  })
);

router.post(
  '/rescan',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const summary = await characterConversationRescanService.rescan(userId, { cardAudit: true });
    return res.json({ success: true, summary });
  })
);

/** Curated archetype presets for the picker (shared vocabulary with inference). */
router.get('/archetype-presets', requireAuth, async (_req: AuthenticatedRequest, res) => {
  const { CHARACTER_ARCHETYPE_PRESETS } = await import(
    '../services/characters/characterArchetypeService'
  );
  res.json({ presets: CHARACTER_ARCHETYPE_PRESETS });
});

router.use('/:id', characterTitleRoutes);

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { loadCharacterIdentity } = await import('../services/characters/characterIdentityLoader');
    const identity = await loadCharacterIdentity(req.user!.id, String(req.params.id));
    if (!identity) {
      return res.status(404).json({ error: 'Character not found' });
    }
    res.json(identity);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get character');
    res.status(500).json({ error: 'Failed to load character' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid character data', details: parsed.error.flatten() });
    }

    const updateData = parsed.data;
    const userId = req.user!.id;

    // Check if character exists and belongs to user
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, archetype, role, metadata, status')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Alias corrections teach the system: removed aliases are never re-attached
    // to this character by ingestion/dedupe; added ones are confirmed equivalences.
    if (updateData.alias) {
      const before = new Set(((existing.alias as string[] | null) ?? []).map((a) => a.toLowerCase().trim()));
      const after = new Set(updateData.alias.map((a) => a.toLowerCase().trim()));
      const removedAliases = ((existing.alias as string[] | null) ?? []).filter((a) => !after.has(a.toLowerCase().trim()));
      const addedAliases = updateData.alias.filter((a) => !before.has(a.toLowerCase().trim()));
      if (removedAliases.length > 0 || addedAliases.length > 0) {
        void import('../services/entityLearningService').then(({ entityLearningService }) =>
          entityLearningService
            .recordAliasCorrectionLearning({
              userId,
              entityId: existing.id,
              entityName: existing.name,
              removedAliases,
              addedAliases,
            })
            .catch((err) => logger.warn({ err }, 'alias correction learning skipped'))
        );
      }
    }

    // Merge social_media into metadata
    const existingMetadata = (existing.metadata || {}) as Record<string, unknown>;
    const metadataPatch = (updateData.metadata || {}) as Record<string, unknown>;
    const updatedMetadata: Record<string, unknown> = {
      ...existingMetadata,
      ...metadataPatch,
      ...(updateData.social_media ? { social_media: updateData.social_media } : {}),
      ...(updateData.middleName !== undefined
        ? {
            middle_name: updateData.middleName.trim() || null,
            middle_name_source: updateData.middleName.trim() ? 'user_confirmed' : 'user_cleared',
          }
        : {})
    };
    // Explicit null clears a user override (UI "Auto" choice) — a shallow
    // merge alone can never remove a key.
    for (const key of [
      'standing_override',
      'impact_override',
      'book_category',
      'family_excluded',
    ]) {
      if (key in metadataPatch && metadataPatch[key] === null) delete updatedMetadata[key];
    }

    // Importance pin: a level pins it (auto-scoring will never overwrite it —
    // see persistCharacterImportance); null clears the pin so it re-scores below.
    if (updateData.importanceLevel !== undefined) {
      if (updateData.importanceLevel === null) {
        delete updatedMetadata.importance_level_source;
      } else {
        updatedMetadata.importance_level_source = 'user_confirmed';
      }
    }

    // Apply standing override to social_standing in the same write so the UI
    // (and any concurrent recompute) sees the pin immediately — not only after
    // the async full-user recompute finishes.
    if ('standing_override' in metadataPatch) {
      const VALID_STANDING_TIERS = new Set([
        'inner_circle',
        'close',
        'regular',
        'peripheral',
        'public_figure',
      ]);
      const prevStanding =
        existingMetadata.social_standing && typeof existingMetadata.social_standing === 'object'
          ? ({ ...(existingMetadata.social_standing as Record<string, unknown>) } as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const override = updatedMetadata.standing_override as { tier?: string } | undefined;
      if (override?.tier && VALID_STANDING_TIERS.has(override.tier)) {
        updatedMetadata.social_standing = {
          ...prevStanding,
          tier: override.tier,
          overridden: true,
          computed_at: new Date().toISOString(),
        };
      } else if (metadataPatch.standing_override === null) {
        delete prevStanding.overridden;
        updatedMetadata.social_standing = {
          ...prevStanding,
          computed_at: new Date().toISOString(),
        };
      }
    }

    // Get existing character to check if it's a nickname
    const { data: existingChar } = await supabaseAdmin
      .from('characters')
      .select('name, first_name, last_name, is_nickname, alias')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();

    // If real name is being provided for a nickname character, move nickname to alias
    let nameToUpdate = updateData.name;
    if (typeof nameToUpdate === 'string' && nameToUpdate.trim()) {
      const { characterRegistry } = await import('../services/characterRegistry');
      const gated = characterRegistry.gateName(nameToUpdate);
      if (gated.ok && gated.cleanName) {
        nameToUpdate = gated.cleanName;
      }
    }
    let firstNameToUpdate = updateData.firstName;
    let lastNameToUpdate = updateData.lastName;
    // User-curated alias lists from the character modal are trusted for
    // removals (a wrong nickname the user deleted must stay gone). Still
    // scrub punctuation/possessive duplicates below. Ingestion paths keep
    // the stricter filterValidAliases gate.
    let aliasToUpdate = updateData.alias
      ? [...new Set(updateData.alias.map((a) => a.replace(/\s+/g, ' ').trim()).filter(Boolean))]
      : filterValidAliases(
          nameToUpdate ?? existingChar?.name ?? '',
          existingChar?.alias ?? [],
        );

    if (updateData.name && existingChar?.is_nickname && !updateData.isNickname) {
      // Real name provided for a nickname character
      const nameParts = updateData.firstName 
        ? { firstName: updateData.firstName, lastName: updateData.lastName }
        : parseName(updateData.name);
      
      nameToUpdate = updateData.name;
      firstNameToUpdate = nameParts.firstName;
      lastNameToUpdate = nameParts.lastName;
      
      // Move old nickname to alias if not already there
      if (existingChar.name && !aliasToUpdate.includes(existingChar.name)) {
        aliasToUpdate = [...aliasToUpdate, existingChar.name];
      }
    } else if (updateData.firstName || updateData.lastName) {
      // First/last name provided directly
      firstNameToUpdate = updateData.firstName;
      lastNameToUpdate = updateData.lastName;
      // Reconstruct full name if not provided
      if (!updateData.name && (updateData.firstName || updateData.lastName)) {
        nameToUpdate = [updateData.firstName, updateData.lastName].filter(Boolean).join(' ');
      }
    } else if (updateData.name && !updateData.firstName && !updateData.lastName) {
      // Name provided but not first/last - parse it
      const nameParts = parseName(updateData.name);
      firstNameToUpdate = nameParts.firstName;
      lastNameToUpdate = nameParts.lastName;
    }

    // General rename: preserve the previous name as an alias so old mentions
    // and search still resolve to this character. The nickname-promotion
    // branch above already does this for its own case; this covers every
    // other rename (a no-op if the old name is already present). A rename
    // that only fixes punctuation/possessive/case (e.g. "Tio Ralph's" ->
    // "Tio Ralph") is a typo correction, not a real alternate name — never
    // preserve the old spelling as an alias for that case.
    if (
      nameToUpdate &&
      existingChar?.name &&
      normalizeNameKey(nameToUpdate) !== normalizeNameKey(existingChar.name) &&
      normalizeDuplicateKey(nameToUpdate) !== normalizeDuplicateKey(existingChar.name) &&
      !isTrailingPossessiveVariant(nameToUpdate, existingChar.name) &&
      !aliasToUpdate.some((a) => normalizeNameKey(a) === normalizeNameKey(existingChar.name))
    ) {
      aliasToUpdate = [...aliasToUpdate, existingChar.name];
    }

    // Defense in depth: scrub any alias that's just a punctuation/possessive/
    // case variant of the character's current name — even one saved by an
    // earlier rename before this guard existed (e.g. a stale "Tio Ralph's"
    // left over from correcting the name to "Tio Ralph"). Runs on every
    // save, not just renames, so a pre-existing bad alias self-heals the
    // next time this character is touched.
    const canonicalNameForAliasCleanup = nameToUpdate ?? existingChar?.name;
    if (canonicalNameForAliasCleanup) {
      aliasToUpdate = aliasToUpdate.filter(
        (a) =>
          normalizeDuplicateKey(a) !== normalizeDuplicateKey(canonicalNameForAliasCleanup) &&
          !isTrailingPossessiveVariant(a, canonicalNameForAliasCleanup)
      );
    }

    // Keep metadata.display_title aliases in lockstep so removing a nickname
    // actually changes the modal header (title aliases used to resurrect).
    if (updateData.alias !== undefined) {
      const storedTitle = updatedMetadata.display_title as
        | { primaryTitle?: string; aliases?: Array<{ value?: string }>; stability?: string; [key: string]: unknown }
        | undefined;
      if (storedTitle && typeof storedTitle === 'object') {
        const kept = new Set(aliasToUpdate.map((a) => a.toLowerCase()));
        const nextTitleAliases = (storedTitle.aliases ?? []).filter(
          (a) => typeof a?.value === 'string' && kept.has(a.value.trim().toLowerCase()),
        );
        const removedFromTitle = (storedTitle.aliases ?? []).filter(
          (a) => typeof a?.value === 'string' && !kept.has(a.value.trim().toLowerCase()),
        );
        let primaryTitle = storedTitle.primaryTitle;
        if (
          storedTitle.stability !== 'locked' &&
          typeof primaryTitle === 'string' &&
          removedFromTitle.some(
            (a) => a.value && primaryTitle!.toLowerCase().includes(a.value.trim().toLowerCase()),
          )
        ) {
          const first = (firstNameToUpdate ?? existingChar?.first_name ?? '').trim();
          const last = (lastNameToUpdate ?? existingChar?.last_name ?? '').trim();
          const nickname = aliasToUpdate.find(
            (a) => a.toLowerCase() !== first.toLowerCase() && a.toLowerCase() !== `${first} ${last}`.toLowerCase(),
          );
          primaryTitle =
            nickname && first
              ? `${nickname} (${[first, last].filter(Boolean).join(' ')})`
              : [first, last].filter(Boolean).join(' ') || (nameToUpdate ?? existingChar?.name ?? primaryTitle);
        }
        updatedMetadata.display_title = {
          ...storedTitle,
          primaryTitle,
          aliases: nextTitleAliases,
        };
      }
    }

    if (updateData.status !== undefined) {
      const { assertCharacterStatusTransition } = await import(
        '../services/characters/characterLifecycle'
      );
      const transition = assertCharacterStatusTransition(existing.status as string, updateData.status);
      if (!transition.ok) {
        return res.status(400).json({ error: transition.message });
      }
    }

    // Prepare update payload
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (nameToUpdate !== undefined) payload.name = nameToUpdate;
    if (firstNameToUpdate !== undefined) payload.first_name = firstNameToUpdate;
    if (lastNameToUpdate !== undefined) payload.last_name = lastNameToUpdate;
    if (updateData.alias !== undefined || aliasToUpdate !== existingChar?.alias) payload.alias = aliasToUpdate;
    if (updateData.pronouns !== undefined) payload.pronouns = updateData.pronouns;
    if (updateData.species !== undefined) payload.species = updateData.species;
    if (updateData.archetype !== undefined) payload.archetype = updateData.archetype;
    if (updateData.role !== undefined) payload.role = updateData.role;
    if (updateData.status !== undefined) payload.status = updateData.status;
    if (updateData.summary !== undefined) payload.summary = updateData.summary;
    if (updateData.tags !== undefined) payload.tags = updateData.tags;
    if (updateData.isNickname !== undefined) payload.is_nickname = updateData.isNickname;
    if (updateData.importanceLevel) payload.importance_level = updateData.importanceLevel;
    payload.metadata = updatedMetadata;

    const { data: updated, error } = await supabaseAdmin
      .from('characters')
      .update(payload)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Character with this canonical name already exists' });
      }
      logger.error({ err: error }, 'Failed to update character');
      return res.status(500).json({ error: 'Failed to update character' });
    }

    // Rename propagation: organization_members snapshots character_name, so a
    // rename must reflect in every group roster the person belongs to.
    if (updateData.name !== undefined && updated.name && updated.name !== existing.name) {
      supabaseAdmin
        .from('organization_members')
        .update({ character_name: updated.name })
        .eq('user_id', userId)
        .eq('character_id', updated.id)
        .then(({ error: memberErr }) => {
          if (memberErr) {
            logger.debug({ err: memberErr, characterId: updated.id }, 'Failed to propagate rename to organization_members');
          }
        });
    }

    // Standing override changes should reflect in social_standing right away
    if ('standing_override' in metadataPatch) {
      const { socialStandingService } = await import('../services/socialStandingService');
      socialStandingService.recompute(userId).catch(err => {
        logger.debug({ err, characterId: updated.id }, 'Failed to recompute standing after override change');
      });
    }

    // Recalculate importance if role, archetype, or other significant fields changed,
    // or the user just cleared their pin (a no-op otherwise if still pinned — see
    // the isImportancePinned guard in persistCharacterImportance).
    if (
      updateData.role !== undefined ||
      updateData.archetype !== undefined ||
      updateData.name !== undefined ||
      updateData.importanceLevel === null
    ) {
      const { scoreAndPersistCharacter } = await import('../services/characters/characterImportanceService');
      scoreAndPersistCharacter(userId, updated.id).catch(err => {
        logger.debug({ err, characterId: updated.id }, 'Failed to recalculate importance after update');
      });
    }

    // A new/changed last name might match another family-role character's —
    // surface a "possible family" suggestion (never auto-connect).
    if (lastNameToUpdate !== undefined) {
      const { familySurnameSuggestionService } = await import('../services/kinship/familySurnameSuggestionService');
      familySurnameSuggestionService.checkForSurnameMatches(userId, updated.id).catch(err => {
        logger.debug({ err, characterId: updated.id }, 'Failed to check surname matches after update');
      });
    }

    if (metadataPatch.manual_archetype_correction && updateData.archetype !== undefined) {
      const { correctionTracker } = await import('../services/activeLearning/correctionTracker');
      await correctionTracker.recordCorrection(userId, {
        correction_type: 'entity',
        original_value: String(existing.archetype ?? ''),
        corrected_value: updateData.archetype,
        context: `Manual character archetype edit for ${updated.name}`,
        source_unit_id: updated.id,
        metadata: {
          entity_type: 'character',
          entity_id: updated.id,
          field: 'archetype',
          source: 'character_info_panel',
          trains_future_inference: true,
          previous_archetype: existing.archetype ?? null,
          corrected_archetype: updateData.archetype,
        },
      }).catch((err) => {
        logger.warn({ err, userId, characterId: updated.id }, 'Failed to record character archetype correction');
      });
    }

    if (metadataPatch.manual_role_correction && updateData.role !== undefined) {
      const { correctionTracker } = await import('../services/activeLearning/correctionTracker');
      await correctionTracker.recordCorrection(userId, {
        correction_type: 'entity',
        original_value: String(existing.role ?? ''),
        corrected_value: updateData.role,
        context: `Manual character role edit for ${updated.name}`,
        source_unit_id: updated.id,
        metadata: {
          entity_type: 'character',
          entity_id: updated.id,
          field: 'role',
          source: 'character_info_panel',
          trains_future_inference: true,
          previous_role: existing.role ?? null,
          corrected_role: updateData.role,
        },
      }).catch((err) => {
        logger.warn({ err, userId, characterId: updated.id }, 'Failed to record character role correction');
      });
    }

    if (updateData.status !== undefined) {
      if (updateData.status === 'archived') {
        const { entityDeletionRecoveryService } = await import(
          '../services/entityDeletionRecoveryService'
        );
        const archiveReason =
          typeof updatedMetadata.deletion_reason === 'string' && updatedMetadata.deletion_reason.trim()
            ? updatedMetadata.deletion_reason.trim()
            : 'user_archived_character_card';
        await entityDeletionRecoveryService.runBeforeCharacterDelete(userId, {
          id: existing.id,
          name: existing.name as string,
          alias: (existing.alias as string[] | null) ?? [],
          metadata: (existing.metadata as Record<string, unknown> | null) ?? {},
        }, { mode: 'archive', reason: archiveReason });
        const { householdWriteService } = await import('../services/kinship/householdWriteService');
        await householdWriteService.removeCharacterFromAllHouseholds(userId, existing.id, archiveReason);
      }
      if (updateData.status === 'active' && existing.status === 'archived') {
        void import('../services/characterIdentityIndexService').then(({ characterIdentityIndexService }) =>
          characterIdentityIndexService.rebuild(userId).catch(() => {})
        );
      }
      const { refreshCharacterGraphAfterConsolidation } = await import(
        '../services/characterGraphRefreshService'
      );
      void refreshCharacterGraphAfterConsolidation(userId, { focusCharacterId: updated.id });
    }

    res.json({ character: updated });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update character');
    res.status(500).json({ error: 'Failed to update character' });
  }
});

/**
 * Auto-assign an archetype from the card's own context. Persists only when
 * the field is empty or was previously auto-assigned — a user's manual pick
 * (metadata.archetype_source === 'user_confirmed') is never overwritten.
 */
router.post('/:id/archetype/auto', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { inferCharacterArchetype } = await import(
      '../services/characters/characterArchetypeService'
    );

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('characters')
      .select('id, name, role, summary, tags, archetype, context_of_mention, metadata')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: 'Character not found' });

    const meta = { ...((existing.metadata ?? {}) as Record<string, unknown>) };
    if (existing.archetype && (meta.archetype_source === 'user' || meta.archetype_source === 'user_confirmed')) {
      return res.json({
        archetype: existing.archetype,
        source: 'user',
        applied: false,
        reason: 'You picked this one yourself — auto-detect leaves it alone.',
      });
    }

    const inference = inferCharacterArchetype({
      name: existing.name,
      role: existing.role,
      summary: existing.summary,
      tags: (existing.tags as string[] | null) ?? [],
      contextOfMention: existing.context_of_mention as string | null,
      metadata: meta,
    });

    const changed = inference.archetype !== existing.archetype;
    if (changed) {
      meta.archetype_source = 'auto';
      meta.archetype_reason = inference.reason;
      const { error: updateError } = await supabaseAdmin
        .from('characters')
        .update({ archetype: inference.archetype, metadata: meta, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('user_id', userId);
      if (updateError) throw updateError;
    }

    res.json({ ...inference, source: 'auto', applied: changed });
  } catch (error) {
    logger.error({ err: error }, 'Failed to auto-assign archetype');
    res.status(500).json({ error: 'Failed to auto-assign archetype' });
  }
});

/**
 * Reclassify / switch entity type for a record that ended up in the wrong book.
 * E.g. a group or place that was created as a character.
 * Does not archive — moves or marks it for the target domain/book.
 */
router.post('/:id/reclassify', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { targetDomain } = req.body || {};
    const { isReclassifyTarget, validateReclassification, reclassifyCharacterService } = await import(
      '../services/characters/reclassifyCharacterService'
    );
    if (!isReclassifyTarget(targetDomain)) {
      return res.status(400).json({ error: 'targetDomain required (organization, location, event, project, skill)' });
    }

    const { data: existing, error: checkErr } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();

    if (checkErr || !existing) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // The target book's own admission rules decide whether the move is valid.
    const context = [existing.summary, (existing.metadata as Record<string, unknown> | null)?.context]
      .filter(Boolean)
      .join(' ');
    const validation = validateReclassification(existing.name, context, targetDomain);
    if (!validation.allowed) {
      return res.status(422).json({
        error: validation.reason ?? `"${existing.name}" does not pass the ${targetDomain} book's rules.`,
        rulesFired: validation.rulesFired ?? [],
      });
    }

    // Create in the target book first — the character is only marked moved
    // once the target book actually accepted the record.
    const outcome = await reclassifyCharacterService.performReclassification(
      userId,
      { id: existing.id, name: existing.name, summary: existing.summary, metadata: existing.metadata },
      targetDomain
    );

    const meta = { ...((existing.metadata || {}) as Record<string, unknown>) };
    meta.reclassified_from = 'character';
    meta.reclassified_to = targetDomain;
    meta.reclassified_at = new Date().toISOString();
    if (outcome.targetId) meta.reclassified_target_id = outcome.targetId;

    const { data: updated, error } = await supabaseAdmin
      .from('characters')
      .update({
        metadata: meta,
        status: 'reclassified',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      reclassified_to: targetDomain,
      target: outcome,
      character: updated,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to reclassify entity');
    const message = error instanceof Error ? error.message : 'Failed to reclassify entity';
    res.status(500).json({ error: message });
  }
});

/**
 * Delete a character and its derived data (facts, omega entity graph,
 * event participation). Events stay; the person is removed from them.
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { characterDeletionService } = await import('../services/characterDeletionService');
    const redistribute = req.query.redistribute !== 'false';
    const reasonCode =
      typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : undefined;
    const reasonNote =
      typeof req.body?.reason_note === 'string' && req.body.reason_note.trim()
        ? req.body.reason_note.trim()
        : undefined;
    const reason = [reasonCode, reasonNote].filter(Boolean).join(': ') || undefined;
    const report = await characterDeletionService.deleteCharacter(userId, String(req.params.id), {
      redistribute,
      reason,
    });
    if (!report) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const { socialStandingService } = await import('../services/socialStandingService');
    socialStandingService.recompute(userId).catch(err => {
      logger.debug({ err }, 'Failed to recompute standing after character deletion');
    });

    const { refreshCharacterGraphAfterConsolidation } = await import(
      '../services/characterGraphRefreshService'
    );
    void refreshCharacterGraphAfterConsolidation(userId);

    res.json({ deleted: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete character';
    if (message.includes('pending_deletion')) {
      return res.status(400).json({ error: message });
    }
    logger.error({ err: error }, 'Failed to delete character');
    res.status(500).json({ error: 'Failed to delete character' });
  }
});

/**
 * Extract character information from chat message
 * Now also detects unnamed characters and generates nicknames
 */
router.post('/extract-from-chat', ...guardOpenAiRoute(), requireAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message || typeof message !== 'string' || message.length > 10_000) {
      return res.status(400).json({ error: 'Message is required (max 10,000 chars)' });
    }

    // Use OpenAI to extract character information (named and unnamed)
    const completion = await openai.chat.completions.create({
      model: config.extractionModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extract character information from the user's message. Look for:
- Names of people mentioned (named characters) - try to identify first and last names
- Unnamed people mentioned (e.g., "my friend", "the colleague", "someone I met") - these need nicknames
- People mentioned by others (e.g., "Sarah's friend", "my coworker's partner")
- People the user barely knows or will never meet
- Their roles, relationships, or archetypes
- Any descriptive information about them
- Pronouns if mentioned
- Nicknames or alternative names used
- Whether the user has met them
- How they're connected (directly, through someone else, etc.)
- Multiple relationship/category signals when context supports them (friend, romantic, family, mentor, professional, creative), but do not force one primary category.

Do not extract locations, venues, events, shows, clubs, bars, streets, restaurants, songs, bands, organizations, or generic roles as characters.
Examples:
- "First Street Pool and Billiards" is a location, not a character.
- "Club Metro 2 year anniversary" is an event/location context, not a character.
- "DJ for Hell Fairy's show" is a role/context for Mr. Chino, not a new character.

Return JSON:
{
  "namedCharacters": [
    {
      "name": "string (required, full name)",
      "firstName": "string (optional, if can be parsed)",
      "lastName": "string (optional, if can be parsed)",
      "alias": ["string"] (optional),
      "pronouns": "string" (optional),
      "archetype": "string" (optional),
      "role": "string" (optional),
      "summary": "string" (optional),
      "tags": ["string"] (optional),
      "proximity": "direct|indirect|distant|unmet|third_party",
      "hasMet": true|false,
      "relationshipDepth": "close|moderate|casual|acquaintance|mentioned_only",
      "associatedWith": ["character names"],
      "likelihoodToMeet": "likely|possible|unlikely|never"
    }
  ],
  "unnamedCharacters": [
    {
      "description": "brief description of who this person is",
      "role": "friend|colleague|mentor|family|acquaintance|other",
      "relationship": "how they relate to the user",
      "pronouns": "he|she|they|unknown",
      "context": "the specific mention from the message",
      "proximity": "direct|indirect|distant|unmet|third_party",
      "hasMet": true|false,
      "relationshipDepth": "close|moderate|casual|acquaintance|mentioned_only",
      "associatedWith": ["character names"],
      "likelihoodToMeet": "likely|possible|unlikely|never"
    }
  ]
}

Proximity levels:
- direct: User knows them directly (e.g., "my friend John", "I met Sarah")
- indirect: User knows them through someone else (e.g., "Sarah's friend", "Marcus's wife", "my coworker's partner")
- distant: User barely knows them (e.g., "someone I see at the coffee shop", "a neighbor I've said hi to")
- unmet: User has never met them (e.g., "someone I've only talked to online", "a person I've never met")
- third_party: Mentioned by others, user doesn't know them personally (e.g., "Sarah mentioned her ex", "Marcus talked about his colleague", "my friend's roommate")

Relationship depth:
- close: Close relationship (best friend, family member, close mentor)
- moderate: Moderate relationship (regular friend, colleague you work with often)
- casual: Casual relationship (acquaintance you see occasionally)
- acquaintance: Just an acquaintance (person you barely know)
- mentioned_only: Only mentioned, no real relationship (e.g., "Sarah's ex", "someone's friend I've never met")

IMPORTANT: Pay attention to possessive phrases like "Sarah's friend", "Marcus's wife", "my coworker's partner" - these indicate indirect or third_party proximity.
Also detect phrases like "I've never met", "mentioned by", "talked about" - these indicate unmet or third_party.

For named characters, try to parse first and last names if the full name is provided (e.g., "John Smith" -> firstName: "John", lastName: "Smith").
When the user says "real name aka stage name" or "stage name's name is real name", return one character with the real name as "name" and the stage name/nickname in "alias".
Examples:
- "Daisy aka Hell Fairy" -> {"name":"Daisy","firstName":"Daisy","alias":["Hell Fairy"]}
- "Juan aka Oscuri.dad" -> {"name":"Juan","firstName":"Juan","alias":["Oscuri.dad","Oscuridad"]}
Stage names or handles can contain kinship words without being family:
- "Oscuri.dad" is a stage name/handle, not a father/dad relationship.
- "Goth Tio" can be a stage name unless the user says "my tio/uncle".
- "Mom Jeans", "Soccer Mommy", "Daddy Yankee", "Father John Misty", "Sister Nancy", "Brother Ali" are artist/stage names, not family relationships.
Only infer family from relationship language like "my dad", "her brother", "his cousin", "my tio Juan", not from arbitrary names or aliases.
If a sentence gives details about an already named person, put the details on that person's summary/role. Do not create a role-shaped character.
If the user says they might collaborate, asked someone to make music, or could work together, treat that as a potential professional/creative signal, not confirmed employment or coworker status.
For unnamed characters, extract them even if they don't have names - we'll generate nicknames for them.
If no characters are found, return {"namedCharacters": [], "unnamedCharacters": []}.`
        },
        {
          role: 'user',
          content: `Message: ${message}\n\nConversation history:\n${conversationHistory.map((m: any) => `${m.role}: ${m.content}`).join('\n')}`
        }
      ]
    });

    const response = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(response) as { 
      namedCharacters?: any[];
      unnamedCharacters?: any[];
    };

    const namedCharacters = Array.isArray(parsed.namedCharacters) ? parsed.namedCharacters : [];
    const unnamedCharacters = Array.isArray(parsed.unnamedCharacters) ? parsed.unnamedCharacters : [];

    const aliasPairs = extractAliasPairs(message);
    const aliasNames = new Map(aliasPairs.map(pair => [normalizeNameKey(pair.alias), pair.name]));
    const explicitAliasCharacters = aliasPairs.map(pair => ({
      name: pair.name,
      firstName: parseName(pair.name).firstName,
      lastName: parseName(pair.name).lastName,
      alias: [pair.alias],
      summary: undefined,
      tags: [],
    }));

    // Validate and clean named character data
    const validatedNamedCharacters = [...explicitAliasCharacters, ...namedCharacters]
      .filter(char => char.name && typeof char.name === 'string' && char.name.trim().length > 0)
      .map(char => {
        const rawName = char.name.trim();
        const fullName = aliasNames.get(normalizeNameKey(rawName)) ?? rawName;
        const aliases = filterValidAliases(
          fullName,
          uniqueNames([
            ...(Array.isArray(char.alias) ? char.alias.filter((a: any) => typeof a === 'string') : []),
            rawName !== fullName ? rawName : undefined,
          ])
        ).filter(alias => normalizeNameKey(alias) !== normalizeNameKey(fullName));
        // Use provided first/last names or parse from full name
        const nameParts = char.firstName 
          ? { firstName: char.firstName, lastName: char.lastName }
          : parseName(fullName);
        
        return {
          name: fullName,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          alias: aliases,
          pronouns: typeof char.pronouns === 'string' ? char.pronouns.trim() : undefined,
          archetype: typeof char.archetype === 'string' ? char.archetype.trim() : undefined,
          role: typeof char.role === 'string' ? char.role.trim() : undefined,
          summary: typeof char.summary === 'string' ? char.summary.trim() : undefined,
          tags: Array.isArray(char.tags) ? char.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.trim()) : [],
          status: 'active' as const,
          isNickname: false, // Named characters have real names
          proximity: char.proximity || 'direct',
          hasMet: char.hasMet !== undefined ? char.hasMet : true,
          relationshipDepth: char.relationshipDepth || 'moderate',
          associatedWith: Array.isArray(char.associatedWith) ? char.associatedWith : [],
          likelihoodToMeet: char.likelihoodToMeet || 'likely'
        };
      });

    // Generate nicknames for unnamed characters
    const { characterNicknameService } = await import('../services/characterNicknameService');
    const charactersWithNicknames = await characterNicknameService.detectAndGenerateNicknames(
      req.user!.id,
      message,
      conversationHistory
    );

    // Combine named characters with generated nicknames
    const allCharacters = mergeCharacterPayloads([
      ...validatedNamedCharacters,
      ...charactersWithNicknames.map(char => ({
        name: char.name,
        firstName: char.firstName,
        lastName: char.lastName,
        alias: char.alias || [],
        pronouns: char.pronouns,
        archetype: char.archetype,
        role: char.role,
        summary: char.summary,
        tags: char.tags || [],
        status: 'active' as const,
        isNickname: true, // Generated nicknames
        proximity: char.proximity || 'distant',
        hasMet: char.hasMet ?? false,
        relationshipDepth: char.relationshipDepth || 'mentioned_only',
        associatedWith: char.associatedWith || [],
        likelihoodToMeet: char.likelihoodToMeet || 'unlikely',
        _autoGenerated: true,
        _context: char.context
      }))
    ]);

    incrementAiRequestCount(req.user!.id).catch((err) =>
      logger.warn({ err, userId: req.user!.id }, 'Failed to increment AI usage')
    );

    res.json({ 
      characters: allCharacters,
      unnamedDetected: unnamedCharacters.length,
      nicknamesGenerated: charactersWithNicknames.length
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to extract characters from chat');
    res.status(500).json({ error: 'Failed to extract characters' });
  }
});

/**
 * @swagger
 * /api/characters/{id}/attributes:
 *   get:
 *     summary: Get attributes for a character
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Character ID
 *       - in: query
 *         name: currentOnly
 *         schema:
 *           type: boolean
 *         description: Only return current attributes
 *     responses:
 *       200:
 *         description: Character attributes
 *       404:
 *         description: Character not found
 */
/**
 * POST /api/characters/attributes/batch
 *
 * Returns current attributes for many characters in one round-trip, keyed by
 * character id. Replaces the per-card GET /:id/attributes fan-out the character
 * grid was doing (one request per visible character). Only characters owned by
 * the requesting user are included.
 *
 * Body: { ids: string[], currentOnly?: boolean }
 * Response: { attributes: Record<characterId, CharacterAttribute[]> }
 */
router.post('/attributes/batch', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = Array.from(
      new Set(rawIds.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0))
    );
    const currentOnly = req.body?.currentOnly !== false; // default true

    if (ids.length === 0) {
      return res.json({ attributes: {} });
    }

    // Restrict to characters the user actually owns before reading attributes.
    const { data: owned } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', req.user!.id)
      .in('id', ids);

    const ownedIds = (owned ?? []).map((c) => c.id);
    if (ownedIds.length === 0) {
      return res.json({ attributes: {} });
    }

    const attributes = await entityAttributeDetector.getEntityAttributesBatch(
      req.user!.id,
      ownedIds,
      'character',
      currentOnly
    );

    res.json({ attributes });
  } catch (error) {
    logger.error({ error }, 'Failed to get character attributes (batch)');
    res.status(500).json({ error: 'Failed to get character attributes' });
  }
});

router.get('/:id/attributes', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const currentOnly = req.query.currentOnly === 'true';

    // Verify character exists and belongs to user
    const { data: character, error: charError } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .single();

    if (charError || !character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Get attributes
    const attributes = await entityAttributeDetector.getEntityAttributes(
      req.user!.id,
      id,
      'character',
      currentOnly
    );

    res.json({ attributes });
  } catch (error) {
    logger.error({ error, characterId: req.params.id }, 'Failed to get character attributes');
    res.status(500).json({ error: 'Failed to get character attributes' });
  }
});

// ─── Character Provenance ─────────────────────────────────────────────────────
//
// GET /api/characters/:id/provenance
//
// Returns the full provenance report for a character entity:
//   - Every provenance edge touching this entity
//   - Source conversation messages that mentioned it
//   - Mutation history (truth-state changes)
//   - Derived statistics (mention count, first/last seen)
//
// Powers: "Why does LoreBook know about this person?"

router.get('/:id/provenance', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const entityId = String(req.params.id);

  try {
    const { provenanceEdgeService } = await import('../services/provenance/provenanceEdgeService');

    // Provenance edges for this entity
    const provenanceReport = await provenanceEdgeService.getEntityProvenance(entityId, userId);

    // Mutation history from cognition_mutations audit log
    const { data: mutations } = await supabaseAdmin
      .from('cognition_mutations')
      .select('id, mutation_type, before_state, after_state, rationale, created_at')
      .eq('user_id', userId)
      .eq('artifact_id', entityId)
      .order('created_at', { ascending: true })
      .limit(50);

    // Source utterances for the mention edges
    let sourceUtterances: Array<{ id: string; content: string; created_at: string }> = [];
    if (provenanceReport.sourceMessageIds.length > 0) {
      const { data: utteranceData } = await supabaseAdmin
        .from('utterances')
        .select('id, content, created_at')
        .eq('user_id', userId)
        .in('id', provenanceReport.sourceMessageIds.slice(0, 20))
        .order('created_at', { ascending: true });
      sourceUtterances = utteranceData ?? [];
    }

    // Upstream lineage — what produced this entity?
    const lineage = await provenanceEdgeService.getUpstreamLineage(entityId, userId, 3);

    res.json({
      entityId,
      mentionCount:      provenanceReport.mentionCount,
      firstMentionedAt:  provenanceReport.firstMentionedAt,
      lastMentionedAt:   provenanceReport.lastMentionedAt,
      edges:             provenanceReport.edges,
      lineage,
      sourceUtterances,
      mutationHistory:   mutations ?? [],
      extractedFromIrIds: provenanceReport.extractedFromIrIds,
    });
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to get character provenance');
    res.status(500).json({ error: 'Failed to get character provenance' });
  }
});

// ─── Contradiction Resolution ─────────────────────────────────────────────────
//
// POST /api/characters/:id/contradictions/resolve
//
// Resolves a detected contradiction between two omega_claims:
//   keep_newest   — deactivates the older claim (REVISED truth state)
//   keep_oldest   — deactivates the newer claim (REVISED truth state)
//   preserve_both — marks both as CONTEXTUAL (true in different contexts)
//   mark_uncertain — marks both as PENDING_VERIFICATION for later review

const resolveContradictionSchema = z.object({
  sourceClaimId: z.string().uuid(),
  targetClaimId: z.string().uuid(),
  action: z.enum(['keep_newest', 'keep_oldest', 'preserve_both', 'mark_uncertain']),
});

router.post('/:id/contradictions/resolve', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const parsed = resolveContradictionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid resolution payload', details: parsed.error.flatten() });
  }

  const { sourceClaimId, targetClaimId, action } = parsed.data;

  try {
    // Verify both claims belong to this user before mutating
    const { data: claimsRaw, error: fetchError } = await supabaseAdmin
      .from('omega_claims')
      .select('id, created_at')
      .eq('user_id', userId)
      .in('id', [sourceClaimId, targetClaimId]);

    const claims = claimsRaw as Array<{ id: string; created_at: string }> | null;
    if (fetchError || !claims || claims.length < 2) {
      return res.status(404).json({ error: 'Claims not found or not accessible' });
    }

    // Determine which claim is newer
    const sorted = [...claims].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const newerClaimId  = sorted[0].id;
    const olderClaimId  = sorted[1].id;

    let updates: Array<{ id: string; is_active: boolean; truth_state: string }>;

    switch (action) {
      case 'keep_newest':
        updates = [
          { id: olderClaimId,  is_active: false, truth_state: 'REVISED'  },
          { id: newerClaimId,  is_active: true,  truth_state: 'CANONICAL' },
        ];
        break;
      case 'keep_oldest':
        updates = [
          { id: newerClaimId,  is_active: false, truth_state: 'REVISED'  },
          { id: olderClaimId,  is_active: true,  truth_state: 'CANONICAL' },
        ];
        break;
      case 'preserve_both':
        updates = [
          { id: sourceClaimId, is_active: true, truth_state: 'CONTEXTUAL' },
          { id: targetClaimId, is_active: true, truth_state: 'CONTEXTUAL' },
        ];
        break;
      case 'mark_uncertain':
        updates = [
          { id: sourceClaimId, is_active: true, truth_state: 'PENDING_VERIFICATION' },
          { id: targetClaimId, is_active: true, truth_state: 'PENDING_VERIFICATION' },
        ];
        break;
    }

    // Apply updates (sequential — second should never see a conflicting write)
    for (const update of updates) {
      const { error: updateError } = await supabaseAdmin
        .from('omega_claims')
        .update({ is_active: update.is_active, truth_state: update.truth_state, updated_at: new Date().toISOString() })
        .eq('id', update.id)
        .eq('user_id', userId);

      if (updateError) {
        logger.error({ err: updateError, claimId: update.id }, 'Failed to apply contradiction resolution');
        return res.status(500).json({ error: 'Failed to apply resolution' });
      }
    }

    logger.info({ userId, sourceClaimId, targetClaimId, action }, 'Contradiction resolved');
    return res.json({ resolved: true, action });
  } catch (error) {
    logger.error({ error }, 'Failed to resolve contradiction');
    res.status(500).json({ error: 'Failed to resolve contradiction' });
  }
});

// ─── Entity Lifecycle Diagnostics ────────────────────────────────────────────
//
// GET /api/characters/:id/lifecycle
//
// Returns the 7-stage pipeline lifecycle report for an entity:
//   extracted → persisted → provenanceGraph → relationships →
//   contradictions → merges → consolidation
//
// Powers: "Why doesn't James appear in the character book?"
//         "What contradictions exist for Sarah?"

router.get('/:id/lifecycle', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const entityId = String(req.params.id);

  try {
    const { entityLifecycleDiagnostics } = await import('../services/entityLifecycleDiagnostics');
    const report = await entityLifecycleDiagnostics.diagnose(entityId, userId);
    res.json(report);
  } catch (error) {
    logger.error({ error, entityId }, 'Failed to run entity lifecycle diagnostics');
    res.status(500).json({ error: 'Failed to run lifecycle diagnostics' });
  }
});

// POST /api/characters/public-figures/infer
// Infer contextual interactions with public figures and update scene network standing.
router.post('/public-figures/infer', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { publicFigureRelationshipService } = await import('../services/publicFigure/publicFigureRelationshipService');
    const { socialStandingService } = await import('../services/socialStandingService');
    const report = await publicFigureRelationshipService.inferForUser(userId);
    await socialStandingService.recompute(userId);
    res.json({ success: true, ...report });
  } catch (error) {
    logger.error({ error, userId }, 'Public figure inference failed');
    res.status(500).json({ error: 'Inference failed' });
  }
});

// POST /api/characters/social-standing/recompute
// Recompute inner-circle tier + network degree for all characters.
// Descriptive organization signal only — never injected into chat tone.
router.post('/social-standing/recompute', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { socialStandingService } = await import('../services/socialStandingService');
    const result = await socialStandingService.recompute(userId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ error, userId }, 'Social standing recompute failed');
    res.status(500).json({ error: 'Recompute failed' });
  }
});

// POST /api/characters/classify-backfill
// Classify relationship type (family/romantic/professional/…) for every
// character that has no archetype yet, using their facts plus past chat and
// journal mentions. Multilingual kinship aware (Abuela = grandmother).
router.post('/classify-backfill', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { entityFactsService } = await import('../services/entityFactsService');
    const result = await entityFactsService.backfillCharacterClassifications(userId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ error, userId }, 'Character classification backfill failed');
    res.status(500).json({ error: 'Backfill failed' });
  }
});

// GET /api/characters/:id/peripherals — vicarious links (family, social, work, etc.)
router.get(
  '/:id/peripherals',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const characterId = String(req.params.id);
    const domain = req.query.domain as string | undefined;
    const includeDismissed = req.query.includeDismissed === 'true';
    const peripherals = await listPeripheralsForCharacter(userId, characterId, {
      domain: domain as import('../services/ontology/vicariousRelationshipIntelligence').RelationshipPeripheryDomain | undefined,
      includeDismissed,
    });
    res.json({ success: true, peripherals });
  })
);

router.post(
  '/:id/peripherals/:peripheralId/confirm',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const peripheral = await confirmPeripheral(userId, String(req.params.peripheralId));
    res.json({ success: true, peripheral });
  })
);

router.post(
  '/:id/peripherals/:peripheralId/dismiss',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const peripheral = await dismissPeripheral(userId, String(req.params.peripheralId));
    res.json({ success: true, peripheral });
  })
);

router.post(
  '/:id/peripherals/:peripheralId/promote',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const result = await promotePeripheralToCharacter(userId, String(req.params.peripheralId));
    res.json({ success: true, ...result });
  })
);

// GET /api/characters/:id/conversations
// Conversation threads where this character was mentioned (origin + subsequent).
router.get('/:id/conversations', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { entityConversationLinkService } = await import('../services/conversationCentered/entityConversationLinkService');
    const conversations = await entityConversationLinkService.getThreadsForEntity(userId, 'character', characterId);
    res.json({ success: true, conversations });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to get character conversations');
    res.status(500).json({ error: 'Failed to get character conversations' });
  }
});

// GET /api/characters/:id/evidence
router.get('/:id/evidence', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { getCharacterEvidenceLocker } = await import('../services/characterEvidenceService');
    const locker = await getCharacterEvidenceLocker(userId, characterId);
    if (!locker) return res.status(404).json({ error: 'Character not found' });
    res.json({ success: true, locker });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to get character evidence locker');
    res.status(500).json({ error: 'Failed to get character evidence' });
  }
});

// GET /api/characters/:id/query — sectioned Character Query read model
router.get('/:id/query', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sections = typeof req.query.sections === 'string' ? req.query.sections : 'core';
    const { getCharacterQuery } = await import('../services/characters/characterQueryService');
    const query = await getCharacterQuery(userId, characterId, { sections });
    if (!query) return res.status(404).json({ error: 'Character not found' });
    res.json({ success: true, query });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to get character query');
    res.status(500).json({ error: 'Failed to get character query' });
  }
});

// GET /api/characters/:id/profile-bundle — modal read model (detail + knowledge + lore + chat mentions)
// Backed by Character Query core sections; prefer /query going forward.
router.get('/:id/profile-bundle', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { getCharacterProfileBundle } = await import('../services/characters/characterProfileBundleService');
    const bundle = await getCharacterProfileBundle(userId, characterId);
    if (!bundle) return res.status(404).json({ error: 'Character not found' });
    res.json({ success: true, bundle });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to get character profile bundle');
    res.status(500).json({ error: 'Failed to get character profile bundle' });
  }
});

// GET /api/characters/:id/knowledge-base
// Unified entity knowledge bundle: facts, crystallized claims, timeline, identity merges, related entities.
router.get('/:id/knowledge-base', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { getCharacterKnowledgeBase } = await import('../services/characterKnowledgeBaseService');
    const knowledgeBase = await getCharacterKnowledgeBase(userId, characterId);
    if (!knowledgeBase) return res.status(404).json({ error: 'Character not found' });
    res.json({ success: true, knowledgeBase });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to get character knowledge base');
    res.status(500).json({ error: 'Failed to get character knowledge base' });
  }
});

// GET /api/characters/:id/lore-profile
// Skills, hobbies, interests, groups, and people associations from mention-derived lore.
router.get('/:id/lore-profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { characterLoreProfileService } = await import('../services/characters/characterLoreProfileService');
    const profile = await characterLoreProfileService.compile(userId, characterId);
    if (!profile) return res.status(404).json({ error: 'Character not found' });
    res.json({ success: true, profile });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to get character lore profile');
    res.status(500).json({ error: 'Failed to get character lore profile' });
  }
});

// POST /api/characters/:id/lore-items/repair-attribution
// Unlink first-person interests wrongly attached via co-mention (Mom-got-Duolingo).
router.post('/:id/lore-items/repair-attribution', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  const dryRun = req.body?.dryRun === true;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!character) return res.status(404).json({ error: 'Character not found' });

    const { repairFirstPersonCoMentionPollution } = await import(
      '../services/conversationCentered/interestCoMentionCleanupService'
    );
    const result = await repairFirstPersonCoMentionPollution(userId, { characterId, dryRun });
    return res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to repair lore attribution');
    res.status(500).json({ error: 'Failed to repair lore attribution' });
  }
});

// DELETE /api/characters/:id/lore-items/:itemId
// Unlink a hobby/interest (or dismiss an entity attribute) from this character.
// Global interest rows stay in the user's growing knowledge list.
// Learns: dismissed characters are blocked from silent re-attach on ingest.
router.delete('/:id/lore-items/:itemId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  const itemId = String(req.params.itemId);
  const label = typeof req.query.label === 'string' ? req.query.label : undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!character) return res.status(404).json({ error: 'Character not found' });

    // Interest UUID → unlink from related_character_ids
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
      const { interestTracker } = await import('../services/conversationCentered/interestTracker');
      const ok = await interestTracker.unlinkCharacterFromInterest(userId, itemId, characterId);
      if (!ok) return res.status(404).json({ error: 'Interest not found' });
      return res.json({
        success: true,
        unlinked: 'interest',
        learned: true,
        message: 'Removed. LoreBook will not re-add this from chats unless you restore it.',
      });
    }

    // Attribute chip id: attr-<type>-<value>
    if (itemId.startsWith('attr-')) {
      const rest = itemId.slice('attr-'.length);
      const dash = rest.indexOf('-');
      const attrType = dash >= 0 ? rest.slice(0, dash) : rest;
      const attrValue = label || (dash >= 0 ? rest.slice(dash + 1) : '');
      let query = supabaseAdmin
        .from('entity_attributes')
        .update({ is_current: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('entity_id', characterId)
        .eq('entity_type', 'character')
        .eq('attribute_type', attrType);
      if (attrValue) query = query.ilike('attribute_value', attrValue);
      const { error } = await query;
      if (error) {
        logger.warn({ error, characterId, itemId }, 'Failed to dismiss entity attribute');
        return res.status(500).json({ error: 'Failed to dismiss attribute' });
      }
      return res.json({ success: true, unlinked: 'attribute', learned: true });
    }

    return res.status(400).json({ error: 'Unsupported lore item id' });
  } catch (error) {
    logger.error({ error, characterId, itemId }, 'Failed to unlink lore item');
    res.status(500).json({ error: 'Failed to unlink lore item' });
  }
});

// POST /api/characters/:id/lore-items/:itemId/restore
// Undo a dismiss — re-link hobby/interest and clear the learn-not-to-reattach block.
router.post('/:id/lore-items/:itemId/restore', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  const itemId = String(req.params.itemId);
  const label = typeof req.body?.label === 'string' ? req.body.label : undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!character) return res.status(404).json({ error: 'Character not found' });

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
      const { interestTracker } = await import('../services/conversationCentered/interestTracker');
      const result = await interestTracker.relinkCharacterToInterest(userId, itemId, characterId);
      if (!result.ok) return res.status(404).json({ error: 'Interest not found' });
      return res.json({
        success: true,
        restored: 'interest',
        interestName: result.interestName,
        message: 'Restored. LoreBook can link this again from your chats.',
      });
    }

    if (itemId.startsWith('attr-')) {
      const rest = itemId.slice('attr-'.length);
      const dash = rest.indexOf('-');
      const attrType = dash >= 0 ? rest.slice(0, dash) : rest;
      const attrValue = label || (dash >= 0 ? rest.slice(dash + 1) : '');
      let query = supabaseAdmin
        .from('entity_attributes')
        .update({ is_current: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('entity_id', characterId)
        .eq('entity_type', 'character')
        .eq('attribute_type', attrType);
      if (attrValue) query = query.ilike('attribute_value', attrValue);
      const { error } = await query;
      if (error) {
        logger.warn({ error, characterId, itemId }, 'Failed to restore entity attribute');
        return res.status(500).json({ error: 'Failed to restore attribute' });
      }
      return res.json({ success: true, restored: 'attribute' });
    }

    return res.status(400).json({ error: 'Unsupported lore item id' });
  } catch (error) {
    logger.error({ error, characterId, itemId }, 'Failed to restore lore item');
    res.status(500).json({ error: 'Failed to restore lore item' });
  }
});

// POST /api/characters/:id/avatar/lore — generate portrait from character lore
router.post('/:id/avatar/lore', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { generateLoreAvatar } = await import('../services/characters/characterLoreAvatarService');
    const force = Boolean((req.body as { force?: boolean } | undefined)?.force);
    const result = await generateLoreAvatar(userId, characterId, { force });
    if (!result.ok) {
      const status =
        result.reason === 'insufficient_lore'
          ? 422
          : result.reason === 'rate_limited'
            ? 429
            : result.reason === 'disabled'
              ? 503
              : 500;
      return res.status(status).json({ success: false, ...result });
    }
    res.json({ success: true, avatar_url: result.avatarUrl, source: result.source });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to generate lore avatar');
    res.status(500).json({ error: 'Failed to generate lore avatar' });
  }
});

// GET /api/characters/:id/facts
// Returns all known facts about this character extracted from conversations.
// Facts are grouped by category and include confidence, status, and update history.
router.get('/:id/facts', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { entityFactsService } = await import('../services/entityFactsService');
    const facts = await entityFactsService.getEntityFacts(userId, characterId, 'character');
    res.json({ success: true, facts });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to get character facts');
    res.status(500).json({ error: 'Failed to get character facts' });
  }
});

// DELETE /api/characters/:id/facts/:factId
// Soft-retract a single fact (status → contradicted). Used by self-profile
// "What Lore Knows" so users can remove incorrect facts about themselves.
router.delete('/:id/facts/:factId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  const factId = String(req.params.factId);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!characterId || !factId) return res.status(400).json({ error: 'character id and fact id required' });

  try {
    const { entityFactsService } = await import('../services/entityFactsService');
    const retracted = await entityFactsService.retractFactById(
      userId,
      characterId,
      'character',
      factId,
    );
    if (!retracted) {
      return res.status(404).json({ error: 'Fact not found' });
    }
    res.json({ success: true, factId, status: 'contradicted' });
  } catch (error) {
    logger.error({ error, characterId, factId }, 'Failed to retract character fact');
    res.status(500).json({ error: 'Failed to remove fact' });
  }
});

// PATCH /api/characters/:id/facts/:factId
// User correction — rewrite the fact text, keep previous_value + corrected status.
router.patch('/:id/facts/:factId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  const factId = String(req.params.factId);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!characterId || !factId) return res.status(400).json({ error: 'character id and fact id required' });

  const schema = z.object({
    fact: z.string().trim().min(1, 'Fact text is required').max(500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid fact', details: parsed.error.flatten() });
  }

  try {
    const { entityFactsService } = await import('../services/entityFactsService');
    const updated = await entityFactsService.correctFactById(
      userId,
      characterId,
      'character',
      factId,
      parsed.data.fact,
    );
    if (!updated) {
      return res.status(404).json({ error: 'Fact not found' });
    }
    res.json({ success: true, fact: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to correct fact';
    if (message.includes('too long')) {
      return res.status(400).json({ error: message });
    }
    logger.error({ error, characterId, factId }, 'Failed to correct character fact');
    res.status(500).json({ error: 'Failed to correct fact' });
  }
});

// GET /api/characters/:id/scene-candidates
// Returns recurring event candidates involving this character (for "Moments with X" UI).
router.get('/:id/scene-candidates', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  const characterId = String(req.params.id);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { eventCandidateService } = await import('../services/eventCandidates/eventCandidateService');
    const candidates = await eventCandidateService.getCandidatesForEntity(userId, characterId);
    res.json({ success: true, candidates });
  } catch (error) {
    logger.error({ error, characterId }, 'Failed to get scene candidates');
    res.status(500).json({ error: 'Failed to get scene candidates' });
  }
});

// ── Character media: Photos + Messages (DM screenshots / text) ────────────────
// GET /api/characters/:id/media?kind=photo|message&photoRole=selfie|appears_in
router.get('/:id/media', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.id);
  const kind = req.query.kind ? String(req.query.kind) : undefined;
  const photoRole = req.query.photoRole ? String(req.query.photoRole) : undefined;
  let q = supabaseAdmin
    .from('character_media')
    .select('id, character_id, kind, url, text, caption, source, metadata, created_at')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .order('created_at', { ascending: false });
  if (kind === 'photo' || kind === 'message') q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) {
    logger.error({ error, characterId }, 'list character media failed');
    return res.status(500).json({ error: 'Failed to load media' });
  }
  let media = data ?? [];
  if (photoRole === 'selfie' || photoRole === 'appears_in') {
    media = media.filter((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const role =
        meta.photoRole === 'selfie' || meta.photoRole === 'appears_in'
          ? meta.photoRole
          : meta.isSelfie === true || meta.source === 'selfie'
            ? 'selfie'
            : 'appears_in';
      return role === photoRole;
    });
  }
  res.json({ media });
});

const characterMediaUpload = createMemoryUpload({
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

async function persistCharacterPhotoMedia(opts: {
  userId: string;
  characterId: string;
  characterName: string;
  buffer: Buffer;
  contentType: string;
  caption?: string | null;
  source?: string | null;
  photoRole?: 'selfie' | 'appears_in';
}): Promise<{ media: Record<string, unknown> } | { error: string; status: number }> {
  const { userId, characterId, characterName, buffer, contentType, caption, source, photoRole } = opts;
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const storage_path = `${userId}/characters/${characterId}/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('photos')
    .upload(storage_path, buffer, { contentType, upsert: false });
  if (upErr) {
    logger.error({ error: upErr, characterId, message: upErr.message }, 'character media upload failed');
    return {
      status: 500,
      error: upErr.message?.includes('Bucket not found')
        ? 'Photo storage is not configured (missing photos bucket).'
        : `Upload failed: ${upErr.message || 'storage error'}`,
    };
  }
  const url = supabaseAdmin.storage.from('photos').getPublicUrl(storage_path).data.publicUrl;
  const resolvedRole = photoRole === 'selfie' || photoRole === 'appears_in' ? photoRole : 'appears_in';
  const { data, error } = await supabaseAdmin
    .from('character_media')
    .insert({
      user_id: userId,
      character_id: characterId,
      kind: 'photo',
      url,
      storage_path,
      text: null,
      caption: caption ?? null,
      source: source ?? (resolvedRole === 'selfie' ? 'selfie' : 'characters_book'),
      metadata: {
        photoRole: resolvedRole,
        isSelfie: resolvedRole === 'selfie',
      },
    })
    .select('id, character_id, kind, url, text, caption, source, metadata, created_at')
    .single();
  if (error) {
    logger.error({ error, characterId }, 'insert character media failed');
    return { status: 500, error: 'Could not save media' };
  }
  const photoId = storage_path.split('/').pop()?.replace(/\.[^.]+$/, '') || randomUUID();
  try {
    const { photoService } = await import('../services/photoService');
    await photoService.ensurePhotoAlbumEntry({
      userId,
      photoUrl: url,
      photoId,
      filename: storage_path.split('/').pop(),
      source: 'character_media',
      content: caption?.trim() || `Photo of ${characterName}`,
      tags: ['photo', 'character', resolvedRole === 'selfie' ? 'selfie' : 'appears_in'],
      metadata: {
        characterId,
        characterName,
        characterMediaId: data?.id,
        storagePath: storage_path,
        photoRole: resolvedRole,
      },
    });
  } catch (albumErr) {
    logger.warn({ albumErr, characterId }, 'character media album entry failed — media still saved');
  }

  // Self character Selfies / Pictures I'm In → vision appearance learning.
  let mediaOut: Record<string, unknown> = data as Record<string, unknown>;
  if (photoRole === 'selfie' || photoRole === 'appears_in') {
    try {
      const { selfCharacterService } = await import('../services/selfCharacterService');
      const self = await selfCharacterService.ensureSelfCharacter(userId);
      const selfId = self?.id ? String(self.id) : null;
      if (selfId && selfId === characterId) {
        const { photoAnalysisService } = await import('../services/photoAnalysisService');
        const learned = await photoAnalysisService.learnAppearanceFromSelfPhoto({
          userId,
          selfCharacterId: selfId,
          photoBuffer: buffer,
          filename: storage_path.split('/').pop() || `${photoId}.jpg`,
          photoId,
          forceSelfSubject: resolvedRole === 'selfie',
        });
        if (learned.appearanceSignals.length || learned.analysis) {
          const nextMeta = {
            ...((mediaOut.metadata as Record<string, unknown> | null) ?? {}),
            photoRole: resolvedRole,
            isSelfie: resolvedRole === 'selfie',
            appearanceSignals: learned.appearanceSignals,
            lookProfileUpdated: learned.lookProfileUpdated,
            analysis: learned.analysis
              ? {
                  subjectFocus: learned.analysis.subjectFocus,
                  isSelfie: learned.analysis.isSelfie,
                  summary: learned.analysis.summary,
                }
              : undefined,
          };
          const { data: updated } = await supabaseAdmin
            .from('character_media')
            .update({ metadata: nextMeta })
            .eq('id', String(mediaOut.id))
            .eq('user_id', userId)
            .select('id, character_id, kind, url, text, caption, source, metadata, created_at')
            .maybeSingle();
          if (updated) mediaOut = updated as Record<string, unknown>;
        }
      }
    } catch (learnErr) {
      logger.warn({ learnErr, characterId }, 'character media appearance learning failed — media still saved');
    }
  }

  return { media: mediaOut };
}

// POST /api/characters/:id/media — multipart file preferred; JSON dataUrl still supported.
router.post(
  '/:id/media',
  requireAuth,
  (req, res, next) => {
    const ct = String(req.headers['content-type'] || '');
    if (ct.includes('multipart/form-data')) {
      return characterMediaUpload.single('file')(req, res, next);
    }
    return next();
  },
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const characterId = String(req.params.id);
    const file = (req as AuthenticatedRequest & { file?: { buffer: Buffer; mimetype: string; originalname?: string } }).file;

    const schema = z.object({
      kind: z.enum(['photo', 'message']).default('photo'),
      dataUrl: z.string().optional(),
      text: z.string().optional(),
      caption: z.string().optional(),
      source: z.string().optional(),
      analyzeImage: z.boolean().optional(),
      photoRole: z.enum(['selfie', 'appears_in']).optional(),
    });

    const rawBody = {
      kind: req.body?.kind ?? (file ? 'photo' : undefined),
      dataUrl: req.body?.dataUrl,
      text: req.body?.text,
      caption: req.body?.caption,
      source: req.body?.source,
      analyzeImage:
        req.body?.analyzeImage === true ||
        req.body?.analyzeImage === 'true' ||
        req.body?.analyzeImage === '1',
      photoRole: req.body?.photoRole,
    };
    const parsed = schema.safeParse(rawBody);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid media', details: parsed.error.flatten() });
    }
    const { kind, dataUrl, text, caption, source, analyzeImage, photoRole } = parsed.data;
    if (!file && !dataUrl && !text) {
      return res.status(400).json({ error: 'Provide an image or text' });
    }

    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('name')
      .eq('user_id', userId)
      .eq('id', characterId)
      .maybeSingle();
    if (!character) return res.status(404).json({ error: 'Character not found' });

    try {
      if (kind === 'message') {
        const { characterMessageMediaService } = await import('../services/characters/characterMessageMediaService');
        const saved = await characterMessageMediaService.saveMessageMedia({
          userId,
          characterId,
          characterName: character.name as string,
          dataUrl,
          text,
          caption,
          source,
          analyzeImage,
        });
        if (!saved) return res.status(500).json({ error: 'Could not save message' });
        return res.json({ media: saved });
      }

      let buffer: Buffer | null = null;
      let contentType = 'image/jpeg';
      if (file?.buffer?.length) {
        buffer = file.buffer;
        contentType = file.mimetype || 'image/jpeg';
      } else if (dataUrl) {
        const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
        if (!match) return res.status(400).json({ error: 'Invalid image data URL' });
        contentType = match[1];
        buffer = Buffer.from(match[2], 'base64');
      }
      if (!buffer) return res.status(400).json({ error: 'Provide an image' });

      const result = await persistCharacterPhotoMedia({
        userId,
        characterId,
        characterName: character.name as string,
        buffer,
        contentType,
        caption,
        source,
        photoRole,
      });
      if ('error' in result) return res.status(result.status).json({ error: result.error });
      return res.json({ media: result.media });
    } catch (e) {
      logger.error({ error: e, characterId }, 'character media error');
      res.status(500).json({ error: 'Could not save media' });
    }
  },
);

// DELETE /api/characters/:id/media/:mediaId
router.delete('/:id/media/:mediaId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const { data: row } = await supabaseAdmin
    .from('character_media').select('id, storage_path').eq('id', String(req.params.mediaId)).eq('user_id', userId).maybeSingle();
  if (!row) return res.status(404).json({ error: 'Not found' });
  const r = row as { id: string; storage_path: string | null };
  if (r.storage_path) {
    await supabaseAdmin.storage.from('photos').remove([r.storage_path]).catch(() => {});
  }
  await supabaseAdmin.from('character_media').delete().eq('id', r.id).eq('user_id', userId);
  res.json({ deleted: true });
});

// ── Self-identity resolution: same-name disambiguation ───────────────────────
// A character that shares the user's name may be the user OR a different person
// with the same name (e.g. an estranged parent). Never auto-decide — surface
// collisions, let the user confirm "this is me" (merge into self) or "different
// person" (keep separate, optionally record the relationship).

// GET /api/characters/self/name-collisions — non-self characters sharing the self's name(s)
router.get('/self/name-collisions', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const self = await selfCharacterService.ensureSelfCharacter(userId);
    const selfId = self?.id as string | undefined;
    const selfNames = new Set<string>();
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    if (self?.name) selfNames.add(norm(String(self.name)));
    for (const a of ((self?.metadata as any)?.aliases ?? []) as string[]) selfNames.add(norm(a));
    // Also include the account display name if present.
    const { data: acct } = await supabaseAdmin.auth.admin.getUserById(userId);
    const display = acct?.user?.user_metadata?.full_name || acct?.user?.user_metadata?.name;
    if (display) selfNames.add(norm(String(display)));

    const { data: chars } = await supabaseAdmin
      .from('characters').select('id, name, summary, metadata, importance_level').eq('user_id', userId);
    const collisions = (chars ?? []).filter((c: any) => {
      if (c.id === selfId) return false;
      const m = c.metadata ?? {};
      if (m.is_self === true || m.distinct_from_self === true || m.confirmed_distinct === true) return false;
      return selfNames.has(norm(String(c.name ?? '')));
    });
    res.json({ self_id: selfId ?? null, collisions });
  } catch (error) {
    logger.error({ error, userId }, 'name-collisions failed');
    res.status(500).json({ error: 'Failed to load name collisions' });
  }
});

// POST /api/characters/:id/merge-into-self — "this is me": fold this card into the self character
router.post('/:id/merge-into-self', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const sourceId = String(req.params.id);
  try {
    const self = await selfCharacterService.ensureSelfCharacter(userId);
    if (!self?.id) return res.status(500).json({ error: 'No self character' });
    if (self.id === sourceId) return res.status(400).json({ error: 'Already the self character' });
    const report = await characterMergeService.merge(userId, sourceId, String(self.id), { mergedBy: 'USER', reason: 'Confirmed self (this is me)' });
    res.json({ merged: true, self_id: self.id, report });
  } catch (error: any) {
    logger.error({ error, userId, sourceId }, 'merge-into-self failed');
    res.status(500).json({ error: error?.message ?? 'Failed to merge into self' });
  }
});

// POST /api/characters/:id/distinct-from-self — "different person": keep separate forever
// body: { relationship?: string }  e.g. 'father' to record the estranged-parent case
router.post('/:id/distinct-from-self', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id);
  const relationship = typeof req.body?.relationship === 'string' ? req.body.relationship.trim() : undefined;
  try {
    const { data: row } = await supabaseAdmin
      .from('characters').select('id, metadata').eq('id', id).eq('user_id', userId).maybeSingle();
    if (!row) return res.status(404).json({ error: 'Character not found' });
    const metadata = { ...((row as any).metadata ?? {}), distinct_from_self: true, confirmed_distinct: true, is_self: false };
    if (relationship) metadata.relationship_type = relationship;
    const { data: updated } = await supabaseAdmin
      .from('characters').update({ metadata }).eq('id', id).eq('user_id', userId).select('*').maybeSingle();
    res.json({ ok: true, character: updated ?? null });
  } catch (error) {
    logger.error({ error, userId, id }, 'distinct-from-self failed');
    res.status(500).json({ error: 'Failed to mark distinct' });
  }
});

export const charactersRouter = router;
