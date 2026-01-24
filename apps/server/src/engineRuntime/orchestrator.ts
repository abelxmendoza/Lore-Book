import { logger } from '../logger';
import { DependencyGraph } from '../services/engineRegistry/dependencyGraph';
import { sensemakingOrchestrator, type OrchestrationContext } from '../services/engineGovernance';

import { buildEngineContext } from './contextBuilder';
import { ENGINE_REGISTRY, hasEngine } from './engineRegistry';
import { saveEngineResults, saveEngineResult } from './storage';
import type { EngineContext, EngineResult, EngineResults } from './types';

/**
 * Engine Orchestrator
 * Runs all engines in dependency order + parallel where safe
 */
export class EngineOrchestrator {
  private dependencyGraph: DependencyGraph;

  constructor(
    private registry = ENGINE_REGISTRY,
    private maxConcurrency: number = 5
  ) {
    this.dependencyGraph = new DependencyGraph();
  }

  /**
   * Run all engines
   * Optionally uses sensemaking orchestrator to intelligently select which engines to run
   */
  async runAll(
    userId: string,
    save: boolean = true,
    useSensemaking: boolean = true
  ): Promise<EngineResults> {
    const start = Date.now();
    logger.info({ userId, useSensemaking }, 'Running all engines');

    // Build context with default limits (most engines don't need all data)
    // Engines that need all data (chronology, legacy) can request it separately
    const ctx = await buildEngineContext(userId, {
      maxEntries: 1000,
      maxDays: 90,
      includeAll: false,
    });
    const results: EngineResults = {};

    // Use sensemaking orchestrator to decide which engines to run
    let enginesToRun: string[] = [];
    if (useSensemaking) {
      try {
        const orchestrationContext: OrchestrationContext = {
          userId,
          trigger: 'entry_saved', // Default trigger, can be enhanced
          recentActivity: {
            entryCount: ctx.entries.length,
            timeSinceLastRun: undefined, // Could be enhanced
          },
        };

        const decisions = await sensemakingOrchestrator.decideEnginesToRun(orchestrationContext);
        enginesToRun = decisions
          .filter(d => d.shouldRun)
          .map(d => d.engineName);

        logger.debug(
          { userId, enginesToRun: enginesToRun.length, totalEngines: decisions.length },
          'Sensemaking orchestrator selected engines'
        );
      } catch (error) {
        logger.warn({ error, userId }, 'Sensemaking orchestrator failed, running all engines');
        // Fallback to running all engines
        enginesToRun = Object.keys(this.registry);
      }
    } else {
      // Run all engines if sensemaking is disabled
      enginesToRun = Object.keys(this.registry);
    }

    // Group engines by dependency level for parallel execution
    const batches = await this.groupEnginesByDependency(enginesToRun);
    logger.debug(
      { userId, batches: batches.length, totalEngines: enginesToRun.length },
      'Grouped engines into dependency batches'
    );

    // Run engines in batches (each batch can run in parallel)
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.debug(
        { userId, batchIndex: batchIndex + 1, batchSize: batch.length, engines: batch },
        'Running engine batch'
      );

      // Run batch with concurrency limit
      await this.runEngineBatch(userId, batch, ctx, results);
    }

    // Save results (if enabled)
    if (save) {
      await saveEngineResults(userId, results);
    }

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
    // For single engine runs, check if it needs all data
    const needsAllData = ['chronology', 'legacy'].includes(engineName);
    const ctx = await buildEngineContext(userId, {
      maxEntries: 1000,
      maxDays: 90,
      includeAll: needsAllData,
    });
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

  /**
   * Group engines into batches based on dependencies
   * Engines in the same batch can run in parallel
   * Engines in later batches depend on earlier batches
   */
  private async groupEnginesByDependency(engines: string[]): Promise<string[][]> {
    try {
      // Resolve execution order using topological sort
      const ordered = await this.dependencyGraph.resolveOrder(engines);

      // Group by dependency level
      const batches: string[][] = [];
      const processed = new Set<string>();

      // Build dependency map
      const dependencyMap = new Map<string, string[]>();
      for (const engine of engines) {
        const deps = await this.dependencyGraph.getDependencies(engine);
        dependencyMap.set(engine, deps);
      }

      // Create batches: engines with no dependencies or all dependencies satisfied
      while (processed.size < engines.length) {
        const currentBatch: string[] = [];

        for (const engine of engines) {
          if (processed.has(engine)) continue;

          const deps = dependencyMap.get(engine) || [];
          const allDepsSatisfied = deps.every(dep => processed.has(dep) || !engines.includes(dep));

          if (deps.length === 0 || allDepsSatisfied) {
            currentBatch.push(engine);
            processed.add(engine);
          }
        }

        if (currentBatch.length === 0) {
          // No engines can run - might be circular dependency or missing engines
          // Add remaining engines to avoid infinite loop
          const remaining = engines.filter(e => !processed.has(e));
          if (remaining.length > 0) {
            logger.warn({ remaining }, 'Adding remaining engines despite dependency issues');
            currentBatch.push(...remaining);
            remaining.forEach(e => processed.add(e));
          } else {
            break;
          }
        }

        batches.push(currentBatch);
      }

      return batches;
    } catch (error) {
      logger.warn({ error }, 'Failed to group engines by dependency, running all in parallel');
      // Fallback: single batch with all engines
      return [engines];
    }
  }

  /**
   * Run a batch of engines with concurrency limit
   */
  private async runEngineBatch(
    userId: string,
    batch: string[],
    ctx: EngineContext,
    results: EngineResults
  ): Promise<void> {
    // Create semaphore for concurrency control
    const semaphore = new Array(this.maxConcurrency).fill(null);
    let semaphoreIndex = 0;

    const runWithSemaphore = async (engineName: string): Promise<void> => {
      const slot = semaphoreIndex % this.maxConcurrency;
      semaphoreIndex++;

      const engineFn = this.registry[engineName];
      if (!engineFn) {
        logger.warn({ engine: engineName }, 'Engine not found in registry');
        results[engineName] = {
          success: false,
          error: 'Engine not found in registry',
          duration: 0,
        };
        return;
      }

      const engineStart = Date.now();
      try {
        logger.debug({ engine: engineName, userId }, 'Running engine');
        const data = await engineFn(userId, ctx);
        const duration = Date.now() - engineStart;

        results[engineName] = {
          success: true,
          data,
          duration,
        };

        logger.debug({ engine: engineName, duration }, 'Engine completed successfully');
      } catch (err: any) {
        const duration = Date.now() - engineStart;
        const errorMessage = err.message || String(err);

        results[engineName] = {
          success: false,
          error: errorMessage,
          duration,
        };

        logger.error({ engine: engineName, error: err, duration }, 'Engine failed');
      }
    };

    // Run all engines in batch with concurrency limit
    // Use Promise.all with chunking for concurrency control
    const chunks: string[][] = [];
    for (let i = 0; i < batch.length; i += this.maxConcurrency) {
      chunks.push(batch.slice(i, i + this.maxConcurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(engineName => runWithSemaphore(engineName)));
    }
  }
}

