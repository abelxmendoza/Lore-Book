/**
 * Move "Person the Epithet" out of characters.name into alias +
 * metadata.epithet / contextual_title. Idempotent — safe on every detail fetch.
 */

import { logger } from '../../logger';
import { splitPersonName, normalizeNameKey } from '../../utils/nameNormalization';
import {
  composeDisplayNameWithEpithet,
  isThemeShapedEpithet,
  splitPersonNameEpithet,
} from '../../utils/personNameEpithet';
import { supabaseAdmin } from '../supabaseClient';

export type EpithetPrimaryNameRepair = {
  repaired: boolean;
  name: string;
  epithet?: string;
};

export function planEpithetPrimaryNameRepair(row: {
  name: string;
  alias?: string[] | null;
  metadata?: Record<string, unknown> | null;
}): {
  needsRepair: boolean;
  name: string;
  alias: string[];
  metadata: Record<string, unknown>;
  epithet: string | null;
} {
  const { baseName, epithet } = splitPersonNameEpithet(row.name ?? '');
  const metadata = { ...(row.metadata ?? {}) };
  const alias = [...(row.alias ?? [])].filter(Boolean);

  if (!epithet || !baseName || normalizeNameKey(baseName) === normalizeNameKey(row.name)) {
    return { needsRepair: false, name: row.name, alias, metadata, epithet: null };
  }

  const fullForm = `${baseName} the ${epithet}`;
  for (const extra of [epithet, fullForm, row.name]) {
    if (extra && !alias.some((a) => normalizeNameKey(a) === normalizeNameKey(extra))) {
      alias.push(extra);
    }
  }
  metadata.epithet = epithet;
  if (typeof metadata.contextual_title !== 'string' || !metadata.contextual_title.trim()) {
    metadata.contextual_title = epithet;
  }
  if (!metadata.epithet_evidence) {
    metadata.epithet_evidence = {
      source: 'primary_name_repair',
      quotes: [],
      confidence: 0.9,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    needsRepair: true,
    name: baseName,
    alias,
    metadata,
    epithet,
  };
}

/**
 * The protagonist card is an identity surface. Unpinned story epithets and
 * composed "Name the Epithet" aliases should not occupy the name line.
 */
export function planSelfIdentityPresentationCleanup(row: {
  name: string;
  alias?: string[] | null;
  metadata?: Record<string, unknown> | null;
}): {
  needsRepair: boolean;
  alias: string[];
  metadata: Record<string, unknown>;
} {
  const metadata = { ...(row.metadata ?? {}) };
  const alias = [...(row.alias ?? [])].filter(Boolean);
  const pinned = metadata.epithet_pinned === true;
  const epithet =
    (typeof metadata.epithet === 'string' && metadata.epithet) ||
    (typeof metadata.contextual_title === 'string' && metadata.contextual_title) ||
    null;
  const composed = epithet
    ? composeDisplayNameWithEpithet(row.name, epithet)
    : null;

  const nextAlias = alias.filter((value) => {
    const key = normalizeNameKey(value);
    if (composed && key === normalizeNameKey(composed)) return false;
    if (epithet && !pinned && key === normalizeNameKey(epithet)) return false;
    if (isThemeShapedEpithet(value)) return false;
    return true;
  });

  let changed = nextAlias.length !== alias.length;
  if (!pinned && epithet && metadata.epithet_disabled !== true) {
    metadata.epithet_disabled = true;
    changed = true;
  }

  return { needsRepair: changed, alias: nextAlias, metadata };
}

/** Persist epithet→alias repair when the primary name still carries "the …". */
export async function repairEpithetPrimaryNameIfNeeded(
  userId: string,
  characterId: string,
  row: {
    name: string;
    alias?: string[] | null;
    metadata?: Record<string, unknown> | null;
    first_name?: string | null;
    last_name?: string | null;
  },
): Promise<EpithetPrimaryNameRepair> {
  const plan = planEpithetPrimaryNameRepair(row);
  if (!plan.needsRepair) {
    return { repaired: false, name: row.name };
  }

  const parsed = splitPersonName(plan.name);
  const { error } = await supabaseAdmin
    .from('characters')
    .update({
      name: plan.name,
      first_name: row.first_name || parsed.firstName || null,
      last_name: row.last_name || parsed.lastName || null,
      alias: plan.alias.length ? plan.alias : null,
      metadata: plan.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', characterId)
    .eq('user_id', userId);

  if (error) {
    logger.warn({ err: error, characterId }, 'epithet primary-name repair failed');
    return { repaired: false, name: row.name };
  }

  logger.info(
    { characterId, from: row.name, to: plan.name, epithet: plan.epithet },
    'Repaired epithet baked into character primary name',
  );
  return { repaired: true, name: plan.name, epithet: plan.epithet ?? undefined };
}

export async function repairSelfIdentityPresentationIfNeeded(
  userId: string,
  characterId: string,
  row: {
    name: string;
    alias?: string[] | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<{ repaired: boolean }> {
  const plan = planSelfIdentityPresentationCleanup(row);
  if (!plan.needsRepair) return { repaired: false };

  const { error } = await supabaseAdmin
    .from('characters')
    .update({
      alias: plan.alias.length ? plan.alias : null,
      metadata: plan.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', characterId)
    .eq('user_id', userId);

  if (error) {
    logger.warn({ err: error, characterId }, 'self identity presentation cleanup failed');
    return { repaired: false };
  }
  return { repaired: true };
}
