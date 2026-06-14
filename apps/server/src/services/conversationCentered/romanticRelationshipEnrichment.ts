import { supabaseAdmin } from '../supabaseClient';
import { isIndividualPersonName } from '../../utils/personNameValidation';

type RomanticRelationshipRow = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  metadata?: Record<string, unknown> | null;
  partner_name?: string | null;
  person_name?: string | null;
  [key: string]: unknown;
};

function metadataPartnerName(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const raw = metadata.partner_name ?? metadata.person_name;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * Resolve partner display names in batch and drop relationships that cannot be
 * tied to a real, named person.
 */
export async function enrichRomanticRelationshipsForUser(
  userId: string,
  relationships: RomanticRelationshipRow[]
): Promise<RomanticRelationshipRow[]> {
  if (relationships.length === 0) return [];

  const characterIds = [
    ...new Set(
      relationships.filter((r) => r.person_type === 'character').map((r) => r.person_id)
    ),
  ];
  const entityIds = [
    ...new Set(
      relationships.filter((r) => r.person_type === 'omega_entity').map((r) => r.person_id)
    ),
  ];

  const [charactersResult, entitiesResult] = await Promise.all([
    characterIds.length > 0
      ? supabaseAdmin
          .from('characters')
          .select('id, name')
          .eq('user_id', userId)
          .in('id', characterIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    entityIds.length > 0
      ? supabaseAdmin
          .from('omega_entities')
          .select('id, primary_name')
          .eq('user_id', userId)
          .in('id', entityIds)
      : Promise.resolve({ data: [] as { id: string; primary_name: string }[] }),
  ]);

  const nameByPersonId = new Map<string, string>();
  for (const row of charactersResult.data ?? []) {
    if (row.name?.trim()) nameByPersonId.set(row.id, row.name.trim());
  }
  for (const row of entitiesResult.data ?? []) {
    if (row.primary_name?.trim()) nameByPersonId.set(row.id, row.primary_name.trim());
  }

  return relationships
    .map((rel) => {
      const fromPerson =
        nameByPersonId.get(rel.person_id) ??
        (typeof rel.partner_name === 'string' ? rel.partner_name : null) ??
        metadataPartnerName(rel.metadata as Record<string, unknown> | null);

      return {
        ...rel,
        person_name: fromPerson,
      };
    })
    .filter((rel) => isIndividualPersonName(rel.person_name));
}
