/**
 * Soft-fill sex for family characters from kinship titles / edge kinship.
 */
import { supabaseAdmin } from '../supabaseClient';
import { applyKinshipSexInference } from './applyKinshipSexInference';
import { parseKinshipFromName } from './kinshipGlossary';

export async function reconcileKinshipSexForUser(userId: string): Promise<number> {
  let updated = 0;
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata')
    .eq('user_id', userId)
    .limit(400);
  if (!chars?.length) return 0;

  for (const row of chars) {
    const parsed = parseKinshipFromName(row.name as string);
    const override = (row.metadata as Record<string, unknown> | null)?.family_override as
      | { relation?: string }
      | undefined;
    const kinship =
      parsed?.role
        ? undefined
        : (override?.relation as string | undefined) ??
          ((row.metadata as Record<string, unknown> | null)?.kinship_role as string | undefined);

    const changed = await applyKinshipSexInference(userId, row.id as string, {
      role: parsed?.role ?? null,
      phrase: parsed?.sourcePhrase ?? (row.name as string),
      kinship: kinship ?? (parsed ? undefined : null),
    });
    if (changed) updated++;
  }

  // Edge kinship (mother/father) describes the OTHER person relative to self —
  // never write that sex onto the protagonist.
  const selfId = chars.find((c) => (c.metadata as Record<string, unknown> | null)?.is_self === true)?.id as
    | string
    | undefined;
  const { data: edges } = await supabaseAdmin
    .from('character_relationships')
    .select('source_character_id, target_character_id, metadata')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(500);

  for (const edge of edges ?? []) {
    const kin = String((edge.metadata as Record<string, unknown> | null)?.kinship ?? '').toLowerCase();
    if (!kin || kin === 'related' || kin === 'cousin' || kin === 'sibling' || kin === 'spouse') continue;
    const endpoints = [edge.source_character_id, edge.target_character_id].filter(Boolean) as string[];
    const targetIds =
      selfId && endpoints.includes(selfId)
        ? endpoints.filter((id) => id !== selfId)
        : endpoints;
    for (const id of targetIds) {
      const changed = await applyKinshipSexInference(userId, id, { kinship: kin, phrase: kin });
      if (changed) updated++;
    }
  }

  return updated;
}
