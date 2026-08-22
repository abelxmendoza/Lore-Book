/**
 * Bridges the omega entity graph into the Places book. Entities routed to
 * `omega_entities` (misclassifiedEntityRouter, characterFoundationService)
 * as type LOCATION never had a path into `locations` — so a venue with real
 * evidence behind it (e.g. "Bad Dogg Compound") could sit invisibly in the
 * omega graph indefinitely, never surfacing on the Places Book.
 *
 * Unlike organizations, Places has no separate accept/reject review queue —
 * real locations are created directly, gated by quality checks at creation
 * time. This reuses that exact same creation path (locationSuggestionService
 * .acceptSuggestion, which runs the full placeCognitionEngine gate) rather
 * than inventing a parallel review system, so a promoted entity is held to
 * the identical bar as every other Place.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { locationSuggestionService } from '../locationSuggestionService';

const GENERIC_NAME_PREFIX = /^(the|my|our|this|that|these|those|current|anonymous|two|a|an)\b/i;

function looksLikePlaceName(name: string): boolean {
  const trimmed = name.trim();
  if (!/^[A-ZÀ-Ý0-9]/.test(trimmed)) return false;
  if (GENERIC_NAME_PREFIX.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 6) return false;
  return true;
}

export interface OmegaLocationPromotionResult {
  promoted: number;
  skippedAsExisting: number;
  skippedAsLowSignal: number;
  skippedByQualityGate: number;
  locationIds: string[];
}

class OmegaLocationPromotionService {
  async promoteEntity(
    userId: string,
    omegaEntity: { id: string; primary_name: string; mention_count?: number | null },
  ): Promise<string | null> {
    const name = omegaEntity.primary_name?.trim();
    if (!name) return null;
    const key = normalizeNameKey(name);

    const { data: locations } = await supabaseAdmin
      .from('locations')
      .select('name, aliases')
      .eq('user_id', userId);
    const existsAsLocation = (locations ?? []).some((l) => {
      if (normalizeNameKey(String(l.name ?? '')) === key) return true;
      return ((l.aliases as string[] | null) ?? []).some((a) => normalizeNameKey(a) === key);
    });
    if (existsAsLocation) return null;

    try {
      const created = await locationSuggestionService.acceptSuggestion(userId, {
        name,
        context: 'Promoted from omega entity graph (group/organization integrity audit)',
      });
      await supabaseAdmin
        .from('omega_entities')
        .update({ metadata: { promoted_to_location_id: created.id }, updated_at: new Date().toISOString() })
        .eq('id', omegaEntity.id)
        .eq('user_id', userId);
      return created.id;
    } catch (err) {
      // Quality gate rejected it (generic, synthetic narration, event-shaped,
      // etc.) — not a bug, just not a real place. Leave it in omega_entities.
      logger.debug({ err, userId, name }, 'omegaLocationPromotion: creation rejected by quality gate');
      return null;
    }
  }

  async backfillForUser(userId: string, minMentionCount = 2): Promise<OmegaLocationPromotionResult> {
    const result: OmegaLocationPromotionResult = {
      promoted: 0,
      skippedAsExisting: 0,
      skippedAsLowSignal: 0,
      skippedByQualityGate: 0,
      locationIds: [],
    };

    const { data: entities, error } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name, mention_count, metadata')
      .eq('user_id', userId)
      .eq('type', 'LOCATION');
    if (error || !entities) return result;

    for (const entity of entities) {
      if ((entity.metadata as Record<string, unknown> | null)?.promoted_to_location_id) {
        result.skippedAsExisting++;
        continue;
      }
      const name = (entity.primary_name as string | null)?.trim();
      if (!name) continue;
      const mentionCount = (entity.mention_count as number | null) ?? 0;
      if (mentionCount < minMentionCount || !looksLikePlaceName(name)) {
        result.skippedAsLowSignal++;
        continue;
      }
      const locationId = await this.promoteEntity(userId, entity as { id: string; primary_name: string; mention_count?: number | null });
      if (locationId) {
        result.promoted++;
        result.locationIds.push(locationId);
      } else {
        result.skippedByQualityGate++;
      }
    }

    logger.info({ userId, ...result, locationIds: undefined }, 'omegaLocationPromotion: backfill complete');
    return result;
  }
}

export const omegaLocationPromotionService = new OmegaLocationPromotionService();
