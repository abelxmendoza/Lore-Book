#!/usr/bin/env npx tsx
/**
 * Validate inference orchestrator state + lore materialization for owner/admin.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(): void {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

async function resolveUserId(): Promise<string> {
  const ownerId = process.env.OWNER_USER_ID || process.env.FOUNDER_USER_ID;
  const ownerEmail =
    process.env.OWNER_EMAIL || process.env.FOUNDER_EMAIL || process.env.ADMIN_EMAIL;
  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');
  if (ownerId) return ownerId;
  if (!ownerEmail) throw new Error('Set ADMIN_EMAIL or OWNER_EMAIL');
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase());
  if (!user) throw new Error(`No user for ${ownerEmail}`);
  return user.id;
}

async function main(): Promise<void> {
  const userId = await resolveUserId();
  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');
  const { inferenceOrchestrator } = await import(
    '../apps/server/src/services/inference/inferenceOrchestrator'
  );

  const { data: state, error: stateErr } = await supabaseAdmin
    .from('user_inference_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (stateErr) throw stateErr;

  const status = await inferenceOrchestrator.getStatus(userId);

  const [{ count: charCount }, { count: locCount }, { count: orgCount }, { data: pfChars }] =
    await Promise.all([
      supabaseAdmin.from('characters').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('locations').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin
        .from('characters')
        .select('id,name,importance_level,metadata')
        .eq('user_id', userId)
        .filter('metadata->>public_figure', 'eq', 'true'),
    ]);

  const { data: protagonist } = await supabaseAdmin
    .from('characters')
    .select('name,importance_level,metadata')
    .eq('user_id', userId)
    .or('metadata->>is_self.eq.true,importance_level.eq.protagonist')
    .limit(1)
    .maybeSingle();

  const checks: { name: string; ok: boolean; detail?: string }[] = [
    { name: 'user_inference_state row exists', ok: !!state },
    { name: 'last_t1_run_at set', ok: !!state?.last_t1_run_at },
    { name: 'last_report has domains', ok: (state?.last_report?.ran?.length ?? 0) > 0 },
    { name: 'getStatus returns lastT1', ok: !!status.state?.last_t1_run_at },
    { name: 'characters materialized', ok: (charCount ?? 0) > 0 },
    { name: 'locations materialized', ok: (locCount ?? 0) > 0 },
    { name: 'organizations materialized', ok: (orgCount ?? 0) > 0 },
    { name: 'public figures detected', ok: (pfChars?.length ?? 0) >= 1 },
    { name: 'protagonist exists', ok: !!protagonist },
    {
      name: 'Hell Fairy not protagonist-tier',
      ok: !(pfChars ?? []).some(
        (c) =>
          /hell\s*fairy/i.test(c.name ?? '') &&
          ['protagonist', 'major'].includes(String(c.importance_level))
      ),
    },
  ];

  console.log(
    JSON.stringify(
      {
        userId: userId.slice(0, 8) + '…',
        inferenceState: state
          ? {
              last_t1_run_at: state.last_t1_run_at,
              last_t2_run_at: state.last_t2_run_at,
              pending_reasons: state.pending_reasons,
              last_report_ran: state.last_report?.ran,
            }
          : null,
        status: {
          lastT1: status.state?.last_t1_run_at,
          lastT2: status.state?.last_t2_run_at,
          lastReportRan: status.lastReport?.ran,
        },
        counts: { characters: charCount, locations: locCount, organizations: orgCount },
        protagonist: protagonist
          ? { name: protagonist.name, tier: protagonist.importance_level }
          : null,
        publicFigures: (pfChars ?? []).map((c) => {
          const meta = (c.metadata ?? {}) as Record<string, unknown>;
          const conn = meta.public_figure_connection as { stage?: string } | undefined;
          return { name: c.name, tier: c.importance_level, connection: conn?.stage };
        }),
        checks,
        allPassed: checks.every((c) => c.ok),
      },
      null,
      2
    )
  );

  if (!checks.every((c) => c.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
