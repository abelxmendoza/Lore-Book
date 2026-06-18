#!/usr/bin/env tsx
/**
 * Story-Aware Chat Audit — 50-question founder validation.
 *
 * Run:
 *   npx tsx apps/server/scripts/storyAwareChatAudit.ts
 */
import { assembleWorkingMemory } from '../../../src/services/chat/workingMemoryAssembler';
import { buildRAGPacket } from '../../../src/services/chat/ragBuilderService';
import { scoreContext } from '../../../src/services/chat/contextScoringService';
import { classifyResponseType } from '../../../src/services/storyContextService';
import { buildSystemPrompt } from '../../../src/services/chat/systemPromptBuilder';
import { resolveFounderId } from '../../lib/auditCommon';

const QUESTIONS: Array<{ q: string; category: string; expectsStory: boolean }> = [
  { q: 'Who am I?', category: 'identity', expectsStory: true },
  { q: 'What kind of person am I?', category: 'identity', expectsStory: true },
  { q: 'What do you know about me?', category: 'identity', expectsStory: true },
  { q: 'What defines me?', category: 'identity', expectsStory: true },
  { q: 'What are my values?', category: 'identity', expectsStory: true },
  { q: 'What matters to me?', category: 'identity', expectsStory: true },
  { q: 'How would you describe my identity?', category: 'identity', expectsStory: true },
  { q: 'What is my story?', category: 'identity', expectsStory: true },
  { q: 'What chapter am I in?', category: 'chapter', expectsStory: true },
  { q: 'What chapter of life am I in?', category: 'chapter', expectsStory: true },
  { q: 'What is my current chapter?', category: 'chapter', expectsStory: true },
  { q: 'What phase of life am I in?', category: 'chapter', expectsStory: true },
  { q: 'What era am I in right now?', category: 'chapter', expectsStory: true },
  { q: 'Summarize my current life chapter', category: 'chapter', expectsStory: true },
  { q: 'What period of life is this?', category: 'chapter', expectsStory: true },
  { q: 'What is happening in my life right now?', category: 'chapter', expectsStory: true },
  { q: 'What stories am I living?', category: 'arcs', expectsStory: true },
  { q: 'What life arcs are active?', category: 'arcs', expectsStory: true },
  { q: 'What are my major life arcs?', category: 'arcs', expectsStory: true },
  { q: 'What narrative threads run through my life?', category: 'arcs', expectsStory: true },
  { q: 'What story am I living?', category: 'arcs', expectsStory: true },
  { q: 'What dominant arcs shape my life?', category: 'arcs', expectsStory: true },
  { q: 'Tell me about my LoreBook arc', category: 'arcs', expectsStory: true },
  { q: 'What is my family arc?', category: 'arcs', expectsStory: true },
  { q: 'Where is my life heading?', category: 'direction', expectsStory: true },
  { q: 'Where is life moving?', category: 'direction', expectsStory: true },
  { q: 'What direction is my life going?', category: 'direction', expectsStory: true },
  { q: 'Where am I headed?', category: 'direction', expectsStory: true },
  { q: 'What am I building toward?', category: 'direction', expectsStory: true },
  { q: 'What is my life direction?', category: 'direction', expectsStory: true },
  { q: 'What is changing in my life?', category: 'direction', expectsStory: false },
  { q: 'What should I focus on?', category: 'direction', expectsStory: false },
  { q: 'What conflicts keep appearing?', category: 'conflicts', expectsStory: true },
  { q: 'What tensions exist in my life?', category: 'conflicts', expectsStory: true },
  { q: 'What are my competing priorities?', category: 'conflicts', expectsStory: true },
  { q: 'What tradeoffs am I facing?', category: 'conflicts', expectsStory: true },
  { q: 'LoreBook vs employment — what is the tension?', category: 'conflicts', expectsStory: true },
  { q: 'What keeps getting in the way?', category: 'conflicts', expectsStory: true },
  { q: 'What is gaining momentum?', category: 'momentum', expectsStory: true },
  { q: 'What is fading in my life?', category: 'momentum', expectsStory: true },
  { q: 'What deserves attention right now?', category: 'momentum', expectsStory: true },
  { q: 'What is growing in my life?', category: 'momentum', expectsStory: true },
  { q: 'What momentum do my arcs have?', category: 'momentum', expectsStory: true },
  { q: 'What is declining?', category: 'momentum', expectsStory: true },
  { q: 'What are my current goals?', category: 'goals', expectsStory: false },
  { q: 'What am I working toward?', category: 'goals', expectsStory: false },
  { q: 'What goals have I abandoned?', category: 'goals', expectsStory: false },
  { q: 'What projects am I working on?', category: 'projects', expectsStory: false },
  { q: 'How is LoreBook progressing?', category: 'projects', expectsStory: false },
  { q: 'What is the status of my projects?', category: 'projects', expectsStory: false },
  { q: 'Summarize what you know about my family', category: 'relationships', expectsStory: false },
  { q: 'Who lives with me?', category: 'relationships', expectsStory: false },
  { q: 'What is my relationship with Leslie?', category: 'relationships', expectsStory: false },
  { q: 'What happened at Amazon onboarding?', category: 'career', expectsStory: false },
  { q: 'Tell me about my career transition', category: 'career', expectsStory: false },
  { q: 'What work am I doing?', category: 'career', expectsStory: false },
  { q: 'Who is Andrew?', category: 'memory', expectsStory: false },
  { q: 'What happened at Club Metro?', category: 'memory', expectsStory: false },
  { q: 'What skills do I have?', category: 'memory', expectsStory: false },
  { q: 'What communities am I part of?', category: 'memory', expectsStory: false },
];

export type AuditRow = {
  question: string;
  category: string;
  intent: string;
  responseType: string;
  expectsStory: boolean;
  storyInPrompt: boolean;
  hasChapter: boolean;
  hasArcs: boolean;
  hasConflicts: boolean;
  hasMomentum: boolean;
  hasProvenance: boolean;
  gap: string | null;
};

async function auditOne(userId: string, item: (typeof QUESTIONS)[number]): Promise<AuditRow> {
  const wma = await assembleWorkingMemory({ userId, question: item.q });
  const rag = await buildRAGPacket(userId, item.q);
  const scoring = scoreContext(
    {
      storyContextBlock: (rag as { storyContextBlock?: string }).storyContextBlock,
      foundationRecallBlock: (rag as { foundationRecallBlock?: string }).foundationRecallBlock,
    } as Record<string, unknown>,
    item.q,
    [],
    []
  );
  const filtered = scoring.filteredLoreData as {
    storyContextBlock?: string;
    lifeArcSynthesisBlock?: string;
  };
  const block = String(filtered.storyContextBlock ?? filtered.lifeArcSynthesisBlock ?? '');
  const prompt = buildSystemPrompt(
    { timeline: { events: [], arcs: [] }, characters: [] },
    [],
    [],
    '',
    [],
    filtered as Parameters<typeof buildSystemPrompt>[5],
    undefined,
    null,
    null,
    null,
    null,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    userId
  );

  const storyInPrompt = prompt.includes('STORY CONTEXT') || prompt.includes('LIFE ARC SYNTHESIS');
  const hasChapter = block.includes('Current Chapter');
  const hasArcs = block.includes('Top Life Arcs') || block.includes('Active Life Arcs');
  const hasConflicts = block.includes('Active Conflicts') || block.includes('Tensions');
  const hasMomentum = block.includes('Momentum');
  const hasProvenance = block.includes('WHY (provenance');

  let gap: string | null = null;
  if (item.expectsStory && !storyInPrompt) gap = 'story_expected_but_missing';
  else if (!item.expectsStory && storyInPrompt) gap = 'story_unnecessary_but_injected';
  else if (item.expectsStory && storyInPrompt && !hasProvenance) gap = 'story_without_provenance';

  return {
    question: item.q,
    category: item.category,
    intent: wma.intent,
    responseType: classifyResponseType(wma.intent),
    expectsStory: item.expectsStory,
    storyInPrompt,
    hasChapter,
    hasArcs,
    hasConflicts,
    hasMomentum,
    hasProvenance,
    gap,
  };
}

export async function runStoryAwareChatAudit(): Promise<void> {
  const userId = await resolveFounderId();
  console.log('\n=== Story-Aware Chat Audit (50 questions) ===\n');

  const rows: AuditRow[] = [];
  for (const item of QUESTIONS) {
    rows.push(await auditOne(userId, item));
    process.stdout.write('.');
  }
  console.log('\n');

  const storyExpected = rows.filter((r) => r.expectsStory);
  const gaps = rows.filter((r) => r.gap);

  const storyUtilPct = Math.round((storyExpected.filter((r) => r.storyInPrompt).length / storyExpected.length) * 100);
  const arcUtilPct = Math.round((storyExpected.filter((r) => r.hasArcs).length / storyExpected.length) * 100);
  const conflictUtilPct = Math.round(
    (rows.filter((r) => r.category === 'conflicts' && r.hasConflicts).length /
      rows.filter((r) => r.category === 'conflicts').length) *
      100
  );
  const genericRisk = rows.filter((r) => r.intent === 'LIFE_REVIEW' && r.expectsStory).length;

  console.log('--- Metrics ---');
  console.log(`  Story utilization: ${storyUtilPct}% (${storyExpected.filter((r) => r.storyInPrompt).length}/${storyExpected.length})`);
  console.log(`  Arc in prompt: ${arcUtilPct}%`);
  console.log(`  Conflict utilization: ${conflictUtilPct}%`);
  console.log(`  Provenance attached: ${storyExpected.filter((r) => r.hasProvenance).length}/${storyExpected.length}`);
  console.log(`  Misrouted to LIFE_REVIEW: ${genericRisk}`);
  console.log(`  Gaps: ${gaps.length}`);

  console.log('\n--- Intent distribution (story questions) ---');
  const storyIntents = new Map<string, number>();
  for (const r of storyExpected) {
    storyIntents.set(r.intent, (storyIntents.get(r.intent) ?? 0) + 1);
  }
  for (const [intent, count] of [...storyIntents.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${intent}: ${count}`);
  }

  if (gaps.length) {
    console.log('\n--- Gaps ---');
    for (const g of gaps.slice(0, 15)) {
      console.log(`  [${g.gap}] ${g.question} → intent=${g.intent}`);
    }
  }

  console.log('\n--- Sample routing ---');
  for (const r of rows.filter((r) => ['chapter', 'arcs', 'conflicts', 'momentum', 'direction'].includes(r.category)).slice(0, 8)) {
    console.log(
      `  ${r.category.padEnd(10)} "${r.question.slice(0, 35)}" → ${r.intent} | story=${r.storyInPrompt ? 'yes' : 'no'} | type=${r.responseType}`
    );
  }
  console.log('');
}
