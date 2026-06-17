#!/usr/bin/env tsx
/**
 * Life Arc & Story Intelligence Audit
 *
 * Run:
 *   npx tsx apps/server/scripts/lifeArcSynthesisAudit.ts
 *   npx tsx apps/server/scripts/lifeArcSynthesisAudit.ts --full-rag
 */
import { synthesizeLifeArcs, type LifeArcSynthesis } from '../src/services/continuityRuntime/arcs/lifeArcSynthesisService';
import { buildRAGPacket } from '../src/services/chat/ragBuilderService';
import { scoreContext } from '../src/services/chat/contextScoringService';
import { assembleWorkingMemory } from '../src/services/chat/workingMemoryAssembler';
import { config } from '../src/config';
import { supabaseAdmin } from '../src/services/supabaseClient';

const STORY_QUESTIONS = [
  'What chapter of life am I in?',
  'What story am I living?',
  'What is changing?',
  'What matters most right now?',
  'Where is life moving?',
  'What is gaining momentum?',
  'What deserves attention?',
];

type AccountLabel = 'founder' | 'developer';

async function resolveAccount(label: AccountLabel): Promise<{ id: string; email: string } | null> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  if (label === 'founder') {
    if (config.ownerUserId?.trim()) {
      const u = data.users.find((x) => x.id === config.ownerUserId.trim());
      return u ? { id: u.id, email: u.email ?? '' } : { id: config.ownerUserId.trim(), email: '' };
    }
    const match = data.users.find((u) => {
      const role = String(u.app_metadata?.role ?? '').toLowerCase();
      return role === 'admin' || role === 'owner' || u.email?.toLowerCase() === config.ownerEmail?.toLowerCase();
    });
    return match ? { id: match.id, email: match.email ?? '' } : null;
  }

  const match = data.users.find((u) => {
    const role = String(u.app_metadata?.role ?? '').toLowerCase();
    return role === 'developer' || u.email?.toLowerCase() === config.developerEmail?.toLowerCase();
  });
  return match ? { id: match.id, email: match.email ?? '' } : null;
}

function printSynthesis(label: string, synthesis: LifeArcSynthesis) {
  console.log(`\n========== ${label} ==========\n`);

  console.log('--- Phase 1: Arc signal inventory ---');
  console.log(
    Object.entries(synthesis.signalInventory)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v.toFixed(1)}`)
      .join('\n') || '  (no signals)'
  );

  console.log('\n--- Phase 2–3: Candidate arcs ---');
  if (!synthesis.candidateArcs.length) console.log('  (none)');
  for (const arc of synthesis.candidateArcs) {
    console.log(`  ${arc.title} [${arc.category} | ${arc.momentum} | score=${arc.score.toFixed(1)}]`);
  }

  console.log('\n--- Phase 4: Current chapter ---');
  console.log(`  ${synthesis.currentChapter.narrative}`);
  console.log(`  Evidence: ${synthesis.currentChapter.evidence.join('; ') || '—'}`);

  console.log('\n--- Phase 5: Conflicts ---');
  if (!synthesis.conflicts.length) console.log('  (none detected)');
  for (const c of synthesis.conflicts) {
    console.log(`  [${c.severity}] ${c.label}`);
  }

  console.log('\n--- Phase 6: Life direction ---');
  console.log(`  Moving toward: ${synthesis.lifeDirection.movingToward.join(', ') || '—'}`);
  console.log(`  Gaining momentum: ${synthesis.lifeDirection.gainingMomentum.join(', ') || '—'}`);
  console.log(`  Fading: ${synthesis.lifeDirection.fading.join(', ') || '—'}`);
  console.log(`  Deserves attention: ${synthesis.lifeDirection.deservesAttention.join(', ') || '—'}`);
}

async function validateStoryQuestions(userId: string, label: string) {
  console.log(`\n--- Phase 7: Story question validation (${label}) ---`);
  let withArcBlock = 0;
  let withGoals = 0;
  for (const q of STORY_QUESTIONS) {
    const wma = await assembleWorkingMemory({ userId, question: q });
    const rag = await buildRAGPacket(userId, q);
    const block = String((rag as { lifeArcSynthesisBlock?: string }).lifeArcSynthesisBlock ?? '');
    const scoring = scoreContext(
      { lifeArcSynthesisBlock: block, foundationRecallBlock: (rag as { foundationRecallBlock?: string }).foundationRecallBlock } as Record<string, unknown>,
      q,
      [],
      []
    );
    const inPrompt = Boolean((scoring.filteredLoreData as { lifeArcSynthesisBlock?: string }).lifeArcSynthesisBlock);
    if (inPrompt) withArcBlock += 1;
    if (wma.goals.length > 0) withGoals += 1;
    console.log(
      `  "${q.slice(0, 40)}" → intent=${wma.intent} goals=${wma.goals.length} arcBlock=${inPrompt ? 'yes' : 'no'}`
    );
  }
  console.log(`  Summary: ${withArcBlock}/${STORY_QUESTIONS.length} arc block, ${withGoals}/${STORY_QUESTIONS.length} goals`);
}

async function main() {
  const fullRag = process.argv.includes('--full-rag');
  console.log('\n=== Life Arc & Story Intelligence Audit ===\n');

  const founder = await resolveAccount('founder');
  if (!founder) throw new Error('Could not resolve founder account');
  const developer = await resolveAccount('developer');

  const founderSynth = await synthesizeLifeArcs(founder.id);
  printSynthesis(`founder (${founder.email})`, founderSynth);

  if (developer) {
    const devSynth = await synthesizeLifeArcs(developer.id);
    printSynthesis(`developer (${developer.email})`, devSynth);

    console.log('\n--- Phase 6: Cross-account validation ---');
    console.log(`  Founder arcs: ${founderSynth.candidateArcs.length} | Developer arcs: ${devSynth.candidateArcs.length}`);
    console.log(`  Founder chapter: ${founderSynth.currentChapter.narrative.slice(0, 60)}…`);
    console.log(`  Developer chapter: ${devSynth.currentChapter.narrative.slice(0, 60)}…`);
  } else {
    console.log('\n--- Phase 6: Cross-account validation ---');
    console.log('  Developer account not found in auth — synthesis-only validation skipped');
  }

  if (fullRag) {
    await validateStoryQuestions(founder.id, 'founder');
    if (developer) await validateStoryQuestions(developer.id, 'developer');
  } else {
    console.log('\n--- Phase 7: Story question validation ---');
    console.log('  Skipped (pass --full-rag to run RAG/prompt checks; slow)');
    console.log(`  Founder prompt block length: ${founderSynth.text.length} chars`);
  }

  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
