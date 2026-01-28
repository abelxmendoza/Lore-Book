/**
 * Analytics Execution Orchestrator (Blueprint V2)
 * Wrap existing analytics first; refactor internals later.
 * Every step is backward-compatible.
 */

import { createHash } from 'crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  AnalyticsContext,
  AnalyticsPayload,
  AnalyticsResult,
  DataVersion,
  LegacyAnalyticsModuleDescriptor,
  ModelVersion,
  OrchestratorRequest,
  TimeWindow,
} from './types';

const ANALYTICS_MODEL_VERSION: ModelVersion = 'v1';

/** Default time window: last 30 days */
function defaultWindow(): TimeWindow {
  const end = Date.now();
  const start = end - 30 * 24 * 60 * 60 * 1000;
  return { start, end };
}

/** Minimum viable data version: hash of latest journal update for user */
async function computeDataVersion(userId: string): Promise<DataVersion> {
  try {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.created_at) {
      return hashString(`${userId}:none`);
    }
    return hashString(`${userId}:${data.created_at}`);
  } catch (e) {
    logger.warn({ userId, err: e }, 'computeDataVersion failed');
    return hashString(`${userId}:error`);
  }
}

function hashString(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

/** Deterministic seed from userId and time window */
function deriveSeed(userId: string, timeWindow: TimeWindow): number {
  const s = `${userId}:${timeWindow.start}:${timeWindow.end}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) >>> 0;
}

/** Build cache key for version-aware invalidation (Phase B will use this for caching) */
export function buildCacheKey(context: AnalyticsContext, analyticsType: string): string {
  return hashString(
    [context.userId, analyticsType, context.dataVersion, context.modelVersion, context.timeWindow.start, context.timeWindow.end].join(':')
  );
}

/** Build analytics context from request */
export async function buildAnalyticsContext(request: OrchestratorRequest): Promise<AnalyticsContext> {
  const timeWindow = request.timeWindow ?? defaultWindow();
  const dataVersion = await computeDataVersion(request.userId);
  const seed = deriveSeed(request.userId, timeWindow);

  return {
    userId: request.userId,
    dataVersion,
    modelVersion: ANALYTICS_MODEL_VERSION,
    timeWindow,
    seed,
    timeRange: request.timeRange,
    searchOptions: request.searchOptions,
  };
}

/** Degraded result when a module throws */
export function buildDegradedResult(moduleName: string, error: unknown): AnalyticsResult<AnalyticsPayload> {
  const code = error instanceof Error ? error.message : String(error);
  return {
    value: null,
    confidence: 0,
    sampleSize: 0,
    diagnostics: {
      analyticsType: moduleName,
      executionTimeMs: 0,
      warnings: ['MODULE_FAILED', code],
      invariantsPassed: false,
    },
  };
}

/** Wrap raw payload in AnalyticsResult with diagnostics (legacy path) */
function wrapLegacyResult(
  rawPayload: AnalyticsPayload,
  executionTimeMs: number,
  analyticsType: string
): AnalyticsResult<AnalyticsPayload> {
  return {
    value: rawPayload,
    confidence: null,
    sampleSize: null,
    diagnostics: {
      analyticsType,
      executionTimeMs,
      warnings: ['LEGACY_MODULE'],
      invariantsPassed: true,
    },
  };
}

/** Execute a legacy module (no blueprint cache yet; Phase B adds cache by buildCacheKey) */
async function executeModule(
  module: LegacyAnalyticsModuleDescriptor,
  context: AnalyticsContext
): Promise<AnalyticsResult<AnalyticsPayload>> {
  const start = Date.now();
  const rawPayload = await module.run(context);
  const executionTimeMs = Date.now() - start;
  return wrapLegacyResult(rawPayload, executionTimeMs, module.name);
}

/** Safe execution: catch errors, return degraded result, log */
export async function executeModuleSafely(
  module: LegacyAnalyticsModuleDescriptor,
  context: AnalyticsContext
): Promise<AnalyticsResult<AnalyticsPayload>> {
  try {
    const result = await executeModule(module, context);
    logger.debug(
      { moduleName: module.name, executionTimeMs: result.diagnostics.executionTimeMs, userId: context.userId },
      'analytics module executed'
    );
    return result;
  } catch (error) {
    logger.error({ err: error, moduleName: module.name, userId: context.userId }, 'analytics module failed');
    return buildDegradedResult(module.name, error);
  }
}

/** Create a legacy descriptor for use with executeModuleSafely */
export function createLegacyDescriptor(
  name: string,
  run: (context: AnalyticsContext) => Promise<AnalyticsPayload>
): LegacyAnalyticsModuleDescriptor {
  return { name, isLegacy: true, run };
}

/** Run legacy analytics for a single module (convenience for routes). Backward-compatible: returns result.value for JSON. */
export async function runLegacyAnalytics(
  moduleName: string,
  context: AnalyticsContext,
  run: (context: AnalyticsContext) => Promise<AnalyticsPayload>
): Promise<AnalyticsResult<AnalyticsPayload>> {
  const descriptor = createLegacyDescriptor(moduleName, run);
  return executeModuleSafely(descriptor, context);
}

/** Run multiple modules through the orchestrator. Returns map of moduleName -> AnalyticsResult. */
export async function runAnalyticsOrchestrator(
  request: OrchestratorRequest,
  runMap: Record<string, (context: AnalyticsContext) => Promise<AnalyticsPayload>>
): Promise<Record<string, AnalyticsResult<AnalyticsPayload>>> {
  const context = await buildAnalyticsContext(request);
  const results: Record<string, AnalyticsResult<AnalyticsPayload>> = {};
  const requested = Object.keys(runMap);

  for (const moduleName of requested) {
    const run = runMap[moduleName];
    if (!run) continue;
    const descriptor = createLegacyDescriptor(moduleName, run);
    results[moduleName] = await executeModuleSafely(descriptor, context);
  }

  return results;
}
