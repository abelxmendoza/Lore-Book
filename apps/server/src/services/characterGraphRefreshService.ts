/**
 * Rebuild identity + authority links after merge, archive, delete, or restore.
 */

import { logger } from '../logger';
import { characterAuthorityService } from './characterAuthorityService';
import { characterIdentityIndexService } from './characterIdentityIndexService';
import { supabaseAdmin } from './supabaseClient';

export async function refreshCharacterGraphAfterConsolidation(
  userId: string,
  opts?: { focusCharacterId?: string }
): Promise<void> {
  try {
    if (opts?.focusCharacterId) {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('id, name, alias')
        .eq('user_id', userId)
        .eq('id', opts.focusCharacterId)
        .maybeSingle();
      if (data) {
        await characterAuthorityService.registerCharacterAuthority(
          userId,
          data.id,
          data.name,
          (data.alias as string[] | null) ?? []
        );
      }
    }
    await characterIdentityIndexService.rebuild(userId);
    await characterAuthorityService.seedAuthorityLinks(userId);
  } catch (err) {
    logger.warn({ err, userId, focusCharacterId: opts?.focusCharacterId }, 'Character graph refresh after consolidation failed');
  }
}
