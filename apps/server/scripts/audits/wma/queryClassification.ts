/**
 * Query classification audit — WMA intent routing confusion matrix.
 */
import { classifyIntentForAudit } from '../../../src/services/chat/workingMemoryAssembler';
import { resolveFounderId } from '../../lib/auditCommon';

export type ExpectedIntent =
  | 'GOAL_QUERY'
  | 'PROJECT_QUERY'
  | 'SKILL_QUERY'
  | 'COMMUNITY_QUERY'
  | 'RELATIONSHIP_QUERY'
  | 'PERSON_QUERY'
  | 'EVENT_QUERY'
  | 'LIFE_REVIEW'
  | 'IDENTITY_QUERY';

export const QUERY_CLASSIFICATION_CASES: Array<{ q: string; expected: ExpectedIntent }> = [
  { q: 'What are my goals?', expected: 'GOAL_QUERY' },
  { q: 'What are my current goals?', expected: 'GOAL_QUERY' },
  { q: 'Am I making progress toward my goals?', expected: 'GOAL_QUERY' },
  { q: 'What projects am I working on?', expected: 'PROJECT_QUERY' },
  { q: 'What is the status of my projects?', expected: 'PROJECT_QUERY' },
  { q: 'How is LoreBook progressing?', expected: 'PROJECT_QUERY' },
  { q: 'What skills do I have?', expected: 'SKILL_QUERY' },
  { q: 'What skills define me?', expected: 'SKILL_QUERY' },
  { q: 'What am I good at?', expected: 'SKILL_QUERY' },
  { q: 'What communities am I part of?', expected: 'COMMUNITY_QUERY' },
  { q: 'What communities matter to me?', expected: 'COMMUNITY_QUERY' },
  { q: 'Who are my gym people?', expected: 'COMMUNITY_QUERY' },
  { q: 'Who lives with me?', expected: 'RELATIONSHIP_QUERY' },
  { q: 'Summarize what you know about my family', expected: 'RELATIONSHIP_QUERY' },
  { q: 'Who is Andrew?', expected: 'PERSON_QUERY' },
  { q: 'What happened last summer?', expected: 'EVENT_QUERY' },
  { q: 'What have I been doing lately?', expected: 'LIFE_REVIEW' },
  { q: 'Who am I?', expected: 'IDENTITY_QUERY' },
];

export function runQueryClassificationMatrix(cases = QUERY_CLASSIFICATION_CASES) {
  const matrix = new Map<string, number>();
  let correct = 0;
  const misroutes: string[] = [];

  for (const { q, expected } of cases) {
    const actual = classifyIntentForAudit(q);
    const key = `${expected} → ${actual}`;
    matrix.set(key, (matrix.get(key) ?? 0) + 1);
    if (actual === expected) correct += 1;
    else misroutes.push(`  ✗ "${q}"\n      expected ${expected}, got ${actual}`);
  }

  return {
    total: cases.length,
    correct,
    accuracyPct: Math.round((correct / cases.length) * 100),
    matrix: Object.fromEntries([...matrix.entries()].sort()),
    misroutes,
  };
}

export async function runQueryClassificationAudit(): Promise<ReturnType<typeof runQueryClassificationMatrix>> {
  await resolveFounderId();
  console.log('\n=== Query Classification Audit ===\n');

  const result = runQueryClassificationMatrix();
  console.log(`Accuracy: ${result.correct}/${result.total} (${result.accuracyPct}%)\n`);

  if (result.misroutes.length) {
    console.log('Misroutes:');
    result.misroutes.forEach((line) => console.log(line));
    console.log('');
  }

  console.log('Confusion matrix (expected → actual):');
  for (const [key, count] of Object.entries(result.matrix)) {
    console.log(`  ${key}: ${count}`);
  }
  console.log('');
  return result;
}
