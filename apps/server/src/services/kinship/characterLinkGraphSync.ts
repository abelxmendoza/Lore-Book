/**
 * When Character Info or People in their world saves a link, keep the family
 * graph and Relationship to you in sync both ways so users do not re-enter
 * the same fact on the other card.
 */
import { supabaseAdmin } from '../supabaseClient';
import {
  applyKinshipLabelToCharacter,
  inverseFamilyEdgeType,
  kinshipStringToEdgeType,
  kinshipStringToTreeRelation,
  normalizeFamilyEdgeType,
  upsertBidirectionalFamilyEdge,
} from './familyEdgeWriter';
import {
  composeKinshipViaYou,
  inverseSurfaceRelationshipType,
  isSelfCharacterMetadata,
} from '../relationships/relatedPersonType';

export async function syncCharacterLinkGraph(input: {
  userId: string;
  fromCharacterId: string;
  toCharacterId: string;
  surfaceType: string;
  status?: string;
}): Promise<void> {
  const { userId, fromCharacterId, toCharacterId, surfaceType } = input;
  const edge = normalizeFamilyEdgeType(surfaceType);
  const inverse = inverseFamilyEdgeType(edge);
  const isKin = Boolean(inverse) && edge.endsWith('_of') && edge !== 'related_to';

  if (isKin) {
    // Editor meaning: `to` is `from`'s [surfaceType] → `to` IS that kin of `from`.
    await upsertBidirectionalFamilyEdge(userId, toCharacterId, fromCharacterId, edge, {
      source: 'character_world_editor',
      inferenceStatus: 'asserted',
      summary: null,
    });
    await syncRelationshipToYouForPair(userId, fromCharacterId, toCharacterId, surfaceType);
    return;
  }

  await ensureReverseSameType(userId, fromCharacterId, toCharacterId, surfaceType, input.status);
}

async function ensureReverseSameType(
  userId: string,
  fromId: string,
  toId: string,
  type: string,
  status?: string,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('character_relationships')
    .select('id')
    .eq('user_id', userId)
    .eq('source_character_id', toId)
    .eq('target_character_id', fromId)
    .eq('relationship_type', type)
    .maybeSingle();
  if (existing?.id) return;

  await supabaseAdmin.from('character_relationships').insert({
    user_id: userId,
    source_character_id: toId,
    target_character_id: fromId,
    relationship_type: type,
    status: status ?? 'active',
    inference_status: 'asserted',
    metadata: {
      source: 'character_world_editor',
      inverse_of: type,
      user_confirmed_at: new Date().toISOString(),
    },
  });
}

async function syncRelationshipToYouForPair(
  userId: string,
  fromId: string,
  toId: string,
  surfaceType: string,
): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata')
    .eq('user_id', userId)
    .in('id', [fromId, toId]);

  const from = rows?.find((row) => row.id === fromId);
  const to = rows?.find((row) => row.id === toId);
  if (!from || !to) return;

  const fromIsSelf = isSelfCharacterMetadata(
    (from.metadata as Record<string, unknown> | null) ?? null,
    from.name,
  );
  const toIsSelf = isSelfCharacterMetadata(
    (to.metadata as Record<string, unknown> | null) ?? null,
    to.name,
  );

  if (fromIsSelf && !toIsSelf) {
    await applyKinshipLabelToCharacter(userId, toId, surfaceType, {
      characterName: to.name,
      explicitClaim: true,
    });
    await syncComposedFamilyViaYou(userId, toId);
  } else if (toIsSelf && !fromIsSelf) {
    const inverse = inverseSurfaceRelationshipType(surfaceType);
    if (inverse) {
      await applyKinshipLabelToCharacter(userId, fromId, inverse, {
        characterName: from.name,
        explicitClaim: true,
      });
      await syncComposedFamilyViaYou(userId, fromId);
    }
  }
}

async function syncComposedFamilyViaYou(userId: string, characterId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from('characters')
    .select('id, metadata')
    .eq('user_id', userId)
    .limit(400);

  const kin = (rows ?? [])
    .map((row) => {
      const meta = (row.metadata as Record<string, unknown> | null) ?? {};
      const toYou = typeof meta.relationship_to_user === 'string' ? meta.relationship_to_user : '';
      return { id: row.id as string, toYou };
    })
    .filter((row) => Boolean(kinshipStringToTreeRelation(row.toYou)));

  const focus = kin.find((row) => row.id === characterId);
  if (!focus) return;

  for (const other of kin) {
    if (other.id === focus.id) continue;
    const composed = composeKinshipViaYou(focus.toYou, other.toYou);
    if (!composed) continue;
    const edge = kinshipStringToEdgeType(composed);
    if (!inverseFamilyEdgeType(edge) || edge === 'related_to') continue;
    await upsertBidirectionalFamilyEdge(userId, other.id, focus.id, edge, {
      source: 'composed_via_you',
      inferenceStatus: 'inferred',
    });
  }
}
