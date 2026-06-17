/**
 * Inference Orchestrator — unified T1/T2 lore materialization pipeline.
 *
 * T1 (debounced ~30min): graph recovery, place/org normalize, public figures,
 *   social standing, character importance.
 * T2 (session / manual / stale): adds full character rescan + relationship classify.
 */
import { logger } from '../../logger';
import { invalidateStoryEvidenceCache } from './evidenceService';
import {
  clearPendingReasons,
  getInferenceState,
  noteInferenceActivity,
  saveInferenceState,
} from './inferenceStateService';
import type {
  DomainRunResult,
  InferenceDomain,
  InferenceSyncReport,
  InferenceTier,
} from './inferenceTypes';
import { ALL_DOMAINS, T1_DOMAIN_ORDER } from './inferenceTypes';

const DEBOUNCE_MS = Number(process.env.INFERENCE_DEBOUNCE_MS ?? 15_000);
const T1_MIN_INTERVAL_MS = Number(process.env.INFERENCE_T1_MIN_INTERVAL_MS ?? 30 * 60_000);
const T2_MIN_INTERVAL_MS = Number(process.env.INFERENCE_T2_MIN_INTERVAL_MS ?? 24 * 60 * 60_000);
const LIVE_ENABLED = process.env.INFERENCE_LIVE !== '0';

type UserSchedule = {
  timer: NodeJS.Timeout | null;
  inFlight: boolean;
  pending: number;
};

class InferenceOrchestrator {
  private schedules = new Map<string, UserSchedule>();
  private lastReport = new Map<string, InferenceSyncReport>();

  /** Live entry — call after chat ingest or journal save. */
  schedule(userId: string, reason: string): void {
    if (!LIVE_ENABLED || !userId) return;
    void noteInferenceActivity(userId, reason).catch((err) =>
      logger.debug({ err, userId }, 'inference: note activity failed')
    );

    let s = this.schedules.get(userId);
    if (!s) {
      s = { timer: null, inFlight: false, pending: 0 };
      this.schedules.set(userId, s);
    }
    s.pending += 1;
    if (s.timer) return;

    s.timer = setTimeout(() => void this.onTimer(userId), DEBOUNCE_MS);
    if (typeof s.timer.unref === 'function') s.timer.unref();
  }

  private async onTimer(userId: string): Promise<void> {
    const s = this.schedules.get(userId);
    if (!s) return;
    s.timer = null;
    if (s.pending === 0 || s.inFlight) return;

    const state = await getInferenceState(userId);
    const sinceT1 = state.last_t1_run_at ? Date.now() - new Date(state.last_t1_run_at).getTime() : Infinity;
    if (sinceT1 < T1_MIN_INTERVAL_MS) {
      const wait = T1_MIN_INTERVAL_MS - sinceT1;
      s.timer = setTimeout(() => void this.onTimer(userId), wait);
      if (typeof s.timer.unref === 'function') s.timer.unref();
      return;
    }

    try {
      await this.sync(userId, { tier: 't1' });
    } catch (err) {
      logger.warn({ err, userId }, 'inference: scheduled T1 failed');
    }
  }

  async sync(
    userId: string,
    opts: { tier?: InferenceTier; domains?: InferenceDomain[]; force?: boolean } = {}
  ): Promise<InferenceSyncReport> {
    const tier = opts.tier ?? 't1';
    const force = opts.force === true;
    const state = await getInferenceState(userId);

    if (!force) {
      const lastRun = tier === 't2' ? state.last_t2_run_at : state.last_t1_run_at;
      const minInterval = tier === 't2' ? T2_MIN_INTERVAL_MS : T1_MIN_INTERVAL_MS;
      if (lastRun && Date.now() - new Date(lastRun).getTime() < minInterval) {
        const cached = this.lastReport.get(userId);
        if (cached) return cached;
      }
    }

    let schedule = this.schedules.get(userId);
    if (!schedule) {
      schedule = { timer: null, inFlight: false, pending: 0 };
      this.schedules.set(userId, schedule);
    }
    if (schedule.inFlight) {
      const cached = this.lastReport.get(userId);
      if (cached) return cached;
    }
    schedule.inFlight = true;
    schedule.pending = 0;

    const started = Date.now();
    const targetDomains = opts.domains?.length
      ? opts.domains
      : tier === 't2'
        ? ALL_DOMAINS
        : T1_DOMAIN_ORDER;

    const results: DomainRunResult[] = [];
    const ran: InferenceDomain[] = [];
    const skipped: InferenceDomain[] = [];
    const domainTimestamps = { ...state.domain_timestamps };

    invalidateStoryEvidenceCache(userId);
    await invalidateOntologySchemaCacheSafe();

    for (const domain of targetDomains) {
      const t0 = Date.now();
      try {
        const summary = await this.runDomain(userId, domain, tier);
        results.push({ domain, ok: true, durationMs: Date.now() - t0, summary });
        ran.push(domain);
        domainTimestamps[domain] = new Date().toISOString();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ domain, ok: false, durationMs: Date.now() - t0, error: message });
        skipped.push(domain);
        logger.warn({ err, userId, domain }, 'inference: domain failed');
      }
    }

    const report: InferenceSyncReport = {
      tier,
      ran,
      skipped,
      results,
      durationMs: Date.now() - started,
      ranAt: new Date().toISOString(),
    };

    const now = new Date().toISOString();
    await saveInferenceState(userId, {
      last_t1_run_at: tier === 't1' || tier === 't2' ? now : state.last_t1_run_at,
      last_t2_run_at: tier === 't2' ? now : state.last_t2_run_at,
      domain_timestamps: domainTimestamps,
      last_report: report,
      pending_reasons: [],
    });
    await clearPendingReasons(userId);

    this.lastReport.set(userId, report);
    schedule.inFlight = false;

    logger.info({ userId, tier, ran, skipped, durationMs: report.durationMs }, 'Inference sync completed');
    return report;
  }

  private async runDomain(
    userId: string,
    domain: InferenceDomain,
    tier: InferenceTier
  ): Promise<Record<string, unknown>> {
    switch (domain) {
      case 'graph_recovery': {
        const { graphRecoveryTrigger } = await import('../conversationCentered/graphRecoveryTrigger');
        const r = await graphRecoveryTrigger.runNow(userId);
        return { changed: r.changed, relationships: r.relationships.created, events: r.events.created };
      }
      case 'locations': {
        const { locationNormalizationService } = await import('../locationNormalizationService');
        return (await locationNormalizationService.normalizeUserLocations(userId)) as unknown as Record<string, unknown>;
      }
      case 'organizations': {
        const { organizationNormalizationService } = await import('../organizationNormalizationService');
        return (await organizationNormalizationService.normalizeUserOrganizations(userId)) as unknown as Record<string, unknown>;
      }
      case 'public_figures': {
        const { publicFigureRelationshipService } = await import('../publicFigure/publicFigureRelationshipService');
        return (await publicFigureRelationshipService.inferForUser(userId)) as unknown as Record<string, unknown>;
      }
      case 'social_standing': {
        const { socialStandingService } = await import('../socialStandingService');
        return await socialStandingService.recompute(userId);
      }
      case 'character_importance': {
        const { scoreAllCharactersForUser } = await import('../characters/characterImportanceService');
        return await scoreAllCharactersForUser(userId);
      }
      case 'character_rescan': {
        if (tier !== 't2') return { skipped: true };
        const { characterConversationRescanService } = await import('../characterConversationRescanService');
        return (await characterConversationRescanService.rescan(userId)) as unknown as Record<string, unknown>;
      }
      case 'relationship_classify': {
        if (tier !== 't2') return { skipped: true };
        const { entityFactsService } = await import('../entityFactsService');
        return await entityFactsService.backfillCharacterClassifications(userId);
      }
      case 'achievements_check': {
        const { achievementService } = await import('../achievements/achievementService');
        const unlocked = await achievementService.checkAchievements(userId);
        return { unlocked: unlocked.length };
      }
      case 'essence_profile': {
        if (tier !== 't2') return { skipped: true };
        const { essenceProfileService } = await import('../essenceProfileService');
        const { memoryService } = await import('../memoryService');
        const entries = await memoryService.searchEntries(userId, { limit: 50 });
        if (entries.length < 5) return { skipped: true, reason: 'insufficient_entries' };
        const insights = await essenceProfileService.extractEssence(
          userId,
          [],
          entries.map((e) => ({
            content: e.content,
            date: e.date,
            summary: e.summary || undefined,
          }))
        );
        const insightKeys = Object.keys(insights).filter(
          (k) => Array.isArray((insights as Record<string, unknown>)[k]) && ((insights as Record<string, unknown[]>)[k]?.length ?? 0) > 0
        );
        if (insightKeys.length > 0) {
          await essenceProfileService.updateProfile(userId, insights);
        }
        return { updatedFields: insightKeys.length, fields: insightKeys };
      }
      case 'projects_suggestions': {
        const { projectSuggestionService } = await import('../projects/projectSuggestionService');
        const pending = await projectSuggestionService.getPendingSuggestions(userId);
        return { pending: pending.length };
      }
      case 'skills_suggestions': {
        const { skillSuggestionService } = await import('../skills/skillSuggestionService');
        const pending = await skillSuggestionService.getPendingSuggestions(userId);
        return { pending: pending.length };
      }
      case 'quests_suggestions': {
        const { questSuggestionService } = await import('../quests/questSuggestionService');
        const pending = await questSuggestionService.getPendingSuggestions(userId);
        return { pending: pending.length };
      }
      case 'romantic_rescan': {
        if (tier !== 't2') return { skipped: true };
        const { romanticConversationRescanService } = await import('../romanticConversationRescanService');
        return (await romanticConversationRescanService.rescan(userId)) as unknown as Record<string, unknown>;
      }
      default:
        return {};
    }
  }

  async getStatus(userId: string): Promise<{
    state: Awaited<ReturnType<typeof getInferenceState>>;
    lastReport: InferenceSyncReport | null;
  }> {
    return {
      state: await getInferenceState(userId),
      lastReport: this.lastReport.get(userId) ?? (await getInferenceState(userId)).last_report,
    };
  }
}

function invalidateOntologySchemaCacheSafe(): Promise<void> {
  return import('../ontology/ontologySchemaService')
    .then((m) => { m.invalidateOntologySchemaCache(); })
    .catch(() => undefined);
}

export const inferenceOrchestrator = new InferenceOrchestrator();

// Re-export order constants for tests
export { T1_DOMAIN_ORDER, T2_EXTRA_DOMAINS } from './inferenceTypes';
