import { logger } from '../../logger';
import { sensemakingOrchestrator, engineHealthMonitor, type OrchestrationContext } from '../engineGovernance';
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
   * Run all engines (with orchestration governance)
   */
  async runAll(
    userId: string, 
    save: boolean = true,
    trigger: OrchestrationContext['trigger'] = 'manual'
  ): Promise<Record<string, any>> {
    const startTime = Date.now();
    logger.info({ userId, trigger }, 'Starting engine orchestration');

    // Get orchestration decisions
    const context: OrchestrationContext = {
      userId,
      trigger,
      recentActivity: {
        entryCount: 0, // Could be enhanced to fetch actual count
        timeSinceLastRun: undefined
      }
    };

    const decisions = await sensemakingOrchestrator.decideEnginesToRun(context);
    
    // Filter to only engines that should run
    const enginesToRun = decisions
      .filter(d => d.shouldRun)
      .map(d => d.engineName);

    logger.info({ userId, enginesToRun: enginesToRun.length, totalEngines: decisions.length }, 'Orchestration decisions made');

    const ctx = await buildEngineContext(userId);
    const results: Record<string, any> = {};

    // Run only engines that should run
    for (const name of enginesToRun) {
      const engineFn = this.registry[name];
      if (!engineFn) {
        logger.warn({ userId, engine: name }, 'Engine not found in registry');
        continue;
      }

      try {
        logger.debug({ userId, engine: name }, 'Running engine');
        const start = Date.now();
        const result = await engineFn(userId, ctx);
        const duration = Date.now() - start;
        
        // Record health metrics
        const outputCount = Array.isArray(result) ? result.length : (result ? 1 : 0);
        const avgConfidence = this.extractAvgConfidence(result);
        engineHealthMonitor.recordRun(name, duration, true, outputCount, avgConfidence);
        
        results[name] = result;
        logger.debug({ userId, engine: name, duration }, 'Engine completed');
      } catch (err: any) {
        const duration = Date.now() - start;
        engineHealthMonitor.recordRun(name, duration, false, 0, 0, err.message);
        logger.error({ error: err, userId, engine: name }, 'Engine failed');
        results[name] = { error: err.message || String(err) };
      }
    }

    // Log skipped engines
    const skippedEngines = decisions
      .filter(d => !d.shouldRun)
      .map(d => ({ name: d.engineName, reason: d.reason }));
    
    if (skippedEngines.length > 0) {
      logger.debug({ userId, skipped: skippedEngines }, 'Engines skipped by orchestration');
    }

    if (save) {
      await saveEngineResults(userId, results);
    }

    const totalDuration = Date.now() - startTime;
    logger.info({ 
      userId, 
      duration: totalDuration, 
      enginesRun: enginesToRun.length,
      enginesSkipped: skippedEngines.length
    }, 'Engine orchestration completed');

    return results;
  }

  /**
   * Extract average confidence from engine result
   */
  private extractAvgConfidence(result: any): number {
    if (!result) return 0.5;
    
    // Try to find confidence values in result
    if (typeof result === 'object') {
      const confidences: number[] = [];
      
      const extractConfidences = (obj: any): void => {
        if (Array.isArray(obj)) {
          obj.forEach(item => extractConfidences(item));
        } else if (obj && typeof obj === 'object') {
          if (typeof obj.confidence === 'number') {
            confidences.push(obj.confidence);
          }
          Object.values(obj).forEach(val => extractConfidences(val));
        }
      };
      
      extractConfidences(result);
      
      if (confidences.length > 0) {
        return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
      }
    }
    
    return 0.5; // Default confidence
  }

  /**
   * Run a single engine (with health monitoring)
   */
  async runSingle(userId: string, engineName: string, save: boolean = true): Promise<any> {
    logger.info({ userId, engine: engineName }, 'Running single engine');

    const ctx = await buildEngineContext(userId);
    const engineFn = this.registry[engineName];

    if (!engineFn) {
      throw new Error(`Engine not found: ${engineName}`);
    }

    const start = Date.now();
    try {
      const result = await engineFn(userId, ctx);
      const duration = Date.now() - start;

      // Record health metrics
      const outputCount = Array.isArray(result) ? result.length : (result ? 1 : 0);
      const avgConfidence = this.extractAvgConfidence(result);
      engineHealthMonitor.recordRun(engineName, duration, true, outputCount, avgConfidence);

      if (save) {
        await saveEngineResult(userId, engineName, result);
      }

      logger.debug({ userId, engine: engineName, duration }, 'Single engine completed');
      return result;
    } catch (err: any) {
      const duration = Date.now() - start;
      engineHealthMonitor.recordRun(engineName, duration, false, 0, 0, err.message);
      logger.error({ error: err, userId, engine: engineName }, 'Single engine failed');
      throw err;
    }
  }
}

