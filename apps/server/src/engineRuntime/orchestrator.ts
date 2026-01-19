import { logger } from '../logger';

import { buildEngineContext } from './contextBuilder';
import { ENGINE_REGISTRY, hasEngine } from './engineRegistry';
import { saveEngineResults, saveEngineResult } from './storage';
import type { EngineContext, EngineResult, EngineResults } from './types';

/**
 * Engine Orchestrator
 * Runs all engines in dependency order + parallel where safe
 */
export class EngineOrchestrator {
  constructor(private registry = ENGINE_REGISTRY) {}

  /**
   * Run all engines
   */
  async runAll(userId: string): Promise<EngineResults> {
    const start = Date.now();
    logger.info({ userId }, 'Running all engines');

    const ctx = await buildEngineContext(userId);
    const results: EngineResults = {};

    // Run engines sequentially (can be optimized later for parallel execution)
    for (const [name, engineFn] of Object.entries(this.registry)) {
      const engineStart = Date.now();
      try {
        logger.debug({ engine: name, userId }, 'Running engine');
        const data = await engineFn(userId, ctx);
        const duration = Date.now() - engineStart;

        results[name] = {
          success: true,
          data,
          duration,
        };

        logger.debug({ engine: name, duration }, 'Engine completed successfully');
      } catch (err: any) {
        const duration = Date.now() - engineStart;
        const errorMessage = err.message || String(err);

        results[name] = {
          success: false,
          error: errorMessage,
          duration,
        };

        logger.error({ engine: name, error: err, duration }, 'Engine failed');
      }
    }

    // Save results
    await saveEngineResults(userId, results);

    const totalDuration = Date.now() - start;
    logger.info(
      {
        userId,
        engines: Object.keys(results).length,
        duration: totalDuration,
        successes: Object.values(results).filter((r) => r.success).length,
        failures: Object.values(results).filter((r) => !r.success).length,
      },
      'Completed running all engines'
    );

    return results;
  }

  /**
   * Run a single engine
   */
  async runSingle(userId: string, engineName: string): Promise<EngineResult> {
    logger.info({ userId, engine: engineName }, 'Running single engine');

    if (!hasEngine(engineName)) {
      const error = `Engine not found: ${engineName}`;
      logger.error({ engine: engineName }, error);
      return {
        success: false,
        error,
      };
    }

    const start = Date.now();
    const ctx = await buildEngineContext(userId);
    const engineFn = this.registry[engineName];

    try {
      const data = await engineFn(userId, ctx);
      const duration = Date.now() - start;

      const result: EngineResult = {
        success: true,
        data,
        duration,
      };

      await saveEngineResult(userId, engineName, result);

      logger.info({ engine: engineName, duration }, 'Engine completed successfully');

      return result;
    } catch (err: any) {
      const duration = Date.now() - start;
      const errorMessage = err.message || String(err);

      const result: EngineResult = {
        success: false,
        error: errorMessage,
        duration,
      };

      await saveEngineResult(userId, engineName, result);

      logger.error({ engine: engineName, error: err, duration }, 'Engine failed');

      return result;
    }
  }
}

