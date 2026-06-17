#!/usr/bin/env tsx
/**
 * Query Classification Audit — confusion matrix for WMA intent routing.
 *
 * Run:
 *   npx tsx apps/server/scripts/queryClassificationAudit.ts
 */
import { classifyIntentForAudit } from '../src/services/chat/workingMemoryAssembler';
import { config } from '../src/config';
import { supabaseAdmin } from '../src/services/supabaseClient';

type ExpectedIntent =
  | 'GOAL_QUERY'
  | 'PROJECT_QUERY'
  | 'SKILL_QUERY'
  | 'COMMUNITY_QUERY'
  | 'RELATIONSHIP_QUERY'
  | 'PERSON_QUERY'
  | 'EVENT_QUERY'
  | 'LIFE_REVIEW'
  | 'IDENTITY_QUERY';

const TEST_CASES: Array<{ q: string; expected: ExpectedIntent }> = [
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

async function main() {
  await resolveFounderId(); // warm env
  console.log('\n=== Query Classification Audit ===\n');

  const matrix = new Map<string, number>();
  let correct = 0;
  const misroutes: string[] = [];

  for (const { q, expected } of TEST_CASES) {
    const actual = classifyIntentForAudit(q);
    const key = `${expected} → ${actual}`;
    matrix.set(key, (matrix.get(key) ?? 0) + 1);
    if (actual === expected) {
      correct += 1;
    } else {
      misroutes.push(`  ✗ "${q}"\n      expected ${expected}, got ${actual}`);
    }
  }

  console.log(`Accuracy: ${correct}/${TEST_CASES.length} (${Math.round((correct / TEST_CASES.length) * 100)}%)\n`);

  if (misroutes.length) {
    console.log('Misroutes:');
    misroutes.forEach((line) => console.log(line));
    console.log('');
  }

  console.log('Confusion matrix (expected → actual):');
  for (const [key, count] of [...matrix.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
