import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { biographyGenerationEngine } from './biographyGenerationEngine';
import type { Biography, BiographySpec } from './types';

/**
 * Re-compile a Core Lorebook from current memory — same name, incremented lorebook_version.
 */
export async function recompileCoreLorebook(
  userId: string,
  lorebookName: string
): Promise<{ biography: Biography; biographyId: string; lorebookVersion: number }> {
  const { data: latest, error } = await supabaseAdmin
    .from('biographies')
    .select('*')
    .eq('user_id', userId)
    .eq('lorebook_name', lorebookName)
    .eq('is_core_lorebook', true)
    .order('lorebook_version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !latest) {
    throw new Error('Core Lorebook not found');
  }

  const latestData = latest.biography_data as Biography;
  const spec: BiographySpec = latestData.metadata?.spec ?? {
    scope: 'full_life',
    tone: 'neutral',
    depth: 'detailed',
    audience: 'self',
    version: 'main',
    includeIntrospection: true,
  };

  const nextVersion = (latest.lorebook_version ?? 1) + 1;
  await biographyGenerationEngine.generateBiography(userId, spec);

  const { data: inserted, error: fetchError } = await supabaseAdmin
    .from('biographies')
    .select('id, biography_data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !inserted) {
    throw new Error('Failed to locate recompiled biography');
  }

  const newData = inserted.biography_data as Biography;
  newData.metadata = {
    ...newData.metadata,
    isCoreLorebook: true,
    lorebookName,
    lorebookVersion: nextVersion,
    spec,
  };

  const { error: updateError } = await supabaseAdmin
    .from('biographies')
    .update({
      is_core_lorebook: true,
      lorebook_name: lorebookName,
      lorebook_version: nextVersion,
      base_biography_id: latest.id,
      memory_snapshot_at: new Date().toISOString(),
      biography_data: newData,
    })
    .eq('id', inserted.id)
    .eq('user_id', userId);

  if (updateError) {
    logger.error({ updateError, userId, lorebookName }, 'Failed to mark recompiled biography as core');
    throw new Error('Failed to save recompiled lorebook');
  }

  logger.info({ userId, lorebookName, nextVersion, biographyId: inserted.id }, 'Recompiled core lorebook');

  return {
    biography: newData,
    biographyId: inserted.id,
    lorebookVersion: nextVersion,
  };
}
