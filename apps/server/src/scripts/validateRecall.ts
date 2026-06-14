/**
 * RECALL VALIDATION — Sprint AF
 *
 * Traces router → retrieval → context for foundation recall queries.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/validateRecall.ts
 */

import { routeRecallQuery, buildRecallCoverageReport } from '../services/chat/recallQueryRouter';
import { detectSyncRecallIntent } from '../services/chat/recallIntentPatterns';
import { logger } from '../logger';

const MAIN_USER = process.env.RECALL_TEST_USER_ID ?? '789bd607-e063-466f-a9ef-f68d24e8bb57';

const CONVERSATION_HISTORY = [
  {
    role: 'user',
    content:
      'Ashley De La Cruz was 19. We met after Club Metro in DTLA and spent the night together.',
  },
  { role: 'assistant', content: 'Got it — I will remember Ashley.' },
];

const TEST_CASES: Array<{
  query: string;
  expectedIntent: string;
  foundationPrimary: boolean;
  mustNotContain?: string[];
  mustContain?: string[];
  history?: Array<{ role: string; content: string }>;
}> = [
  {
    query: 'What do you know about me?',
    expectedIntent: 'biography',
    foundationPrimary: true,
    mustNotContain: ['Relevant past entries were found'],
  },
  {
    query: 'Recall everything about me',
    expectedIntent: 'biography',
    foundationPrimary: true,
  },
  {
    query: 'Who are the characters in my story?',
    expectedIntent: 'character_roster',
    foundationPrimary: true,
    mustNotContain: ['Relevant past entries were found'],
  },
  {
    query: 'Tell me about my family',
    expectedIntent: 'family',
    foundationPrimary: true,
    mustNotContain: ['Relevant past entries were found'],
  },
  {
    query: 'Tell me about Sol',
    expectedIntent: 'entity',
    foundationPrimary: true,
  },
  {
    query: 'Tell me about Abuela',
    expectedIntent: 'entity',
    foundationPrimary: true,
  },
  {
    query: 'Who is Ashley De La Cruz?',
    expectedIntent: 'entity',
    foundationPrimary: true,
    mustNotContain: ['Relevant past entries were found'],
    mustContain: ['Ashley'],
  },
  {
    query: 'Who is Tío Juan?',
    expectedIntent: 'entity',
    foundationPrimary: true,
    mustNotContain: ['Relevant past entries were found'],
  },
  {
    query: 'What happened recently?',
    expectedIntent: 'temporal',
    foundationPrimary: true,
    mustNotContain: ['Relevant past entries were found'],
  },
  {
    query: 'What else did I say in this conversation?',
    expectedIntent: 'conversation',
    foundationPrimary: true,
    mustNotContain: ['Relevant past entries were found'],
    mustContain: ['Ashley'],
    history: CONVERSATION_HISTORY,
  },
];

async function run(): Promise<void> {
  logger.info('=== SPRINT AF RECALL VALIDATION ===');

  logger.info('\n--- Phase 4: Coverage Report ---');
  const coverage = await buildRecallCoverageReport(MAIN_USER);
  for (const row of coverage) {
    logger.info({
      layer: row.layer,
      stored: row.stored ? '✅' : '❌',
      retrievable: row.retrievable ? '✅' : '❌',
      sample: row.sample,
    });
  }

  logger.info('\n--- Phase 1–3: Query Trace ---');
  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const syncIntent = detectSyncRecallIntent(tc.query);
    const history = tc.history ?? [];
    const result = await routeRecallQuery(MAIN_USER, tc.query, history);
    const block = result.contextBlock;

    const intentMatch = result.intent === tc.expectedIntent;
    const primaryMatch = result.foundationPrimary === tc.foundationPrimary;
    const bannedOk = (tc.mustNotContain ?? []).every((s) => !block.includes(s));
    const requiredOk = (tc.mustContain ?? []).every((s) => block.includes(s));
    const ok = intentMatch && primaryMatch && bannedOk && requiredOk;

    if (ok) passed++;
    else failed++;

    logger.info({
      query: tc.query,
      syncIntent,
      expectedIntent: tc.expectedIntent,
      actualIntent: result.intent,
      foundationPrimary: result.foundationPrimary,
      intentMatch,
      primaryMatch,
      bannedOk,
      requiredOk,
      confidence: result.confidence,
      preview: block.slice(0, 300),
      PASS: ok ? '✅' : '❌',
    });
  }

  logger.info({ total: TEST_CASES.length, passed, failed }, '=== VALIDATION COMPLETE ===');
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  logger.error({ err }, 'Validation crashed');
  process.exit(1);
});
