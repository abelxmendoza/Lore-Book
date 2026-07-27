/**
 * Chat-driven wrong-book corrections — "X is a group, not a place".
 * Resolves the source card by name, then calls the existing reclassify
 * services (create-or-merge into the target book + hide/archive source).
 */

import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import {
  reclassifyLocationService,
  validateLocationReclassification,
  type LocationReclassifyTarget,
  isLocationReclassifyTarget,
} from '../locations/reclassifyLocationService';
import {
  reclassifyCharacterService,
  validateReclassification,
  type ReclassifyTarget,
  isReclassifyTarget,
} from '../characters/reclassifyCharacterService';
import { entityLearningService } from '../entityLearningService';

export type EntityReclassifyWriteResult = {
  summary: string;
  sourceDomain: 'location' | 'character';
  sourceId: string;
  sourceName: string;
  target: string;
  targetId: string | null;
  targetName: string;
  mergedIntoExisting: boolean;
};

const DOMAIN_ALIASES: Record<string, string> = {
  group: 'organization',
  crew: 'organization',
  squad: 'organization',
  collective: 'organization',
  org: 'organization',
  organization: 'organization',
  person: 'character',
  character: 'character',
  people: 'character',
  project: 'project',
  skill: 'skill',
  event: 'event',
  place: 'location',
  location: 'location',
};

function normalizeDomainToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/s$/, '');
  // "people" → person → character; avoid stripping only trailing s wrongly for "orgs"
  if (/^people$/i.test(raw)) return 'character';
  if (/^characters?$/i.test(raw)) return 'character';
  if (/^groups?$|^crews?$|^squads?$|^collectives?$|^orgs?$|^organizations?$/i.test(raw)) {
    return 'organization';
  }
  if (/^projects?$/i.test(raw)) return 'project';
  if (/^skills?$/i.test(raw)) return 'skill';
  if (/^events?$/i.test(raw)) return 'event';
  if (/^places?$|^locations?$/i.test(raw)) return 'location';
  if (/^persons?$/i.test(raw)) return 'character';
  return DOMAIN_ALIASES[key] ?? DOMAIN_ALIASES[raw.toLowerCase()] ?? null;
}

function cleanEntityName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseEntityReclassifyRequest(message: string): {
  entityName: string;
  targetDomain: string | null;
  sourceHint: string | null;
} | null {
  const text = message.trim();
  if (!text) return null;

  const isNot = text.match(
    /\b(.{1,80}?)\s+is\s+(?:a\s+|an\s+)?(group|crew|squad|collective|org(?:anization)?|person|character|people|project|skill|event|place|location)\b\s*[,.]?\s*(?:not|n't)\s+(?:a\s+|an\s+)?(place|location|person|character|group|crew|squad|org(?:anization)?|project|skill|event)\b/i,
  );
  if (isNot) {
    return {
      entityName: cleanEntityName(isNot[1]),
      targetDomain: normalizeDomainToken(isNot[2]),
      sourceHint: normalizeDomainToken(isNot[3]),
    };
  }

  const notA = text.match(
    /\b(.{1,80}?)\s+is(?:n't|\s+not)\s+(?:a\s+|an\s+)?(place|location|person|character|group|crew|squad|org(?:anization)?|project|skill|event)\b/i,
  );
  if (notA) {
    // Infer target from "should be" / "move" elsewhere, else from context words.
    const should = text.match(
      /\bshould\s+be\s+(?:a\s+|an\s+)?(group|crew|squad|collective|org(?:anization)?|person|character|project|skill|event|place|location)\b/i,
    );
    const move = text.match(
      /\b(?:move|reclassify|change).{0,40}\b(?:to|into|as)\s+(?:a\s+|an\s+|my\s+)?(group|crew|squad|collective|org(?:anization)?|person|character|project|skill|event|place|location)\b/i,
    );
    return {
      entityName: cleanEntityName(notA[1]),
      targetDomain: normalizeDomainToken(should?.[1] ?? move?.[1] ?? null),
      sourceHint: normalizeDomainToken(notA[2]),
    };
  }

  const shouldBe = text.match(
    /\b(.{1,80}?)\s+should\s+be\s+(?:a\s+|an\s+)?(group|crew|squad|collective|org(?:anization)?|person|character|people|project|skill|event|place|location)\b/i,
  );
  if (shouldBe) {
    return {
      entityName: cleanEntityName(shouldBe[1]),
      targetDomain: normalizeDomainToken(shouldBe[2]),
      sourceHint: null,
    };
  }

  const moveTo = text.match(
    /\b(?:move|reclassify|change)\s+(.{1,80}?)\s+(?:to|into|as)\s+(?:a\s+|an\s+|my\s+|the\s+)?(groups?|crews?|squads?|collectives?|org(?:anization)?s?|person|people|characters?|projects?|skills?|events?|places?|locations?)(?:\s+book)?\b/i,
  );
  if (moveTo) {
    return {
      entityName: cleanEntityName(moveTo[1]),
      targetDomain: normalizeDomainToken(moveTo[2]),
      sourceHint: null,
    };
  }

  const belongs = text.match(
    /\b(.{1,80}?)\s+(?:belongs\s+in|goes\s+(?:in|into))\s+(?:the\s+|my\s+)?(groups?|crews?|squads?|collectives?|org(?:anization)?s?|person|people|characters?|projects?|skills?|events?|places?|locations?)(?:\s+book)?\b/i,
  );
  if (belongs) {
    return {
      entityName: cleanEntityName(belongs[1]),
      targetDomain: normalizeDomainToken(belongs[2]),
      sourceHint: null,
    };
  }

  return null;
}

async function findLocationByName(
  userId: string,
  name: string,
): Promise<{ id: string; name: string; metadata: Record<string, unknown> | null } | null> {
  const key = normalizeNameKey(name);
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, metadata')
    .eq('user_id', userId);
  if (error || !data) return null;
  const hit = data.find((row) => {
    if (normalizeNameKey(String(row.name ?? '')) === key) return true;
    const aliases = Array.isArray((row.metadata as Record<string, unknown> | null)?.aliases)
      ? ((row.metadata as Record<string, unknown>).aliases as unknown[])
      : [];
    return aliases.some((a) => typeof a === 'string' && normalizeNameKey(a) === key);
  });
  if (!hit) return null;
  const meta = (hit.metadata as Record<string, unknown> | null) ?? null;
  if (String(meta?.migration_status ?? '') === 'moved') return null;
  if (meta?.place_book_visible === false) return null;
  return {
    id: hit.id as string,
    name: hit.name as string,
    metadata: meta,
  };
}

async function findCharacterByName(
  userId: string,
  name: string,
): Promise<{ id: string; name: string; summary: string | null; metadata: Record<string, unknown> | null } | null> {
  const key = normalizeNameKey(name);
  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('id, name, summary, alias, metadata, status')
    .eq('user_id', userId);
  if (error || !data) return null;
  const hit = data.find((row) => {
    if (row.status === 'reclassified') return false;
    if (normalizeNameKey(String(row.name ?? '')) === key) return true;
    const aliases = Array.isArray(row.alias) ? (row.alias as unknown[]) : [];
    return aliases.some((a) => typeof a === 'string' && normalizeNameKey(a) === key);
  });
  if (!hit) return null;
  return {
    id: hit.id as string,
    name: hit.name as string,
    summary: (hit.summary as string | null) ?? null,
    metadata: (hit.metadata as Record<string, unknown> | null) ?? null,
  };
}

function bookLabel(target: string): string {
  switch (target) {
    case 'organization':
      return 'Groups';
    case 'character':
      return 'Characters';
    case 'location':
      return 'Places';
    case 'project':
      return 'Projects';
    case 'skill':
      return 'Skills';
    case 'event':
      return 'Events';
    default:
      return target;
  }
}

export async function writeEntityReclassifyFromChat(
  userId: string,
  message: string,
): Promise<EntityReclassifyWriteResult> {
  const parsed = parseEntityReclassifyRequest(message);
  if (!parsed?.entityName) {
    throw new Error("I couldn't tell which entity to move — try “X is a group, not a place”.");
  }

  let target = parsed.targetDomain;
  // "X is not a place" without an explicit target → default to organization
  // (the most common wrong-book Places failure mode).
  if (!target && parsed.sourceHint === 'location') {
    target = 'organization';
  }
  if (!target) {
    throw new Error(
      `I know "${parsed.entityName}" is in the wrong book, but not which book it belongs in. Try “${parsed.entityName} should be a group”.`,
    );
  }

  const preferLocation =
    parsed.sourceHint === 'location' ||
    (!parsed.sourceHint && target !== 'location');
  const preferCharacter =
    parsed.sourceHint === 'character' || target === 'location';

  if (preferLocation || !preferCharacter) {
    const location = await findLocationByName(userId, parsed.entityName);
    if (location && isLocationReclassifyTarget(target)) {
      const validation = validateLocationReclassification(location.name, '', target as LocationReclassifyTarget);
      if (!validation.allowed) {
        throw new Error(validation.reason ?? `Cannot move "${location.name}" to ${bookLabel(target)}.`);
      }
      const outcome = await reclassifyLocationService.performReclassification(
        userId,
        {
          id: location.id,
          name: location.name,
          description:
            typeof location.metadata?.description === 'string'
              ? (location.metadata.description as string)
              : typeof location.metadata?.summary === 'string'
                ? (location.metadata.summary as string)
                : null,
          metadata: location.metadata,
        },
        target as LocationReclassifyTarget,
      );
      await reclassifyLocationService.archiveSourceLocation(userId, {
        id: location.id,
        name: location.name,
        metadata: location.metadata,
      }, outcome);
      void entityLearningService.recordDeletionLearning({
        userId,
        domain: 'locations',
        entityId: location.id,
        name: location.name,
        aliases: Array.isArray(location.metadata?.aliases)
          ? (location.metadata!.aliases as string[])
          : [],
        reason: `reclassified_to_${target}`,
      });
      const mergeNote = outcome.mergedIntoExisting ? ' (merged into the existing card)' : '';
      return {
        summary: `Moved **${location.name}** from Places to ${bookLabel(outcome.target)}${mergeNote}.`,
        sourceDomain: 'location',
        sourceId: location.id,
        sourceName: location.name,
        target: outcome.target,
        targetId: outcome.targetId,
        targetName: outcome.targetName,
        mergedIntoExisting: outcome.mergedIntoExisting,
      };
    }
  }

  const character = await findCharacterByName(userId, parsed.entityName);
  if (character && isReclassifyTarget(target)) {
    const validation = validateReclassification(character.name, character.summary ?? '', target as ReclassifyTarget);
    if (!validation.allowed) {
      throw new Error(validation.reason ?? `Cannot move "${character.name}" to ${bookLabel(target)}.`);
    }
    const outcome = await reclassifyCharacterService.performReclassification(
      userId,
      {
        id: character.id,
        name: character.name,
        summary: character.summary,
        metadata: character.metadata,
      },
      target as ReclassifyTarget,
    );
    const meta = {
      ...(character.metadata ?? {}),
      reclassified_from: 'character',
      reclassified_to: target,
      reclassified_at: new Date().toISOString(),
      ...(outcome.targetId ? { reclassified_target_id: outcome.targetId } : {}),
    };
    await supabaseAdmin
      .from('characters')
      .update({ metadata: meta, status: 'reclassified', updated_at: new Date().toISOString() })
      .eq('id', character.id)
      .eq('user_id', userId);

    const mergeNote = outcome.mergedIntoExisting ? ' (merged into the existing card)' : '';
    return {
      summary: `Moved **${character.name}** from Characters to ${bookLabel(outcome.target)}${mergeNote}.`,
      sourceDomain: 'character',
      sourceId: character.id,
      sourceName: character.name,
      target: outcome.target,
      targetId: outcome.targetId,
      targetName: outcome.targetName,
      mergedIntoExisting: outcome.mergedIntoExisting,
    };
  }

  // No location/character source found — if they asked for organization and
  // only the name exists nowhere, suggest creating the group instead.
  if (target === 'organization') {
    throw new Error(
      `I couldn't find "${parsed.entityName}" as a place or person to move. If you want a new group, say “make a group for ${parsed.entityName}”.`,
    );
  }

  throw new Error(
    `I couldn't find "${parsed.entityName}" in Places or Characters to reclassify.`,
  );
}
