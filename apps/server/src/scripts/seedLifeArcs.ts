/**
 * Idempotent import of a user's life-arc seed data into the existing
 * life_arcs table. The arcs come from a JSON file you pass in, so no
 * personal data lives in this repo. Keep real seed files outside git
 * (for example under the gitignored .private/ folder). A fictional sample
 * is in src/scripts/lifeArcsSeed.example.json.
 *
 * Each arc keeps its human-readable lane name in metadata.original_lane
 * (and as a `lane:<slug>` tag), and metadata.date_precision records how
 * exact its dates are. Safe to re-run: arcs are matched on (user_id, title).
 *
 * Usage: cd apps/server && npx tsx src/scripts/seedLifeArcs.ts <email> <arcs.json>
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { supabaseAdmin } from '../services/supabaseClient';
import type { UpsertArcPayload } from '../services/continuityRuntime/arcs/arcService';

type DatePrecision = 'exact_day' | 'month' | 'year' | 'range' | 'approximate' | 'unknown';

type SeedArc = Omit<UpsertArcPayload, 'metadata' | 'tags'> & {
  originalLane: string;
  datePrecision: DatePrecision;
};

function laneSlug(lane: string): string {
  return lane.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadSeedArcs(filePath: string): SeedArc[] {
  const parsed = JSON.parse(readFileSync(resolve(filePath), 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${filePath} must contain a JSON array of arcs`);
  for (const [i, arc] of parsed.entries()) {
    const a = arc as Partial<SeedArc>;
    if (!a?.title || !a.track || !a.arc_type || !a.originalLane || !a.datePrecision) {
      throw new Error(`Arc #${i} in ${filePath} is missing title, track, arc_type, originalLane or datePrecision`);
    }
  }
  return parsed as SeedArc[];
}

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const match = data.users.find((u) => u.email === email);
  if (!match) throw new Error(`No user found for ${email}`);
  return match.id;
}

/**
 * arcService.upsert() relies on an ON CONFLICT (user_id, title) clause, but
 * the live life_arcs table has no unique constraint backing that — the
 * upsert throws 42P10. Rather than alter shared schema/service code from
 * this standalone seed script, idempotency is implemented locally here:
 * look up by (user_id, title) first, then insert or update directly.
 */
async function upsertArcByTitle(
  userId: string,
  payload: UpsertArcPayload & { tags: string[]; metadata: Record<string, unknown> }
): Promise<'created' | 'updated'> {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('life_arcs')
    .select('id')
    .eq('user_id', userId)
    .eq('title', payload.title)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabaseAdmin
      .from('life_arcs')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (error) throw error;
    return 'updated';
  }

  const { error } = await supabaseAdmin.from('life_arcs').insert({ user_id: userId, ...payload });
  if (error) throw error;
  return 'created';
}

async function main() {
  const [email, filePath] = process.argv.slice(2);
  if (!email || !filePath) {
    console.error('Usage: npx tsx src/scripts/seedLifeArcs.ts <email> <arcs.json>');
    process.exit(1);
  }
  const SEED_ARCS = loadSeedArcs(filePath);

  const userId = await resolveUserId(email);
  console.log(`Seeding ${SEED_ARCS.length} life arcs for ${email} (${userId})`);

  let created = 0;
  let updated = 0;
  for (const arc of SEED_ARCS) {
    const { originalLane, datePrecision, ...payload } = arc;
    const result = await upsertArcByTitle(userId, {
      ...payload,
      // Seeded, not yet confirmed by the account owner — is_active stays
      // false and needs_review stays true until reviewed and corrected via
      // arcService.update()/delete(), same as any other arc. Nothing about
      // seeding makes this data more permanent or "locked in" than a
      // manually created arc.
      is_active: false,
      confidence: 1,
      source: 'user_created',
      tags: [`lane:${laneSlug(originalLane)}`],
      metadata: {
        original_lane: originalLane,
        date_precision: datePrecision,
        seed_source: 'life_arcs_seed_file_v1',
        needs_review: true,
      },
    });
    if (result === 'created') created += 1;
    else updated += 1;
    console.log(`  ✓ ${arc.title} (${result})`);
  }

  console.log(`Done. ${created} created, ${updated} updated (idempotent — safe to re-run).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
