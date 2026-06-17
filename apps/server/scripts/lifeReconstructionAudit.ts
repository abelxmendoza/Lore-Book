/**
 * One-off life reconstruction audit against live Supabase data.
 * Loads entity benchmark from .private/audit-benchmark.json (gitignored).
 *
 * Run:
 *   TARGET_USER_ID=<uuid> npx tsx apps/server/scripts/lifeReconstructionAudit.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildMemoryCoverageAudit } from '../src/services/diagnostics/memoryCoverageAudit';
import { classifyEntity } from '../src/services/entities/entityClassifier';
import { supabaseAdmin } from '../src/services/supabaseClient';

const userId = process.env.TARGET_USER_ID ?? '';
if (!userId) {
  console.error('Required: TARGET_USER_ID environment variable.');
  process.exit(1);
}

const USER_IDS = [userId];

type AuditBenchmark = {
  entities?: string[];
  timelineEvents?: string[];
  pollutionPatterns?: string[];
};

const privateBenchmarkPath = resolve(__dirname, '../../../.private/audit-benchmark.json');
const benchmark: AuditBenchmark = existsSync(privateBenchmarkPath)
  ? JSON.parse(readFileSync(privateBenchmarkPath, 'utf8'))
  : {};

const BENCHMARK = benchmark.entities ?? ['Alex Morgan', 'Grandma Rose', 'Downtown Lounge'];
const TIMELINE_EVENTS = benchmark.timelineEvents ?? ['Weekend trip', 'New project kickoff'];
const POLLUTION_PATTERNS = benchmark.pollutionPatterns ?? ['ring', 'find my'];

async function auditUser(userId: string) {
  console.log('\n======== USER', userId, '========');

  const tables = [
    'characters', 'people_places', 'omega_entities', 'conversation_sessions', 'chat_messages',
    'character_relationships', 'character_memories', 'character_timeline_events', 'event_records', 'entity_facts',
  ];
  for (const t of tables) {
    const { count, error } = await supabaseAdmin.from(t).select('*', { count: 'exact', head: true }).eq('user_id', userId);
    console.log(t, error ? `ERR ${error.message}` : count);
  }

  const { data: chars, error: cErr } = await supabaseAdmin
    .from('characters')
    .select('id,name,relationship_type,importance_level,is_family')
    .eq('user_id', userId)
    .limit(500);
  if (cErr) console.log('chars err', cErr.message);

  const { data: pp } = await supabaseAdmin.from('people_places').select('id,name,type').eq('user_id', userId);
  const { data: om } = await supabaseAdmin.from('omega_entities').select('id,primary_name,type,aliases').eq('user_id', userId).limit(500);

  console.log('character count', chars?.length ?? 0);
  console.log('character names', (chars ?? []).map((c) => c.name).sort().join(', '));

  const pollution = (chars ?? []).filter((c) =>
    POLLUTION_PATTERNS.some((p) => c.name?.toLowerCase().includes(p))
  );
  console.log('POLLUTION (products/places as characters):', pollution.map((c) => c.name));

  const audit = await buildMemoryCoverageAudit(userId);
  console.log('coverage summary', JSON.stringify(audit.summary));
  const weak = audit.entities.filter((e) => e.coverageScore < 40 || e.gaps.length >= 2);
  console.log('weak entities', weak.slice(0, 20).map((e) => ({ name: e.name, type: e.type, score: e.coverageScore, gaps: e.gaps })));

  const { data: threads } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id,title,updated_at,metadata')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  const threadStats = (threads ?? []).map((t) => {
    const m = (t.metadata ?? {}) as Record<string, unknown>;
    const tm = (m.threadMeta ?? m) as Record<string, unknown>;
    return {
      title: t.title,
      msgCount: tm.message_count ?? (Array.isArray(m.messages) ? m.messages.length : '?'),
      hasSummary: !!(tm.summary_short || tm.summary_medium || tm.summary_long),
      people: (tm.people as string[] | undefined)?.slice(0, 4),
      places: (tm.places as string[] | undefined)?.slice(0, 3),
      projects: (tm.projects as string[] | undefined)?.slice(0, 3),
      openLoops: Array.isArray(tm.open_loops) ? tm.open_loops.length : Array.isArray(tm.openLoops) ? tm.openLoops.length : 0,
    };
  });
  console.log('threads', JSON.stringify(threadStats, null, 2));

  const allRecords: Array<{ name: string; type: string; storage: string }> = [];
  for (const c of chars ?? []) allRecords.push({ name: c.name, type: 'character', storage: c.relationship_type ?? '?' });
  for (const p of pp ?? []) allRecords.push({ name: p.name, type: p.type ?? 'people_place', storage: 'people_places' });
  for (const o of om ?? []) allRecords.push({ name: o.primary_name, type: o.type ?? 'omega', storage: 'omega_entities' });

  console.log('\nBENCHMARK LOOKUP:');
  for (const b of BENCHMARK) {
    const bl = b.toLowerCase();
    const hits = allRecords.filter((r) => {
      const nl = r.name.toLowerCase();
      return nl.includes(bl) || bl.includes(nl) || bl.split(' ').some((w) => w.length > 3 && nl.includes(w));
    });
    const cls = classifyEntity(b);
    if (hits.length === 0) {
      console.log(`  MISSING  ${b}  (classifier would be: ${cls.type})`);
    } else {
      console.log(`  FOUND    ${b}  -> ${JSON.stringify(hits)}  (classifier: ${cls.type})`);
    }
  }

  const { data: timeline } = await supabaseAdmin
    .from('character_timeline_events')
    .select('title,event_date,event_type,metadata')
    .eq('user_id', userId)
    .order('event_date', { ascending: false })
    .limit(50);
  console.log('\nTIMELINE EVENTS sample', (timeline ?? []).slice(0, 15).map((e) => ({ title: e.title, date: e.event_date, type: e.event_type })));

  console.log('\nTIMELINE BENCHMARK:');
  for (const ev of TIMELINE_EVENTS) {
    const hit = (timeline ?? []).find((e) => e.title?.toLowerCase().includes(ev.toLowerCase().slice(0, 10)));
    console.log(hit ? `  FOUND ${ev}: ${hit.title} (${hit.event_date})` : `  MISSING ${ev}`);
  }

  const { data: rels } = await supabaseAdmin
    .from('character_relationships')
    .select('relationship_type, source:source_character_id(name), target:target_character_id(name)')
    .eq('user_id', userId)
    .limit(30);
  console.log('\nRELATIONSHIPS sample', rels?.slice(0, 10));

  console.log('\nCLASSIFIER (bare vs context):');
  for (const n of ['Andrew', 'Sol', 'Kelly', 'Daisy', 'Hell Fairy', 'Goth Tio', 'Mr. Chino', 'Step Dad Ben', 'Oscuri.dad', 'Leslie']) {
    const ctx = `${n} said we should meet at Club Metro tomorrow`;
    console.log(`  ${n}: bare=${classifyEntity(n).type} ctx=${classifyEntity(n, ctx).type}`);
  }
}

async function main() {
  for (const id of USER_IDS) {
    await auditUser(id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
