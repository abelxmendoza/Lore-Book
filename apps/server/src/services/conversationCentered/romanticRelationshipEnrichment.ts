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

type CharacterIdentityRow = {
  id: string;
  name: string;
  metadata?: Record<string, unknown> | null;
};

type SexValue = 'male' | 'female' | 'nonbinary' | 'unknown';
type OrientationValue = 'gay' | 'lesbian' | 'bisexual' | 'heterosexual' | 'queer' | 'unknown';

function metadataPartnerName(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  const raw = metadata.partner_name ?? metadata.person_name;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function explicitMetaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = meta?.[key];
  if (typeof value !== 'string' || !value.trim()) return null;
  const source = meta?.[`${key}_source`];
  if (source === 'explicit' || source === 'user_confirmed') return value.trim().toLowerCase();
  return null;
}

function eligiblePartnerSexes(userSex: SexValue | null, orientation: OrientationValue | null): Set<SexValue> | null {
  if (!userSex || !orientation || userSex === 'unknown' || orientation === 'unknown' || userSex === 'nonbinary') {
    return null;
  }
  if (orientation === 'bisexual' || orientation === 'queer') return new Set(['male', 'female', 'nonbinary']);
  if (orientation === 'gay' || orientation === 'lesbian') return new Set([userSex]);
  if (orientation === 'heterosexual') return new Set(userSex === 'male' ? ['female'] : ['male']);
  return null;
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
          .select('id, name, metadata')
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
  const characterById = new Map<string, CharacterIdentityRow>();
  for (const row of (charactersResult.data ?? []) as CharacterIdentityRow[]) {
    if (row.name?.trim()) nameByPersonId.set(row.id, row.name.trim());
    characterById.set(row.id, row);
  }
  for (const row of entitiesResult.data ?? []) {
    if (row.primary_name?.trim()) nameByPersonId.set(row.id, row.primary_name.trim());
  }

  const { data: selfRows } = await supabaseAdmin
    .from('characters')
    .select('id, metadata')
    .eq('user_id', userId)
    .limit(200);
  const selfRow = (selfRows ?? []).find((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return meta.is_self === true || meta.is_user === true;
  });
  const selfMeta = ((selfRow?.metadata ?? {}) as Record<string, unknown>) || {};
  const userSex = explicitMetaString(selfMeta, 'sex') as SexValue | null;
  const userOrientation = explicitMetaString(selfMeta, 'sexual_orientation') as OrientationValue | null;
  const eligibleSexes = eligiblePartnerSexes(userSex, userOrientation);

  return relationships
    .map((rel) => {
      const fromPerson =
        nameByPersonId.get(rel.person_id) ??
        (typeof rel.partner_name === 'string' ? rel.partner_name : null) ??
        metadataPartnerName(rel.metadata as Record<string, unknown> | null);
      const character = rel.person_type === 'character' ? characterById.get(rel.person_id) : undefined;
      const partnerSex = explicitMetaString(character?.metadata, 'sex') as SexValue | null;
      const orientationReviewed = eligibleSexes != null && partnerSex != null;
      const orientationEligible =
        !eligibleSexes || !partnerSex || partnerSex === 'unknown' || eligibleSexes.has(partnerSex);

      return {
        ...rel,
        person_name: fromPerson,
        character_id: rel.person_type === 'character' ? rel.person_id : null,
        character_sex: partnerSex,
        user_romantic_filter: {
          user_sex: userSex,
          user_orientation: userOrientation,
          partner_sex: partnerSex,
          reviewed: orientationReviewed,
          eligible: orientationEligible,
          note: !eligibleSexes
            ? 'Set your confirmed sex and orientation to filter Dating & Romance.'
            : !partnerSex
              ? 'Partner sex is unknown or unconfirmed; kept visible for review.'
              : orientationEligible
                ? 'Visible under your confirmed romantic-interest profile.'
                : 'Filtered by your confirmed romantic-interest profile.',
        },
      };
    })
    .filter((rel) => isIndividualPersonName(rel.person_name))
    .filter((rel) => {
      const filter = rel.user_romantic_filter as { eligible?: boolean } | undefined;
      return filter?.eligible !== false;
    });
}
