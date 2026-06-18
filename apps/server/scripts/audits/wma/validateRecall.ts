/**
 * Recall router validation — foundation recall coverage + query trace.
 */
import { routeRecallQuery, buildRecallCoverageReport } from '../../../src/services/chat/recallQueryRouter';
import { detectSyncRecallIntent } from '../../../src/services/chat/recallIntentPatterns';
import { logger } from '../../../src/logger';
import { requireUserIds } from '../../lib/auditCommon';

export const RECALL_CONVERSATION_HISTORY = [
  { role: 'user', content: 'Alex Morgan was 19. We met after a downtown lounge and spent the evening together.' },
  { role: 'assistant', content: 'Got it — I will remember Alex.' },
];

export const RECALL_TEST_CASES: Array<{
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
  { query: 'Recall everything about me', expectedIntent: 'biography', foundationPrimary: true },
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
  { query: 'Tell me about Sam', expectedIntent: 'entity', foundationPrimary: true },
  { query: 'Tell me about Grandma Rose', expectedIntent: 'entity', foundationPrimary: true },
  {
    query: 'Who is Alex Morgan?',
    expectedIntent: 'entity',
    foundationPrimary: true,
    mustNotContain: ['Relevant past entries were found'],
    mustContain: ['Alex'],
  },
  {
    query: 'Who is Uncle James?',
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
    mustContain: ['Alex'],
    history: RECALL_CONVERSATION_HISTORY,
  },
];

export async function runValidateRecallAudit(argv: string[] = []): Promise<{ passed: number; failed: number }> {
  const [userId] = requireUserIds(
    argv,
    ['RECALL_TEST_USER_ID', 'TARGET_USER_ID'],
    'Required: RECALL_TEST_USER_ID or TARGET_USER_ID (or --user-id <uuid>)',
  );

  logger.info('=== SPRINT AF RECALL VALIDATION ===');
  logger.info('\n--- Phase 4: Coverage Report ---');
  const coverage = await buildRecallCoverageReport(userId);
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

  for (const tc of RECALL_TEST_CASES) {
    const syncIntent = detectSyncRecallIntent(tc.query);
    const history = tc.history ?? [];
    const result = await routeRecallQuery(userId, tc.query, history);
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

  logger.info({ total: RECALL_TEST_CASES.length, passed, failed }, '=== VALIDATION COMPLETE ===');
  if (failed > 0) throw new Error(`Recall validation failed: ${failed}/${RECALL_TEST_CASES.length} cases`);
  return { passed, failed };
}
