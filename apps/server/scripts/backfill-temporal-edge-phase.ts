/**
 * Backfill temporal_edges.phase using Phase 3.1 formula.
 * Run after migrations/20260127_phase31_temporal_edges_phase.sql.
 *
 * Usage: npx tsx apps/server/scripts/backfill-temporal-edge-phase.ts
 * Or from apps/server: npx tsx scripts/backfill-temporal-edge-phase.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { computeRelationshipStrength, determinePhase } from '../src/er/temporalEdgeService';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');
dotenv.config({ path: resolve(rootDir, '.env') });
dotenv.config({ path: resolve(rootDir, '.env.development') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

const BATCH = 200;

type Row = {
  id: string;
  kind: string;
  confidence: number;
  last_evidence_at: string;
  evidence_source_ids: string[] | null;
  scope: string | null;
  phase?: string;
};

async function backfill() {
  console.log('Backfilling temporal_edges.phase (Phase 3.1 formula)...\n');

  let offset = 0;
  let total = 0;
  let updated = 0;
  let ended = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from('temporal_edges')
      .select('id, kind, confidence, last_evidence_at, evidence_source_ids, scope, phase')
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('Select error:', error.message);
      break;
    }
    if (!rows?.length) break;

    for (const row of rows as Row[]) {
      total++;
      const strength = computeRelationshipStrength({
        last_evidence_at: row.last_evidence_at,
        confidence: row.confidence,
      });
      const nextPhase = determinePhase(strength);
      const isEnded = row.kind === 'EPISODIC' && nextPhase === 'DORMANT';
      const phaseToWrite = isEnded ? 'ENDED' : nextPhase;

      if (row.phase === 'ENDED') continue;
      if (row.phase === phaseToWrite && !isEnded) continue;

      const now = new Date().toISOString();
      const body: Record<string, unknown> = { phase: phaseToWrite, updated_at: now };
      if (isEnded) {
        body.active = false;
        body.end_time = now;
      }
      const { error: up } = await supabase.from('temporal_edges').update(body).eq('id', row.id);

      if (up) {
        console.warn('Update failed for', row.id, up.message);
      } else {
        updated++;
        if (isEnded) ended++;
      }
    }

    offset += BATCH;
    if (rows.length < BATCH) break;
  }

  console.log('Done. Total rows:', total, '| Phase updated:', updated, '| Ended (EPISODIC+DORMANT):', ended);
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
