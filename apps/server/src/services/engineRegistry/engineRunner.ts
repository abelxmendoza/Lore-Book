import { logger } from '../../logger';
import { RegistryLoader } from './registryLoader';
import { DependencyGraph } from './dependencyGraph';
import { EngineHealth } from './engineHealth';
import type { EngineManifestEntry } from './types';

/**
 * Runs engines dynamically based on manifest entries
 */
export class EngineRunner {
  private health: EngineHealth;
  private graph: DependencyGraph;

  constructor() {
    this.health = new EngineHealth();
    this.graph = new DependencyGraph();
  }

  /**
   * Run a single engine
   */
  async runEngine(name: string, ctx: any): Promise<any> {
    const start = Date.now();

    try {
      const entry = await RegistryLoader.load(name);
      if (!entry || entry.status !== 'active') {
        logger.warn({ name, status: entry?.status }, 'Engine not active or not found');
        return null;
      }

      // Dynamic import based on path
      const module = await import(entry.path);
      
      // Try to find the engine class (could be named differently)
      const EngineClass = module.default || module[entry.name] || module[`${entry.name}Engine`] || module[`${entry.name.charAt(0).toUpperCase() + entry.name.slice(1)}Engine`];

      if (!EngineClass) {
        throw new Error(`Engine class not found in module: ${entry.path}`);
      }

      const engine = new EngineClass();
      
      // Call process method
      if (typeof engine.process !== 'function') {
        throw new Error(`Engine ${name} does not have a process method`);
      }

      const result = await engine.process(ctx);

      const duration = Date.now() - start;
      await this.health.recordSuccess(name, duration);

      logger.debug({ name, duration }, 'Engine run successful');

      return result;
    } catch (err: any) {
      const duration = Date.now() - start;
      const errorMessage = err.message || String(err);
      
      await this.health.recordError(name, errorMessage);
      
      logger.error({ error: err, name, duration }, 'Engine run failed');

      return { error: errorMessage };
    }
  }

  /**
   * Run all engines in dependency order
   */
  async runAll(ctx: any): Promise<Record<string, any>> {
    try {
      const manifests = await RegistryLoader.loadAll();
      const activeEngines = manifests.filter(m => m.status === 'active');
      const names = activeEngines.map(m => m.name);

      logger.info({ engines: names.length }, 'Running all engines');

      // Resolve dependency order
      const ordered = await this.graph.resolveOrder(names);

      const results: Record<string, any> = {};

      for (const name of ordered) {
        logger.debug({ name }, 'Running engine');
        results[name] = await this.runEngine(name, ctx);
      }

      logger.info({ engines: ordered.length }, 'Completed running all engines');

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to run all engines');
      return { error: String(error) };
    }
  }
}

