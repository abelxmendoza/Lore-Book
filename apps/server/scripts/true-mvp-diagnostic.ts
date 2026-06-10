/**
 * True-MVP Diagnostic
 *
 * Runs the canonical acceptance test from the execution blueprint:
 *   "3 conversations across 3 different days, mention the same person —
 *    on day 3 the assistant references that person accurately."
 *
 * Simulates 3 messages in 3 separate threads through the REAL ingestion
 * path (chat_messages → ingestFromChatMessage → pipeline), then verifies
 * every link of the recall chain and prints a pass/fail report:
 *
 *   1. entity resolution   — ONE omega entity (no duplicates)
 *   2. character promotion — card exists in characters table
 *   3. fact extraction     — entity_facts rows exist
 *   4. classification      — archetype inferred from relationship facts
 *   5. cross-thread recall — retrieveEntityMentionsAcrossThreads finds entries
 *   6. entity dossier      — buildEntityDossierBlock returns content
 *   7. pipeline ledger     — pipeline_runs rows recorded (via conversation_messages)
 *
 * Usage:
 *   LOREKEEPER_TEST_USER_ID=<uuid> npx tsx scripts/true-mvp-diagnostic.ts
 *   add --keep to skip cleanup of the test data
 *
 * Uses a deliberately unique person name so cleanup can find everything.
 */

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../src/services/supabaseClient';
import { conversationIngestionPipeline } from '../src/services/conversationCentered/ingestionPipeline';

const TEST_PERSON = 'Zephyrine Quillborne';
const KEEP = process.argv.includes('--keep');

const MESSAGES = [
  `Had coffee with ${TEST_PERSON} today. She's my old college roommate and she just started a new job as a marine biologist in San Diego.`,
  `${TEST_PERSON} called me tonight — she's nervous about her first deep-sea research dive next month. We talked for two hours like old times.`,
  `Thinking about visiting ${TEST_PERSON} in San Diego this summer. She said she'd take me to see the lab where she works.`,
];

interface CheckResult {
  step: string;
  pass: boolean;
  detail: string;
}

async function main() {
  const userId = process.env.LOREKEEPER_TEST_USER_ID;
  if (!userId) {
    console.error('Set LOREKEEPER_TEST_USER_ID to the uuid of a test user.');
    process.exit(1);
  }

  const results: CheckResult[] = [];
  const threadIds: string[] = [];
  const chatMessageIds: string[] = [];

  console.log(`\n— True-MVP Diagnostic —\nperson: ${TEST_PERSON}\nuser:   ${userId}\n`);

  // ── Simulate 3 conversations in 3 separate threads ──────────────────────
  for (let day = 0; day < 3; day++) {
    const threadId = randomUUID();
    threadIds.push(threadId);

    const now = new Date().toISOString();
    const { error: threadErr } = await supabaseAdmin.from('conversation_sessions').insert({
      id: threadId,
      user_id: userId,
      title: `MVP diagnostic day ${day + 1}`,
      started_at: now, created_at: now, updated_at: now,
      metadata: { mvp_diagnostic: true },
    });
    if (threadErr) throw new Error(`thread create failed: ${threadErr.message}`);

    const { data: msg, error: msgErr } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        user_id: userId,
        session_id: threadId,
        role: 'user',
        content: MESSAGES[day],
        metadata: { mvp_diagnostic: true },
      })
      .select('id')
      .single();
    if (msgErr || !msg) throw new Error(`message save failed: ${msgErr?.message}`);
    chatMessageIds.push(msg.id);

    process.stdout.write(`day ${day + 1}: ingesting through pipeline… `);
    const start = Date.now();
    await conversationIngestionPipeline.ingestFromChatMessage(
      userId, msg.id, threadId, []
    );
    console.log(`done (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  }

  // Give fire-and-forget steps (promotion, facts, classification) time to land
  console.log('waiting 15s for async steps (promotion, facts, classification)…\n');
  await new Promise(r => setTimeout(r, 15_000));

  // ── 1. Entity resolution: exactly ONE omega entity ──────────────────────
  const { data: omegaEntities } = await supabaseAdmin
    .from('omega_entities')
    .select('id, primary_name, mention_count, aliases')
    .eq('user_id', userId)
    .ilike('primary_name', `%${TEST_PERSON.split(' ')[0]}%`);
  results.push({
    step: '1. entity resolution (dedup)',
    pass: (omegaEntities?.length ?? 0) === 1,
    detail: `${omegaEntities?.length ?? 0} omega entit${omegaEntities?.length === 1 ? 'y' : 'ies'} (want exactly 1)` +
      (omegaEntities?.[0] ? `, mention_count=${omegaEntities[0].mention_count}` : ''),
  });

  // ── 2. Character promotion ───────────────────────────────────────────────
  const { data: characters } = await supabaseAdmin
    .from('characters')
    .select('id, name, archetype, importance_level, relationship_depth, metadata')
    .eq('user_id', userId)
    .ilike('name', `%${TEST_PERSON.split(' ')[0]}%`);
  const character = characters?.[0];
  results.push({
    step: '2. character promotion',
    pass: !!character,
    detail: character
      ? `card "${character.name}" — importance=${character.importance_level}, depth=${character.relationship_depth}`
      : 'no character card created',
  });

  // ── 3. Fact extraction ───────────────────────────────────────────────────
  let factCount = 0;
  if (character) {
    const { data: facts } = await supabaseAdmin
      .from('entity_facts')
      .select('fact, category')
      .eq('user_id', userId)
      .eq('entity_id', character.id)
      .eq('entity_type', 'character');
    factCount = facts?.length ?? 0;
    results.push({
      step: '3. fact extraction',
      pass: factCount > 0,
      detail: factCount > 0
        ? `${factCount} facts, e.g. "${facts![0].fact}" [${facts![0].category}]`
        : 'no facts extracted',
    });
  } else {
    results.push({ step: '3. fact extraction', pass: false, detail: 'skipped — no character' });
  }

  // ── 4. Classification from facts ─────────────────────────────────────────
  results.push({
    step: '4. archetype classification',
    pass: !!character?.archetype,
    detail: character?.archetype
      ? `archetype=${character.archetype}`
      : 'archetype not inferred (needs a relationship-category fact)',
  });

  // ── 5. Cross-thread recall ───────────────────────────────────────────────
  const { retrieveEntityMentionsAcrossThreads } = await import('../src/services/chat/contextAwareMemoryRetrieval');
  const crossThread = await retrieveEntityMentionsAcrossThreads(
    userId,
    `What do you know about ${TEST_PERSON}?`,
    characters?.map(c => ({ id: c.id, name: c.name })) ?? [],
    10
  );
  results.push({
    step: '5. cross-thread recall',
    pass: crossThread.length > 0,
    detail: `${crossThread.length} entries retrieved across threads`,
  });

  // ── 6. Entity dossier ────────────────────────────────────────────────────
  const { buildEntityDossierBlock } = await import('../src/services/chat/entityDossierService');
  const dossier = await buildEntityDossierBlock(
    userId,
    `How is ${TEST_PERSON} doing?`,
    (characters ?? []).map(c => ({ id: c.id, name: c.name, archetype: c.archetype, metadata: c.metadata })),
    []
  );
  results.push({
    step: '6. entity dossier',
    pass: !!dossier,
    detail: dossier ? `dossier built (${dossier.length} chars)` : 'dossier empty',
  });

  // ── 7. Pipeline ledger ───────────────────────────────────────────────────
  const { data: convMsgs } = await supabaseAdmin
    .from('conversation_messages')
    .select('id')
    .in('metadata->>chat_message_id', chatMessageIds);
  results.push({
    step: '7. ingestion linkage',
    pass: (convMsgs?.length ?? 0) === 3,
    detail: `${convMsgs?.length ?? 0}/3 messages linked to conversation_messages`,
  });

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n═══ RECALL CHAIN REPORT ═══');
  for (const r of results) {
    console.log(`${r.pass ? '✅' : '❌'} ${r.step}: ${r.detail}`);
  }
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed — ${passed === results.length ? 'TRUE MVP HOLDS' : 'CHAIN BROKEN at first ❌ above'}\n`);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  if (!KEEP) {
    console.log('cleaning up test data…');
    if (character) {
      await supabaseAdmin.from('entity_facts').delete().eq('user_id', userId).eq('entity_id', character.id);
      await supabaseAdmin.from('characters').delete().eq('user_id', userId).eq('id', character.id);
    }
    for (const e of omegaEntities ?? []) {
      await supabaseAdmin.from('omega_claims').delete().eq('user_id', userId).eq('entity_id', e.id);
      await supabaseAdmin.from('omega_entities').delete().eq('user_id', userId).eq('id', e.id);
    }
    await supabaseAdmin.from('chat_messages').delete().in('id', chatMessageIds);
    for (const t of threadIds) {
      await supabaseAdmin.from('conversation_messages').delete().eq('session_id', t);
      await supabaseAdmin.from('conversation_sessions').delete().eq('id', t);
    }
    // Best-effort: derived rows referencing the unique name
    await supabaseAdmin.from('people_places').delete().eq('user_id', userId).ilike('name', `%${TEST_PERSON.split(' ')[0]}%`);
    console.log('cleanup done (use --keep to inspect data next time)\n');
  } else {
    console.log('--keep: test data left in place\n');
  }

  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => {
  console.error('diagnostic crashed:', err);
  process.exit(1);
});
