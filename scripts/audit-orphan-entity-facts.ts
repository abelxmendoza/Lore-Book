#!/usr/bin/env npx tsx
/** Audit entity_facts pointing at deleted character IDs (no deletes). */
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
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();

async function main() {
  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');
  const email = process.env.ADMIN_EMAIL || process.env.OWNER_EMAIL;
  const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const uid = users.users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error('no user');

  const { data: chars } = await supabaseAdmin.from('characters').select('id,name').eq('user_id', uid);
  const valid = new Set((chars ?? []).map((c) => c.id));

  const { data: facts } = await supabaseAdmin
    .from('entity_facts')
    .select('id, entity_id, fact, category, created_at')
    .eq('user_id', uid)
    .eq('entity_type', 'character')
    .eq('status', 'active');

  const orphans = (facts ?? []).filter((f) => !valid.has(f.entity_id));

  // Check if facts duplicate content on live characters (safe to supersede)
  const { data: liveFacts } = await supabaseAdmin
    .from('entity_facts')
    .select('id, entity_id, fact')
    .eq('user_id', uid)
    .eq('entity_type', 'character')
    .eq('status', 'active')
    .in('entity_id', [...valid]);

  const liveFactTexts = new Set((liveFacts ?? []).map((f) => String(f.fact).trim().toLowerCase()));

  console.log(
    JSON.stringify(
      {
        userId: uid.slice(0, 8) + '…',
        activeCharacterFacts: facts?.length ?? 0,
        orphanCharacterFacts: orphans.length,
        exactDuplicatesOnLiveCharacter: orphans.filter((o) =>
          liveFactTexts.has(String(o.fact).trim().toLowerCase())
        ).length,
        uniqueOrphanFactsNeedingReview: orphans.filter(
          (o) => !liveFactTexts.has(String(o.fact).trim().toLowerCase())
        ).length,
        ghostEntityIds: [...new Set(orphans.map((o) => o.entity_id))].map((id) => ({
          id: id.slice(0, 8) + '…',
          count: orphans.filter((o) => o.entity_id === id).length,
        })),
        orphans: orphans.slice(0, 15).map((o) => ({
          id: o.id,
          ghost_entity_id: o.entity_id,
          category: o.category,
          fact: o.fact,
          duplicatedOnLiveCharacter: liveFactTexts.has(String(o.fact).trim().toLowerCase()),
          suggestedAction:
            liveFactTexts.has(String(o.fact).trim().toLowerCase())
              ? 'SUPERSEDE (duplicate of live character fact)'
              : 'REVIEW — may need migrate to protagonist before delete',
        })),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
