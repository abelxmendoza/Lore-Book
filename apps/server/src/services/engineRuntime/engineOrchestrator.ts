import { logger } from '../../logger';
import { buildEngineContext } from './contextBuilder';
import { ENGINE_REGISTRY, type EngineFunction } from './engineRegistry';
import { saveEngineResults, saveEngineResult } from './engineStorage';

/**
 * Engine Orchestrator
 * Runs all engines in dependency order + parallel where safe
 */
export class EngineOrchestrator {
  constructor(private registry: Record<string, EngineFunction> = ENGINE_REGISTRY) {}

  /**
   * Run all engines
   */
  async runAll(userId: string, save: boolean = true): Promise<Record<string, any>> {
    const startTime = Date.now();
    logger.info({ userId }, 'Starting engine orchestration');

    const ctx = await buildEngineContext(userId);
    const results: Record<string, any> = {};

    // Run engines sequentially (can be optimized to run in parallel groups later)
    for (const [name, engineFn] of Object.entries(this.registry)) {
      try {
        logger.debug({ userId, engine: name }, 'Running engine');
        const start = Date.now();
        results[name] = await engineFn(userId, ctx);
        const duration = Date.now() - start;
        logger.debug({ userId, engine: name, duration }, 'Engine completed');
      } catch (err: any) {
        logger.error({ error: err, userId, engine: name }, 'Engine failed');
        results[name] = { error: err.message || String(err) };
      }
    }

    if (save) {
      await saveEngineResults(userId, results);
    }

    const totalDuration = Date.now() - startTime;
    logger.info({ userId, duration: totalDuration, engines: Object.keys(results).length }, 'Engine orchestration completed');

    return results;
  }

  /**
   * Run a single engine
   */
  async runSingle(userId: string, engineName: string, save: boolean = true): Promise<any> {
    logger.info({ userId, engine: engineName }, 'Running single engine');

    const ctx = await buildEngineContext(userId);
    const engineFn = this.registry[engineName];

    if (!engineFn) {
      throw new Error(`Engine not found: ${engineName}`);
    }

    try {
      const start = Date.now();
      const result = await engineFn(userId, ctx);
      const duration = Date.now() - start;

      if (save) {
        await saveEngineResult(userId, engineName, result);
      }

      logger.debug({ userId, engine: engineName, duration }, 'Single engine completed');
      return result;
    } catch (err: any) {
      logger.error({ error: err, userId, engine: engineName }, 'Single engine failed');
      throw err;
    }
  }
}

