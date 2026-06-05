/**
 * RECALL VALIDATION — Sprint G
 *
 * Runs 6 test queries against the recall router and shows:
 * - Detected intent
 * - Retrieved context block
 * - Whether expected data is present
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/validateRecall.ts
 */

import { routeRecallQuery } from '../services/chat/recallQueryRouter';
import { logger } from '../logger';

const MAIN_USER = '789bd607-e063-466f-a9ef-f68d24e8bb57';

const TEST_CASES: Array<{
  query: string;
  expectedIntent: string;
  expectedKeywords: string[];
}> = [
  {
    query: 'What do you know about me?',
    expectedIntent: 'biography',
    expectedKeywords: ['Abel', 'Anaheim', 'unemployed', 'Sol', 'Abuela'],
  },
  {
    query: 'What happened with Sol?',
    expectedIntent: 'entity',
    expectedKeywords: ['Sol', 'romantic', 'blocked', 'Instagram'],
  },
  {
    query: 'Tell me about Abuela.',
    expectedIntent: 'entity',
    expectedKeywords: ['Abuela', 'family', 'Costco'],
  },
  {
    query: 'Where do I live?',
    expectedIntent: 'location',
    expectedKeywords: ['Anaheim'],
  },
  {
    query: 'What am I working on?',
    expectedIntent: 'work',
    expectedKeywords: ['unemployed', 'Epirus'],
  },
  {
    query: 'What happened recently?',
    expectedIntent: 'temporal',
    expectedKeywords: ['relationship', 'career'],
  },
];

async function run(): Promise<void> {
  logger.info('=== RECALL VALIDATION START ===');

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const result = await routeRecallQuery(MAIN_USER, tc.query, []);
    const block = result.contextBlock.toLowerCase();

    const intentMatch = result.intent === tc.expectedIntent;
    const keywordResults = tc.expectedKeywords.map(kw => ({
      keyword: kw,
      found: block.includes(kw.toLowerCase()),
    }));
    const allKeywordsFound = keywordResults.every(r => r.found);
    const ok = intentMatch && allKeywordsFound;

    if (ok) passed++;
    else failed++;

    logger.info({
      query: tc.query,
      expectedIntent: tc.expectedIntent,
      actualIntent: result.intent,
      intentMatch,
      keywords: keywordResults,
      confidence: result.confidence,
      contextLength: result.contextBlock.length,
      preview: result.contextBlock.slice(0, 200),
      PASS: ok ? '✅' : '❌',
    }, ok ? `✅ PASS: ${tc.query}` : `❌ FAIL: ${tc.query}`);
  }

  logger.info({
    total: TEST_CASES.length,
    passed,
    failed,
    score: `${passed}/${TEST_CASES.length}`,
  }, '=== RECALL VALIDATION COMPLETE ===');
}

run().catch(err => {
  logger.error({ err }, 'Validation crashed');
  process.exit(1);
});
