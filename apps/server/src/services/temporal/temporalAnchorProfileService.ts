/**
 * Temporal anchor profile — per-user birth year for life-stage/age resolution.
 *
 * Stored on the self character's `metadata.birth_year` (no schema change; the self
 * row is the existing home for user identity facts — see selfCharacterService /
 * entityAttributeDetector.ensureUserCharacter). Read by the ingestion temporal
 * pass to turn "when I was 19" / "in high school" into absolute calendar windows.
 *
 * Reads are cached per user (life-stage resolution runs per extracted unit, so a
 * naive read would hit the DB many times per message). Writes only upgrade the
 * stored value when a strictly more confident signal arrives ("born in 1995" beats
 * a derived "I'm 28").
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { extractBirthYearFromText, type TemporalAnchorProfile } from '../../utils/lifeStageResolver';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { profile: TemporalAnchorProfile; at: number }>();

class TemporalAnchorProfileService {
  /** Resolve the user's temporal anchor profile (cached). Empty when unknown. */
  async getProfile(userId: string): Promise<TemporalAnchorProfile> {
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.profile;
    const profile = await this.loadProfile(userId);
    cache.set(userId, { profile, at: Date.now() });
    return profile;
  }

  private async loadProfile(userId: string): Promise<TemporalAnchorProfile> {
    try {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('metadata')
        .eq('user_id', userId)
        .or('metadata->>is_self.eq.true,metadata->>is_user.eq.true')
        .limit(1)
        .maybeSingle();
      const meta = (data?.metadata ?? {}) as Record<string, unknown>;
      const birthYear = typeof meta.birth_year === 'number' ? meta.birth_year : undefined;
      return birthYear ? { birthYear } : {};
    } catch (err) {
      logger.debug({ err, userId }, 'temporalAnchorProfile load failed');
      return {};
    }
  }

  /**
   * Capture a birth year from a user message and persist it to the self character,
   * if the text states one. Cheap when absent (regex only — no DB). Idempotent and
   * confidence-gated, so re-stating the same age never downgrades a precise value.
   */
  async captureFromText(userId: string, text: string): Promise<void> {
    const extracted = extractBirthYearFromText(text);
    if (!extracted) return;

    try {
      const { entityAttributeDetector } = await import('../conversationCentered/entityAttributeDetector');
      const self = await entityAttributeDetector.ensureUserCharacter(userId);
      if (!self) return;

      const { data: row } = await supabaseAdmin
        .from('characters')
        .select('metadata')
        .eq('id', self.id)
        .eq('user_id', userId)
        .maybeSingle();

      const meta = (row?.metadata ?? {}) as Record<string, unknown>;
      const existingConf =
        typeof meta.birth_year_confidence === 'number' ? meta.birth_year_confidence : 0;
      // Keep the most confident signal; never overwrite a stronger one.
      if (typeof meta.birth_year === 'number' && existingConf >= extracted.confidence) return;

      const newMeta = {
        ...meta,
        birth_year: extracted.birthYear,
        birth_year_confidence: extracted.confidence,
        birth_year_source: extracted.source,
      };

      await supabaseAdmin
        .from('characters')
        .update({ metadata: newMeta, updated_at: new Date().toISOString() })
        .eq('id', self.id)
        .eq('user_id', userId);

      cache.set(userId, { profile: { birthYear: extracted.birthYear }, at: Date.now() });
      logger.debug(
        { userId, birthYear: extracted.birthYear, source: extracted.source },
        'temporalAnchorProfile.birthYear captured',
      );
    } catch (err) {
      logger.debug({ err, userId }, 'temporalAnchorProfile capture failed');
    }
  }

  /** Test/maintenance hook — drop cached profiles. */
  clearCache(): void {
    cache.clear();
  }
}

export const temporalAnchorProfileService = new TemporalAnchorProfileService();
