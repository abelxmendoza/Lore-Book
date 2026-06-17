/**
 * Chat Memory Utilization Audit
 *
 * Measures Working Memory Assembler coverage: for a representative set of
 * questions, how often does each memory class actually enter the packet?
 *
 * Usage:
 *   tsx src/scripts/chatMemoryUtilizationAudit.ts [userId]
 *   (defaults to ADMIN_USER_ID / RECALL_TEST_USER_ID)
 *
 * Reports zero-retrieval rates per class so the Working Memory Completion Sprint
 * has before/after numbers (Phase 6).
 */
import '../config';
import { assembleWorkingMemory } from '../services/chat/workingMemoryAssembler';

type Expect = 'event' | 'relationship' | 'goal' | 'skill' | 'project' | 'community' | 'person' | 'review';

const QUESTIONS: Array<{ q: string; expect: Expect }> = [
  // Event-shaped
  { q: 'what happened at the graduation party?', expect: 'event' },
  { q: 'tell me about my Amazon onboarding', expect: 'event' },
  { q: 'what did I do over Memorial Day weekend?', expect: 'event' },
  { q: 'what happened during the breakup?', expect: 'event' },
  { q: 'what went on at Club Metro?', expect: 'event' },
  // Relationship-shaped
  { q: 'what do you remember about Tía Grace?', expect: 'relationship' },
  { q: 'who do I live with?', expect: 'relationship' },
  { q: 'what is my relationship with Kelly?', expect: 'relationship' },
  { q: 'how am I related to Abuela?', expect: 'relationship' },
  // Community-shaped
  { q: 'what communities am I part of?', expect: 'community' },
  { q: 'what communities matter to me?', expect: 'community' },
  // Goal-shaped
  { q: 'what are my goals right now?', expect: 'goal' },
  { q: 'am I making progress toward my goals?', expect: 'goal' },
  { q: 'what do I want to achieve this year?', expect: 'goal' },
  // Skill-shaped
  { q: 'what skills am I building?', expect: 'skill' },
  { q: 'what am I good at?', expect: 'skill' },
  { q: 'am I improving at coding?', expect: 'skill' },
  // Project-shaped
  { q: 'how is LoreBook progressing?', expect: 'project' },
  { q: 'what is the status of my projects?', expect: 'project' },
  // Person / review
  { q: 'what do you know about James?', expect: 'person' },
  { q: "what have I been doing lately?", expect: 'review' },
  { q: 'what kind of person am I?', expect: 'review' },
];

async function main() {
  const userId = process.argv[2] || process.env.ADMIN_USER_ID || process.env.RECALL_TEST_USER_ID;
  if (!userId) {
    console.error('No userId — pass as arg or set ADMIN_USER_ID');
    process.exit(1);
  }

  const counters = {
    events: 0, relationships: 0, goals: 0, skills: 0, projects: 0, communities: 0, episodes: 0,
  };
  const rows: string[] = [];

  for (const { q, expect } of QUESTIONS) {
    const a = await assembleWorkingMemory({ question: q, userId });
    const n = {
      events: a.events.length,
      relationships: a.relationships.length,
      goals: a.goals.length,
      skills: a.skills.length,
      projects: a.projects.length,
      communities: a.communities.length,
      episodes: a.episodes.length,
    };
    if (n.events > 0) counters.events++;
    if (n.relationships > 0) counters.relationships++;
    if (n.goals > 0) counters.goals++;
    if (n.skills > 0) counters.skills++;
    if (n.projects > 0) counters.projects++;
    if (n.communities > 0) counters.communities++;
    if (n.episodes > 0) counters.episodes++;
    rows.push(
      `[${expect.padEnd(12)}] ${q.slice(0, 46).padEnd(46)} → intent=${a.intent.padEnd(16)} ev=${n.events} rel=${n.relationships} goal=${n.goals} skill=${n.skills} proj=${n.projects} comm=${n.communities} ep=${n.episodes}`
    );
  }

  const total = QUESTIONS.length;
  const pct = (c: number) => `${Math.round((c / total) * 100)}%`;
  const zero = (c: number) => `${Math.round(((total - c) / total) * 100)}%`;

  console.log('\n=== Per-question ===');
  rows.forEach((r) => console.log(r));
  console.log('\n=== Coverage (non-zero retrieval rate across all questions) ===');
  console.log(`events:        ${pct(counters.events)}  (zero-event:        ${zero(counters.events)})`);
  console.log(`relationships: ${pct(counters.relationships)}  (zero-relationship: ${zero(counters.relationships)})`);
  console.log(`goals:         ${pct(counters.goals)}`);
  console.log(`skills:        ${pct(counters.skills)}`);
  console.log(`projects:      ${pct(counters.projects)}`);
  console.log(`communities:   ${pct(counters.communities)}`);
  console.log(`episodes:      ${pct(counters.episodes)}`);
  console.log(`\nuserId=${userId} questions=${total}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
