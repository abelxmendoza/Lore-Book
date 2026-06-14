#!/usr/bin/env tsx
/**
 * Fix residential places misclassified as generic "place" / venue.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/fixResidentialPlaces.ts
 *   cd apps/server && npx tsx src/scripts/fixResidentialPlaces.ts --user-id <uuid> --execute
 */

import 'dotenv/config';
import { inferPlaceType } from '../constants/placeTypes';
import { supabaseAdmin } from '../services/supabaseClient';
import { placeEnrichmentService } from '../services/placeEnrichmentService';

const DEFAULT_USER = '789bd607-e063-466f-a9ef-f68d24e8bb57';

const RESIDENTIAL_NAME_RE =
  /\b(house|home|apartment|apt|condo|flat|casa|duplex|townhouse)\b|[''']s?\s+(house|home|apartment)/i;

const SHOW_VENUE_RE =
  /\b(night\s?club|concert|music\s?venue|club\s?metro|goth\s?club|dance\s?club|rave|festival)\b/i;

function looksResidential(name: string): boolean {
  if (SHOW_VENUE_RE.test(name)) return false;
  return RESIDENTIAL_NAME_RE.test(name);
}

async function main() {
  const execute = process.argv.includes('--execute');
  const userIdx = process.argv.indexOf('--user-id');
  const userId = userIdx >= 0 ? process.argv[userIdx + 1] : DEFAULT_USER;

  const { data: rows, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, type, metadata')
    .eq('user_id', userId);

  if (error) throw error;

  const fixes: Array<{ id: string; name: string; from: string; to: string }> = [];

  for (const row of rows ?? []) {
    if (!looksResidential(row.name)) continue;

    const inferred = inferPlaceType(row.name, row.name, row.type) ?? 'house';
    const current = (row.type ?? 'place').toLowerCase();
    const generic = !current || ['place', 'venue', 'unknown', 'other', 'music_venue'].includes(current);

    if (generic || current !== inferred) {
      fixes.push({ id: row.id, name: row.name, from: current || '(empty)', to: inferred });
    }
  }

  if (fixes.length === 0) {
    console.log('No residential place fixes needed.');
    return;
  }

  console.log(`${execute ? 'Applying' : 'Dry-run —'} ${fixes.length} fix(es):`);
  for (const fix of fixes) {
    console.log(`  • ${fix.name}: ${fix.from} → ${fix.to}`);
  }

  if (!execute) {
    console.log('\nPass --execute to apply.');
    return;
  }

  for (const fix of fixes) {
    const meta = (rows!.find((r) => r.id === fix.id)!.metadata as Record<string, unknown>) ?? {};
    const sig = Array.isArray(meta.place_significance) ? (meta.place_significance as string[]) : [];
    const nextSig = sig.includes('home') ? sig : [...sig, 'home'];

    await supabaseAdmin
      .from('locations')
      .update({
        type: fix.to,
        metadata: { ...meta, place_significance: nextSig },
        updated_at: new Date().toISOString(),
      })
      .eq('id', fix.id)
      .eq('user_id', userId);

    await placeEnrichmentService.enrichFromText(
      userId,
      fix.id,
      `I live at ${fix.name}. Building LoreBook here with family.`,
      { forceType: true }
    );
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
