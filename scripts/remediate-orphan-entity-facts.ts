#!/usr/bin/env npx tsx
/**
 * Remediate entity_facts pointing at deleted character IDs.
 *
 * Default: dry-run. Pass --execute to apply.
 * - Exact duplicates on live characters → supersede (soft, sets superseded_at)
 * - Unique narrator facts on deleted self → migrate entity_id to current self character
 *
 * Does NOT touch character_relationships (audit separately).
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(): void {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const execute = process.argv.includes('--execute');

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function resolveUserId(): Promise<string> {
  const explicit = arg('--user');
  const ownerId = process.env.OWNER_USER_ID || process.env.FOUNDER_USER_ID;
  const ownerEmail =
    process.env.OWNER_EMAIL || process.env.FOUNDER_EMAIL || process.env.ADMIN_EMAIL;
  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');

  if (explicit) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === explicit.toLowerCase());
    if (!user) throw new Error(`No user for ${explicit}`);
    return user.id;
  }
  if (ownerId) return ownerId;
  if (ownerEmail) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase());
    if (!user) throw new Error(`No user for ${ownerEmail}`);
    return user.id;
  }
  throw new Error('Pass --user or set ADMIN_EMAIL / OWNER_EMAIL');
}

async function resolveSelfCharacterId(
  userId: string
): Promise<{ id: string; name: string }> {
  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata, importance_level')
    .eq('user_id', userId);

  const list = chars ?? [];
  const isSelf = list.find((c) => (c.metadata as Record<string, unknown> | null)?.is_self === true);
  if (isSelf) return { id: isSelf.id, name: isSelf.name };

  const me = list.find((c) => /^me$/i.test(c.name ?? ''));
  if (me) return { id: me.id, name: me.name };

  const protagonist = list.find((c) => c.importance_level === 'protagonist');
  if (protagonist) return { id: protagonist.id, name: protagonist.name };

  throw new Error('Could not resolve self/protagonist character for migration target');
}

function normFact(text: string): string {
  return text.trim().toLowerCase();
}

async function main(): Promise<void> {
  const userId = await resolveUserId();
  const self = await resolveSelfCharacterId(userId);
  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');

  const { data: chars } = await supabaseAdmin.from('characters').select('id').eq('user_id', userId);
  const valid = new Set((chars ?? []).map((c) => c.id));

  const { data: facts, error: factsErr } = await supabaseAdmin
    .from('entity_facts')
    .select('id, entity_id, fact, category, metadata, superseded_at')
    .eq('user_id', userId)
    .eq('entity_type', 'character')
    .eq('status', 'active')
    .is('superseded_at', null);
  if (factsErr) throw factsErr;

  const orphans = (facts ?? []).filter((f) => !valid.has(f.entity_id));
  if (!orphans.length) {
    console.log(JSON.stringify({ dryRun: !execute, message: 'No orphan entity_facts found', userId: userId.slice(0, 8) + '…' }, null, 2));
    return;
  }

  const { data: liveFacts } = await supabaseAdmin
    .from('entity_facts')
    .select('id, entity_id, fact')
    .eq('user_id', userId)
    .eq('entity_type', 'character')
    .eq('status', 'active')
    .in('entity_id', [...valid])
    .is('superseded_at', null);

  const liveByText = new Map<string, string>();
  for (const f of liveFacts ?? []) {
    liveByText.set(normFact(String(f.fact ?? '')), f.entity_id);
  }

  const plan = {
    supersedeDuplicates: [] as { id: string; fact: string; ghost_entity_id: string }[],
    migrateToSelf: [] as { id: string; fact: string; ghost_entity_id: string; target_id: string }[],
    skipped: [] as { id: string; reason: string }[],
  };

  for (const row of orphans) {
    const text = normFact(String(row.fact ?? ''));
    const dupOnLive = liveByText.has(text);

    if (dupOnLive) {
      plan.supersedeDuplicates.push({
        id: row.id,
        fact: String(row.fact ?? '').slice(0, 120),
        ghost_entity_id: row.entity_id,
      });
      continue;
    }

    // All current orphans are on deleted self — migrate to live self character.
    if (row.entity_id !== orphans[0]?.entity_id && new Set(orphans.map((o) => o.entity_id)).size > 1) {
      plan.skipped.push({ id: row.id, reason: 'multiple ghost ids — needs manual review' });
      continue;
    }

    plan.migrateToSelf.push({
      id: row.id,
      fact: String(row.fact ?? '').slice(0, 120),
      ghost_entity_id: row.entity_id,
      target_id: self.id,
    });
  }

  const report = {
    dryRun: !execute,
    userId: userId.slice(0, 8) + '…',
    selfCharacter: { id: self.id.slice(0, 8) + '…', name: self.name },
    orphanFacts: orphans.length,
    willSupersede: plan.supersedeDuplicates.length,
    willMigrate: plan.migrateToSelf.length,
    skipped: plan.skipped.length,
    samples: {
      supersede: plan.supersedeDuplicates.slice(0, 3),
      migrate: plan.migrateToSelf.slice(0, 3),
    },
  };

  if (!execute) {
    console.log(JSON.stringify({ ...report, message: 'Dry run — pass --execute to apply' }, null, 2));
    return;
  }

  const now = new Date().toISOString();
  let superseded = 0;
  let migrated = 0;
  let errors = 0;

  for (const row of plan.supersedeDuplicates) {
    const { error } = await supabaseAdmin
      .from('entity_facts')
      .update({
        superseded_at: now,
        metadata: {
          remediated_at: now,
          remediated_reason: 'orphan_duplicate_on_live_character',
          ghost_entity_id: row.ghost_entity_id,
        },
        updated_at: now,
      })
      .eq('id', row.id)
      .eq('user_id', userId);
    if (error) errors++;
    else superseded++;
  }

  for (const row of plan.migrateToSelf) {
    const { error } = await supabaseAdmin
      .from('entity_facts')
      .update({
        entity_id: row.target_id,
        metadata: {
          remediated_at: now,
          remediated_reason: 'migrated_from_deleted_self_character',
          ghost_entity_id: row.ghost_entity_id,
        },
        updated_at: now,
      })
      .eq('id', row.id)
      .eq('user_id', userId);
    if (error) errors++;
    else migrated++;
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        dryRun: false,
        applied: { superseded, migrated, errors, skipped: plan.skipped.length },
      },
      null,
      2
    )
  );

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
