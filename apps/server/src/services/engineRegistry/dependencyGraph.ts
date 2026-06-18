import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

const ENGINE_DEPENDENCIES_TABLE = 'engine_dependencies';

let missingDependencyTableLogged = false;

function isMissingEngineDependenciesTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? '';
  return code === 'PGRST205' || /schema cache|could not find the table/i.test(message);
}

function handleDependencyReadError(error: unknown, engine: string): void {
  if (isMissingEngineDependenciesTableError(error)) {
    if (!missingDependencyTableLogged) {
      missingDependencyTableLogged = true;
      logger.warn(
        { error, engine, table: ENGINE_DEPENDENCIES_TABLE },
        'Engine dependency table missing; continuing with no dependency ordering. Apply migration 20260618090000_engine_dependencies.sql'
      );
    }
    return;
  }

  logger.error({ error, engine }, 'Failed to get dependencies');
}

export function resetDependencyGraphDiagnosticsForTests(): void {
  missingDependencyTableLogged = false;
}

/**
 * Manages engine dependencies and resolves execution order
 */
export class DependencyGraph {
  /**
   * Get dependencies for an engine
   */
  async getDependencies(engine: string): Promise<string[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from(ENGINE_DEPENDENCIES_TABLE)
        .select('depends_on')
        .eq('engine_name', engine);

      if (error) {
        handleDependencyReadError(error, engine);
        return [];
      }

      return (data || []).map((d: any) => d.depends_on);
    } catch (error) {
      handleDependencyReadError(error, engine);
      return [];
    }
  }

  /**
   * Resolve execution order using topological sort
   */
  async resolveOrder(engineList: string[]): Promise<string[]> {
    const resolved: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = async (name: string): Promise<void> => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        logger.warn({ engine: name }, 'Circular dependency detected');
        return;
      }

      visiting.add(name);

      const deps = await this.getDependencies(name);
      for (const dep of deps) {
        await visit(dep);
      }

      visiting.delete(name);
      visited.add(name);
      resolved.push(name);
    };

    for (const engine of engineList) {
      await visit(engine);
    }

    return resolved;
  }

  /**
   * Add a dependency
   */
  async addDependency(engineName: string, dependsOn: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from(ENGINE_DEPENDENCIES_TABLE)
        .insert({
          engine_name: engineName,
          depends_on: dependsOn,
        });

      if (error) {
        logger.error({ error, engineName, dependsOn }, 'Failed to add dependency');
      }
    } catch (error) {
      logger.error({ error, engineName, dependsOn }, 'Failed to add dependency');
    }
  }
}
