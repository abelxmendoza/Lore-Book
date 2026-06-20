/**
 * Backfill cognition graph from existing causal links and resolved events.
 *
 * Usage:
 *   npx tsx apps/server/scripts/backfill-cognition-graph.ts
 *   npx tsx apps/server/scripts/backfill-cognition-graph.ts --userId=<uuid>
 *   npx tsx apps/server/scripts/backfill-cognition-graph.ts --limit=500
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');
dotenv.config({ path: resolve(rootDir, '.env') });
dotenv.config({ path: resolve(rootDir, '.env.development') });

import { supabaseAdmin } from '../src/services/supabaseClient';
import { bridgeCausalLink } from '../src/services/cognition/causalBridgeService';
import { bridgeResolvedEventToGraphNode } from '../src/services/cognition/graphBridgeService';
import { salienceService } from '../src/services/cognition/salienceService';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const userIdFilter = parseArg('userId');
  const limit = Number.parseInt(parseArg('limit') ?? '1000', 10);

  console.log('Backfilling cognition graph…');
  if (userIdFilter) console.log(`  user filter: ${userIdFilter}`);
  console.log(`  row limit: ${limit}`);

  let causalQuery = supabaseAdmin
    .from('event_causal_links')
    .select('id, user_id, cause_event_id, effect_event_id, causal_type, confidence, metadata')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (userIdFilter) causalQuery = causalQuery.eq('user_id', userIdFilter);

  const { data: causalLinks, error: causalErr } = await causalQuery;
  if (causalErr) {
    console.error('Failed to load event_causal_links:', causalErr.message);
    process.exit(1);
  }

  let causalOk = 0;
  for (const link of causalLinks ?? []) {
    const ok = await bridgeCausalLink(link.user_id, {
      causeEventId: link.cause_event_id,
      effectEventId: link.effect_event_id,
      causalType: link.causal_type,
      confidence: link.confidence ?? 0.6,
      causalLinkId: link.id,
      evidence: (link.metadata as { evidence?: string } | null)?.evidence,
    });
    if (ok) causalOk += 1;
    console.log(`  [causal] ${link.cause_event_id.slice(0, 8)} -> ${link.effect_event_id.slice(0, 8)}: ${ok ? 'bridged' : 'skipped'}`);
  }

  let eventsQuery = supabaseAdmin
    .from('resolved_events')
    .select('id, user_id, title')
    .order('start_time', { ascending: true })
    .limit(limit);
  if (userIdFilter) eventsQuery = eventsQuery.eq('user_id', userIdFilter);

  const { data: events } = await eventsQuery;
  let graphOk = 0;
  for (const event of events ?? []) {
    await bridgeResolvedEventToGraphNode(event.user_id, event.id);
    graphOk += 1;
    console.log(`  [graph_node] ${event.title?.slice(0, 48) ?? event.id.slice(0, 8)} -> bridged`);
  }

  const userIds = new Set<string>();
  for (const link of causalLinks ?? []) userIds.add(link.user_id);
  for (const event of events ?? []) userIds.add(event.user_id);
  if (userIdFilter) userIds.clear(), userIds.add(userIdFilter);

  let salienceOk = 0;
  for (const uid of userIds) {
    const count = await salienceService.recompute(uid);
    salienceOk += count;
    console.log(`  [salience] user ${uid.slice(0, 8)} -> ${count} scores`);
  }

  console.log('\nDone.');
  console.log(`  causal links bridged: ${causalOk}/${causalLinks?.length ?? 0}`);
  console.log(`  graph nodes bridged: ${graphOk}/${events?.length ?? 0}`);
  console.log(`  salience scores written: ${salienceOk}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
