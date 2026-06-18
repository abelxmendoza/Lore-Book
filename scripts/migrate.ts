#!/usr/bin/env npx tsx
/**
 * Unified migration runner. Consolidates the previously copy-pasted
 * run-base-migrations / run-ontology-migrations / run-relationship-peripherals /
 * run-romantic-peripherals scripts into one entrypoint.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts base
 *   npx tsx scripts/migrate.ts ontology
 *   npx tsx scripts/migrate.ts relationship-peripherals
 *   npx tsx scripts/migrate.ts romantic-peripherals
 *   npx tsx scripts/migrate.ts file supabase/migrations/<name>.sql [more.sql ...]
 *
 * Requires SUPABASE_CONNECTION_STRING (Session pooler URI) in .env.
 */
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadEnv, applyMigrations, type MigrationItem } from './lib/migrationRunner';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const BASE_MIGRATIONS = [
  'migrations/000_setup_all_tables.sql',
  'migrations/20250102_conversational_orchestration.sql',
];

export const ONTOLOGY_MIGRATIONS = [
  'supabase/migrations/20260617120000_spatial_ontology.sql',
  'supabase/migrations/20260617130000_social_group_ontology.sql',
  'supabase/migrations/20260617140000_organizations_type_check.sql',
  'supabase/migrations/20260617140000_romantic_peripherals.sql',
  'supabase/migrations/20260617150000_user_inference_state.sql',
  'supabase/migrations/20260617160000_dynamic_classifications.sql',
  'supabase/migrations/20260617170000_classifications_swimlane_keywords.sql',
  'supabase/migrations/20260617180000_relationship_scope_classifications.sql',
  'supabase/migrations/20260617180000_relationship_peripherals_domain.sql',
  'supabase/migrations/20260617210000_entity_authority.sql',
];

type Command = {
  migrations: MigrationItem[];
  requirePooler?: boolean;
  verify?: Parameters<typeof applyMigrations>[0]['verify'];
};

export async function resolveCommand(argv: string[]): Promise<{ label: string; cmd: Command } | null> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case 'base':
      return { label: 'base', cmd: { migrations: BASE_MIGRATIONS.map((file) => ({ file })), requirePooler: true } };

    case 'ontology':
      return { label: 'ontology', cmd: { migrations: ONTOLOGY_MIGRATIONS.map((file) => ({ file })) } };

    case 'relationship-peripherals':
      return {
        label: 'relationship-peripherals',
        cmd: {
          migrations: [{ file: 'supabase/migrations/20260617180000_relationship_peripherals_domain.sql' }],
          verify: async (pool) => {
            const r = await pool.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'relationship_peripherals' AND column_name = 'domain'
            `);
            console.log('  verify → domain column present:', r.rows.length > 0);
          },
        },
      };

    case 'romantic-peripherals':
      return {
        label: 'romantic-peripherals',
        cmd: {
          migrations: [
            {
              file: 'supabase/migrations/20260617140000_romantic_peripherals.sql',
              skipIf: async (pool) => {
                const r = await pool.query(`SELECT to_regclass('public.romantic_peripherals') AS tbl`);
                return Boolean(r.rows[0]?.tbl);
              },
            },
          ],
          verify: async (pool) => {
            const r = await pool.query(`
              SELECT
                to_regclass('public.romantic_peripherals') AS table_name,
                (SELECT count(*)::int FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'romantic_peripherals') AS column_count,
                (SELECT count(*)::int FROM pg_policies WHERE tablename = 'romantic_peripherals') AS policy_count
            `);
            console.log('  verify →', r.rows[0]);
          },
        },
      };

    case 'file': {
      if (rest.length === 0) throw new Error('Usage: migrate.ts file <path.sql> [more.sql ...]');
      return { label: 'file', cmd: { migrations: rest.map((file) => ({ file })) } };
    }

    default:
      return null;
  }
}

/** Resolve and execute a migrate subcommand. Throws on unknown command. */
export async function runMigrate(argv: string[]): Promise<void> {
  const resolved = await resolveCommand(argv);
  if (!resolved) {
    throw new Error(
      'Usage: migrate.ts <base|ontology|relationship-peripherals|romantic-peripherals|file <path...>>',
    );
  }
  await applyMigrations({ root: ROOT, label: resolved.label, ...resolved.cmd });
}

async function main(): Promise<void> {
  loadEnv(ROOT);
  await runMigrate(process.argv.slice(2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('\n❌', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
