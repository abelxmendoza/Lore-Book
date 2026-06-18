/**
 * Detects whether spatial/social ontology columns exist on production DB.
 * Normalization services mirror fields into metadata when columns are missing.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

type SchemaState = {
  locations: boolean;
  organizations: boolean;
  checkedAt: number;
};

let cache: SchemaState | null = null;
const TTL_MS = 5 * 60 * 1000;

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return /column.*does not exist|Could not find the/i.test(message);
}

async function probe(table: 'locations' | 'organizations', column: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from(table).select(column).limit(1);
  if (!error) return true;
  if (isMissingColumnError(error.message)) return false;
  logger.debug({ table, column, error: error.message }, 'Ontology schema probe ambiguous — assuming present');
  return true;
}

export async function getOntologySchemaState(): Promise<{ locations: boolean; organizations: boolean }> {
  if (cache && Date.now() - cache.checkedAt < TTL_MS) {
    return { locations: cache.locations, organizations: cache.organizations };
  }
  const [locations, organizations] = await Promise.all([
    probe('locations', 'root_type'),
    probe('organizations', 'social_category'),
  ]);
  cache = { locations, organizations, checkedAt: Date.now() };
  if (!locations || !organizations) {
    logger.warn(
      { locations, organizations },
      'Ontology columns missing — run: npm run migrate:ontology'
    );
  }
  return { locations, organizations };
}

export function invalidateOntologySchemaCache(): void {
  cache = null;
}
