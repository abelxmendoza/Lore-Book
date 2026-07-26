/**
 * Shared bidirectional family edge writer — used by tree UI edits, chat kinship
 * inference, surname sync, and chat corrections so every path stays consistent.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

const SYNTHETIC_ID_PREFIXES = ['__', 'name-', 'head-', 'group-'];

export function isSyntheticFamilyNodeId(id: string): boolean {
  return SYNTHETIC_ID_PREFIXES.some((p) => id.startsWith(p));
}

export function normalizeFamilyEdgeType(type: string): string {
  const t = (type ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    mother: 'parent_of',
    father: 'parent_of',
    parent: 'parent_of',
    stepmother: 'step_parent_of',
    stepfather: 'step_parent_of',
    stepmom: 'step_parent_of',
    stepdad: 'step_parent_of',
    step_mom: 'step_parent_of',
    step_dad: 'step_parent_of',
    grandmother: 'grandparent_of',
    grandfather: 'grandparent_of',
    grandma: 'grandparent_of',
    grandpa: 'grandparent_of',
    abuela: 'grandparent_of',
    abuelo: 'grandparent_of',
    grandparent: 'grandparent_of',
    aunt: 'aunt_of',
    tia: 'aunt_of',
    tía: 'aunt_of',
    uncle: 'uncle_of',
    tio: 'uncle_of',
    tío: 'uncle_of',
    cousin: 'cousin_of',
    brother: 'sibling_of',
    sister: 'sibling_of',
    sibling: 'sibling_of',
    stepsibling: 'step_sibling_of',
    half_sibling: 'half_sibling_of',
    child: 'child_of',
    son: 'child_of',
    daughter: 'child_of',
    niece: 'niece_of',
    nephew: 'nephew_of',
    grandchild: 'grandchild_of',
    grandson: 'grandchild_of',
    granddaughter: 'grandchild_of',
    spouse: 'spouse_of',
    husband: 'spouse_of',
    wife: 'spouse_of',
    partner: 'spouse_of',
    in_law: 'in_law_of',
    godmother: 'godparent_of',
    godfather: 'godparent_of',
    godparent: 'godparent_of',
  };
  return aliases[t] ?? t;
}

/** Inverse of a directed family edge type (parent↔child, sibling↔sibling). */
export function inverseFamilyEdgeType(type: string): string | null {
  const t = normalizeFamilyEdgeType(type);
  const map: Record<string, string> = {
    parent_of: 'child_of',
    child_of: 'parent_of',
    step_parent_of: 'step_child_of',
    step_child_of: 'step_parent_of',
    adopted_parent_of: 'adopted_child_of',
    adopted_child_of: 'adopted_parent_of',
    grandparent_of: 'grandchild_of',
    grandchild_of: 'grandparent_of',
    aunt_of: 'niece_of',
    uncle_of: 'nephew_of',
    niece_of: 'aunt_of',
    nephew_of: 'uncle_of',
    sibling_of: 'sibling_of',
    half_sibling_of: 'half_sibling_of',
    step_sibling_of: 'step_sibling_of',
    twin_of: 'twin_of',
    cousin_of: 'cousin_of',
    spouse_of: 'spouse_of',
    in_law_of: 'in_law_of',
    godparent_of: 'godchild_of',
    godchild_of: 'godparent_of',
  };
  return map[t] ?? null;
}

/**
 * Map a kinship label (mother, tía, abuela, …) to the typed edge where
 * `source` IS that kin of `target` (e.g. Mom parent_of You).
 */
export function kinshipStringToEdgeType(kinship: string): string {
  return normalizeFamilyEdgeType(kinship);
}

export function isParentEdgeType(type: string): boolean {
  const t = normalizeFamilyEdgeType(type);
  return (
    t === 'parent_of' ||
    t === 'step_parent_of' ||
    t === 'adopted_parent_of' ||
    t === 'godparent_of' ||
    t === 'grandparent_of'
  );
}

/** Tree editor relation ("parent", "aunt") → edge type for member→anchor. */
export function treeRelationToEdgeType(relation: string): string {
  const r = (relation ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (r === 'related') return 'related_to';
  return normalizeFamilyEdgeType(`${r}_of`.replace(/_of_of$/, '_of'));
}

export type UpsertFamilyEdgeOptions = {
  source?: string;
  metadata?: Record<string, unknown>;
  summary?: string;
  inferenceStatus?: 'asserted' | 'inferred';
  closenessScore?: number;
};

async function upsertFamilyEdgeOnce(
  userId: string,
  sourceId: string,
  targetId: string,
  relationshipType: string,
  options: UpsertFamilyEdgeOptions = {},
): Promise<boolean> {
  const type = normalizeFamilyEdgeType(relationshipType);
  const { error } = await supabaseAdmin.from('character_relationships').upsert(
    {
      user_id: userId,
      source_character_id: sourceId,
      target_character_id: targetId,
      relationship_type: type,
      relationship_category: 'family',
      closeness_score: options.closenessScore ?? 8,
      status: 'active',
      inference_status: options.inferenceStatus ?? 'asserted',
      summary: options.summary ?? null,
      updated_at: new Date().toISOString(),
      metadata: {
        user_asserted: options.inferenceStatus !== 'inferred',
        source: options.source ?? 'family_edge_writer',
        asserted_at: new Date().toISOString(),
        ...(options.metadata ?? {}),
      },
    } as Record<string, unknown>,
    { onConflict: 'user_id,source_character_id,target_character_id,relationship_type' },
  );
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === 'PGRST205' || code === '42P01') return false;
    logger.warn({ error, userId, sourceId, targetId, relationshipType: type }, 'Failed to upsert family edge');
    return false;
  }
  return true;
}

/**
 * Upsert a family edge and its inverse (when known). Convention: source IS the
 * `<kin>` of target for types like parent_of / aunt_of.
 */
export async function upsertBidirectionalFamilyEdge(
  userId: string,
  sourceId: string,
  targetId: string,
  relationshipType: string,
  options: UpsertFamilyEdgeOptions = {},
): Promise<boolean> {
  if (!sourceId || !targetId || sourceId === targetId) return false;
  if (isSyntheticFamilyNodeId(sourceId) || isSyntheticFamilyNodeId(targetId)) return false;

  const type = normalizeFamilyEdgeType(relationshipType);
  const ok = await upsertFamilyEdgeOnce(userId, sourceId, targetId, type, options);
  const inverse = inverseFamilyEdgeType(type);
  if (inverse) {
    await upsertFamilyEdgeOnce(userId, targetId, sourceId, inverse, {
      ...options,
      metadata: { ...(options.metadata ?? {}), inverse_of: type },
    });
  }
  return ok;
}

/**
 * Assert kinship from protagonist's perspective: `kin` is the user's `<kinship>`.
 * Writes typed bidirectional edges and syncs siblings when the kin is a parent.
 */
export async function assertTypedProtagonistKinshipEdge(
  userId: string,
  protagonistId: string,
  kinCharacterId: string,
  kinship: string,
  options: UpsertFamilyEdgeOptions & { messageId?: string } = {},
): Promise<boolean> {
  if (!protagonistId || !kinCharacterId || protagonistId === kinCharacterId) return false;

  const { data: kinRow } = await supabaseAdmin
    .from('characters')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('id', kinCharacterId)
    .maybeSingle();
  const kinMeta = (kinRow?.metadata as Record<string, unknown> | null) ?? null;
  const excludedFlag = kinMeta?.family_excluded;
  if (
    excludedFlag === true ||
    (excludedFlag && typeof excludedFlag === 'object' && (excludedFlag as { value?: unknown }).value === true)
  ) {
    return false;
  }

  const raw = (kinship ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  const edgeType = kinshipStringToEdgeType(kinship);
  const known =
    Boolean(edgeType) &&
    edgeType !== 'family' &&
    (edgeType !== raw || raw.endsWith('_of') || inverseFamilyEdgeType(edgeType) != null);

  const typeToWrite = known ? edgeType : 'related_to';
  const ok = await upsertBidirectionalFamilyEdge(userId, kinCharacterId, protagonistId, typeToWrite, {
    ...options,
    source: options.source ?? 'kinship_inference',
    inferenceStatus: options.inferenceStatus ?? 'inferred',
    metadata: {
      ...(options.metadata ?? {}),
      kinship,
      ...(options.messageId ? { message_id: options.messageId } : {}),
    },
  });

  if (ok && isParentEdgeType(typeToWrite)) {
    await syncSiblingsUnderParent(userId, kinCharacterId);
  }
  return ok;
}

/**
 * Persist a display-ready kinship label (e.g. "Uncle", "Mom") onto a character's
 * metadata whenever chat text resolves a kinship mention for them — so cards can
 * show "Uncle" instead of the generic "Family" archetype. Never overwrites a
 * label the user has manually confirmed.
 */
export async function applyKinshipLabelToCharacter(
  userId: string,
  characterId: string,
  kinship: string,
): Promise<void> {
  const normalized = (kinship ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!normalized || isSyntheticFamilyNodeId(characterId)) return;
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, ' ');

  const { data: row } = await supabaseAdmin
    .from('characters')
    .select('metadata, archetype')
    .eq('user_id', userId)
    .eq('id', characterId)
    .maybeSingle();
  if (!row) return;

  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  if (meta.kinship_source === 'user' || meta.kinship_source === 'user_confirmed') return;
  if (meta.kinship_label === label) return;

  const patch: Record<string, unknown> = {
    metadata: {
      ...meta,
      kinship_role: normalized,
      kinship_label: label,
      relationship_type: 'family',
      kinship_source: meta.kinship_source ?? 'chat_inferred',
    },
    updated_at: new Date().toISOString(),
  };
  if (!row.archetype) patch.archetype = 'family';

  const { error } = await supabaseAdmin.from('characters').update(patch).eq('user_id', userId).eq('id', characterId);
  if (error) {
    logger.warn({ error, userId, characterId, kinship }, 'Failed to apply kinship label to character');
  }
}

/** Materialize sibling_of between every pair of children under the same parent. */
export async function syncSiblingsUnderParent(userId: string, parentId: string): Promise<number> {
  if (!parentId || isSyntheticFamilyNodeId(parentId)) return 0;
  const childIds = new Set<string>();

  const { data: parentEdges } = await supabaseAdmin
    .from('character_relationships')
    .select('target_character_id, relationship_type')
    .eq('user_id', userId)
    .eq('source_character_id', parentId)
    .in('relationship_type', ['parent_of', 'step_parent_of', 'adopted_parent_of', 'godparent_of']);
  for (const row of parentEdges ?? []) {
    if (row.target_character_id) childIds.add(row.target_character_id as string);
  }

  const { data: peers } = await supabaseAdmin
    .from('characters')
    .select('id, metadata')
    .eq('user_id', userId)
    .limit(400);
  for (const peer of peers ?? []) {
    const ov = (peer.metadata as Record<string, unknown> | null)?.family_override as
      | { connects_to_id?: string | null }
      | undefined;
    if (ov?.connects_to_id === parentId) childIds.add(peer.id as string);
  }

  const kids = [...childIds].filter((id) => id && id !== parentId && !isSyntheticFamilyNodeId(id));
  let wrote = 0;
  for (let i = 0; i < kids.length; i++) {
    for (let j = i + 1; j < kids.length; j++) {
      const ok = await upsertBidirectionalFamilyEdge(userId, kids[i], kids[j], 'sibling_of', {
        source: 'shared_parent_sibling_sync',
        inferenceStatus: 'inferred',
        metadata: { shared_parent_id: parentId },
      });
      if (ok) wrote++;
    }
  }
  return wrote;
}

/** Editor relation allow-list generation deltas (member is my <relation>). */
export const TREE_RELATION_GENERATION: Record<string, number> = {
  parent: -1,
  step_parent: -1,
  adopted_parent: -1,
  godparent: -1,
  grandparent: -2,
  child: 1,
  step_child: 1,
  adopted_child: 1,
  godchild: 1,
  grandchild: 2,
  sibling: 0,
  twin: 0,
  half_sibling: 0,
  step_sibling: 0,
  aunt: -1,
  uncle: -1,
  niece: 1,
  nephew: 1,
  cousin: 0,
  spouse: 0,
  in_law: 0,
  related: 0,
};

export function normalizeTreeRelation(relation: string): string | null {
  const r = (relation ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!(r in TREE_RELATION_GENERATION)) return null;
  return r;
}

/** Map a kinship label (mother, aunt, abuela…) onto a tree-editor relation. */
export function kinshipStringToTreeRelation(kinship: string): string | null {
  const t = (kinship ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  const map: Record<string, string> = {
    mother: 'parent',
    father: 'parent',
    mom: 'parent',
    dad: 'parent',
    parent: 'parent',
    stepmother: 'step_parent',
    stepfather: 'step_parent',
    stepmom: 'step_parent',
    stepdad: 'step_parent',
    step_parent: 'step_parent',
    grandmother: 'grandparent',
    grandfather: 'grandparent',
    grandma: 'grandparent',
    grandpa: 'grandparent',
    abuela: 'grandparent',
    abuelo: 'grandparent',
    grandparent: 'grandparent',
    aunt: 'aunt',
    tia: 'aunt',
    tía: 'aunt',
    uncle: 'uncle',
    tio: 'uncle',
    tío: 'uncle',
    cousin: 'cousin',
    brother: 'sibling',
    sister: 'sibling',
    sibling: 'sibling',
    stepsibling: 'step_sibling',
    step_sibling: 'step_sibling',
    half_sibling: 'half_sibling',
    child: 'child',
    son: 'child',
    daughter: 'child',
    niece: 'niece',
    nephew: 'nephew',
    grandchild: 'grandchild',
    spouse: 'spouse',
    husband: 'spouse',
    wife: 'spouse',
    partner: 'spouse',
    in_law: 'in_law',
    godmother: 'godparent',
    godfather: 'godparent',
    godparent: 'godparent',
  };
  const mapped = map[t] ?? t;
  return normalizeTreeRelation(mapped);
}
