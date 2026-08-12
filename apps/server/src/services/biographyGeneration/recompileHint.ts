import { supabaseAdmin } from '../supabaseClient';
import { loadAllAtoms, filterAtoms } from '../loreReadiness/atomIndexService';
import type { BiographySpec } from './types';

export type RecompileHint = {
  available: boolean;
  nextVersion: number;
  newAtoms: number;
};

/**
 * Compares the atom count captured when a core lorebook was last compiled
 * against the current count for the same spec, so the library can show how
 * much new content has accumulated since that edition and offer to refresh it.
 */
export async function getRecompileHint(userId: string, lorebookName: string): Promise<RecompileHint | null> {
  const { data: latest, error } = await supabaseAdmin
    .from('biographies')
    .select('id, lorebook_version, biography_data')
    .eq('user_id', userId)
    .eq('lorebook_name', lorebookName)
    .eq('is_core_lorebook', true)
    .order('lorebook_version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !latest) return null;

  const biographyData = latest.biography_data as { metadata?: { atomCount?: number; spec?: BiographySpec } };
  const priorAtomCount = biographyData?.metadata?.atomCount ?? 0;
  const spec: BiographySpec = biographyData?.metadata?.spec ?? {
    scope: 'full_life',
    tone: 'neutral',
    depth: 'detailed',
    audience: 'self',
    version: 'main',
    includeIntrospection: true,
  };

  const atoms = await loadAllAtoms(userId);
  const currentAtomCount = filterAtoms(atoms, spec).length;
  const newAtoms = currentAtomCount - priorAtomCount;

  if (newAtoms <= 0) return null;

  return {
    available: true,
    nextVersion: (latest.lorebook_version ?? 1) + 1,
    newAtoms,
  };
}
