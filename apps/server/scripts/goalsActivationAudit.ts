#!/usr/bin/env tsx
/**
 * Goals & Life Direction Activation Audit
 *
 * Run:
 *   npx tsx apps/server/scripts/goalsActivationAudit.ts
 */
import { assembleWorkingMemory, buildWorkingMemoryPacket } from '../src/services/chat/workingMemoryAssembler';
import { buildRAGPacket } from '../src/services/chat/ragBuilderService';
import { scoreContext } from '../src/services/chat/contextScoringService';
import { GoalStorage } from '../src/services/goals/goalStorage';
import { config } from '../src/config';
import { supabaseAdmin } from '../src/services/supabaseClient';

const GOAL_QUESTIONS = [
  'What are my goals?',
  'What am I working toward?',
  'What have I abandoned?',
  'What matters most?',
];

const IDENTITY_QUESTIONS = [
  'Who am I?',
  'What am I trying to do with my life?',
  'What matters most to me?',
  'What should I focus on?',
];

async function resolveFounderId(): Promise<string> {
  if (config.ownerUserId?.trim()) return config.ownerUserId.trim();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const match = data.users.find((u) => {
    const role = String(u.app_metadata?.role ?? '').toLowerCase();
    return role === 'admin' || role === 'owner' || u.email?.toLowerCase() === config.ownerEmail?.toLowerCase();
  });
  if (!match) throw new Error('Could not resolve founder account');
  return match.id;
}

async function schemaAudit() {
  const tables = ['goals', 'goal_insights'];
  const state: Record<string, boolean> = {};
  for (const t of tables) {
    const { error } = await supabaseAdmin.from(t).select('id').limit(1);
    state[t] = !error;
  }
  return state;
}

async function inventory(userId: string) {
  const storage = new GoalStorage();
  const stats = await storage.getStats(userId);
  const { data: bySource } = await supabaseAdmin
    .from('goals')
    .select('source')
    .eq('user_id', userId);
  const sourceCounts: Record<string, number> = {};
  for (const row of bySource ?? []) {
    const s = String(row.source ?? 'unknown');
    sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
  }
  return { stats, sourceCounts, totalRows: stats.total_goals };
}

async function traceQuestion(userId: string, question: string) {
  const assembly = await assembleWorkingMemory({ userId, question });
  const packet = buildWorkingMemoryPacket(assembly);
  const rag = await buildRAGPacket(userId, question);
  const scoring = scoreContext(
    { foundationRecallBlock: (rag as { foundationRecallBlock?: string }).foundationRecallBlock ?? '' } as Record<string, unknown>,
    question,
    [],
    []
  );
  const wmBlock = String((rag as { foundationRecallBlock?: string }).foundationRecallBlock ?? packet.text);
  const goalsInPacket = packet.goals.length;
  const goalsInPrompt = wmBlock.includes('**Goals**') && goalsInPacket > 0;

  return {
    question,
    intent: assembly.intent,
    goalsRetrieved: assembly.goals.length,
    goalTitles: assembly.goals.map((g) => g.title),
    goalsInPacket,
    goalsInPrompt,
    wmBlockHasGoalsSection: wmBlock.includes('**Goals**'),
    scoringPreservesWm: Boolean((scoring.filteredLoreData as { foundationRecallBlock?: string }).foundationRecallBlock?.includes('**Goals**')),
  };
}

async function main() {
  const userId = await resolveFounderId();
  console.log('\n=== Goals & Life Direction Activation Audit ===\n');
  console.log(`User: ${userId}\n`);

  console.log('--- Phase 1: Schema ---');
  const schema = await schemaAudit();
  console.log(JSON.stringify(schema, null, 2));

  console.log('\n--- Phase 2: Inventory ---');
  const inv = await inventory(userId);
  console.log(`Total goals: ${inv.totalRows}`);
  console.log(`By status: active=${inv.stats.active_goals} completed=${inv.stats.completed_goals} abandoned=${inv.stats.abandoned_goals}`);
  console.log(`By source: ${JSON.stringify(inv.sourceCounts)}`);

  console.log('\n--- Phase 3–4: Goal query validation + utilization ---');
  for (const q of GOAL_QUESTIONS) {
    const t = await traceQuestion(userId, q);
    console.log(`\nQ: ${q}`);
    console.log(`  intent=${t.intent} goals=${t.goalsRetrieved} inPacket=${t.goalsInPacket} inPrompt=${t.goalsInPrompt}`);
    if (t.goalTitles.length) console.log(`  titles: ${t.goalTitles.slice(0, 5).join(' | ')}`);
  }

  console.log('\n--- Phase 5: Identity questions ---');
  for (const q of IDENTITY_QUESTIONS) {
    const t = await traceQuestion(userId, q);
    console.log(`Q: ${q} → intent=${t.intent} goals=${t.goalsRetrieved}`);
  }

  console.log('\n=== Audit complete ===\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
