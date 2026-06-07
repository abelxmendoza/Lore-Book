/**
 * Experiment V4/V5: before/after comparison of injecting high-confidence
 * event_candidates (continuity_strength >= 0.60) into the narrative atom pool.
 *
 * Builds two atom pools for the same user — "before" (timeline atoms only,
 * today's behavior) and "after" (timeline atoms + event-candidate atoms) —
 * then runs the engine's real `filterAtoms` against a battery of specs that
 * mirror common lorebook queries, measuring:
 *   - atom count
 *   - distinct people surfaced
 *   - average significance / emotional weight
 *   - how many "No atoms found matching specification" cases flip to success
 *
 * Read-only with respect to generated content — does not call the LLM, does
 * not write biographies. Pure atom-pool comparison (where the actual effect
 * of the injection lives).
 *
 * Usage: npx tsx scripts/compare-event-candidate-injection.ts
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');
dotenv.config({ path: resolve(rootDir, '.env') });
dotenv.config({ path: resolve(rootDir, '.env.development') });

import { biographyGenerationEngine } from '../src/services/biographyGeneration';
import { buildAtomsFromTimeline, buildAtomsFromEventCandidates } from '../src/services/biographyGeneration/narrativeAtomBuilder';
import type { BiographySpec, NarrativeAtom, NarrativeGraph } from '../src/services/biographyGeneration/types';

const USER_ID = '789bd607-e063-466f-a9ef-f68d24e8bb57';

// engine internals are private — reach in for the exact filtering logic used in production
const engineAny = biographyGenerationEngine as any;

function buildGraph(atoms: NarrativeAtom[]): NarrativeGraph {
  return {
    atoms,
    edges: engineAny.buildEdges(atoms),
    index: engineAny.buildIndex(atoms),
    lastUpdated: new Date().toISOString(),
  };
}

function summarize(label: string, atoms: NarrativeAtom[]) {
  const people = new Set<string>();
  atoms.forEach(a => (a.peopleIds || []).forEach(p => people.add(p)));
  const avgSig = atoms.length ? atoms.reduce((s, a) => s + a.significance, 0) / atoms.length : 0;
  const avgEmo = atoms.length ? atoms.reduce((s, a) => s + a.emotionalWeight, 0) / atoms.length : 0;
  const fromCandidates = atoms.filter(a => a.metadata?.source === 'event_candidate');
  console.log(`  [${label}] atoms=${atoms.length} distinctPeople=${people.size} avgSignificance=${avgSig.toFixed(2)} avgEmotionalWeight=${avgEmo.toFixed(2)} fromEventCandidates=${fromCandidates.length}`);
  return { count: atoms.length, people: people.size, avgSig, avgEmo, fromCandidates: fromCandidates.length };
}

const SPECS: { name: string; spec: BiographySpec }[] = [
  { name: 'full_life / detailed', spec: { scope: 'full_life', tone: 'reflective', depth: 'detailed', audience: 'self' } as BiographySpec },
  { name: 'domain: family', spec: { scope: 'domain', domain: 'family', tone: 'reflective', depth: 'detailed', audience: 'self' } as BiographySpec },
  { name: 'domain: relationships', spec: { scope: 'domain', domain: 'relationships', tone: 'reflective', depth: 'detailed', audience: 'self' } as BiographySpec },
  { name: 'domain: personal', spec: { scope: 'domain', domain: 'personal', tone: 'reflective', depth: 'summary', audience: 'self' } as BiographySpec },
  { name: 'thematic: "abuela"', spec: { scope: 'thematic', themes: ['abuela'], tone: 'reflective', depth: 'detailed', audience: 'self' } as BiographySpec },
  { name: 'thematic: "family"', spec: { scope: 'thematic', themes: ['family'], tone: 'reflective', depth: 'detailed', audience: 'self' } as BiographySpec },
  { name: 'time_range: Jun 2026', spec: { scope: 'time_range', timeRange: { start: '2026-06-01', end: '2026-06-30' }, tone: 'reflective', depth: 'detailed', audience: 'self' } as BiographySpec },
];

async function main() {
  console.log(`Building BEFORE pool (timeline atoms only) for user ${USER_ID}...`);
  const beforeAtoms = await buildAtomsFromTimeline(USER_ID);
  const beforeGraph = buildGraph(beforeAtoms);

  console.log(`Building AFTER pool (timeline + event_candidate atoms, strength >= 0.60)...`);
  const candidateAtoms = await buildAtomsFromEventCandidates(USER_ID);
  const afterAtoms = [...beforeAtoms, ...candidateAtoms];
  const afterGraph = buildGraph(afterAtoms);

  console.log(`\n=== POOL TOTALS ===`);
  summarize('BEFORE', beforeAtoms);
  summarize('AFTER ', afterAtoms);
  console.log(`  injected atoms:`);
  candidateAtoms.forEach(a => console.log(`    - "${a.content}" (significance=${a.significance.toFixed(2)}, people=${(a.peopleIds || []).length})`));

  console.log(`\n=== PER-SPEC FILTER COMPARISON (engine.filterAtoms, real production logic) ===`);
  let flips = 0;
  for (const { name, spec } of SPECS) {
    const beforeFiltered: NarrativeAtom[] = engineAny.filterAtoms(beforeGraph, spec);
    const afterFiltered: NarrativeAtom[] = engineAny.filterAtoms(afterGraph, spec);
    const beforeFails = beforeFiltered.length === 0;
    const afterFails = afterFiltered.length === 0;
    const flipped = beforeFails && !afterFails;
    if (flipped) flips++;
    console.log(`\n  Spec: ${name}`);
    console.log(`    BEFORE: ${beforeFiltered.length === 0 ? 'NO ATOMS FOUND (would throw)' : `${beforeFiltered.length} atoms`}`);
    console.log(`    AFTER:  ${afterFiltered.length === 0 ? 'NO ATOMS FOUND (would throw)' : `${afterFiltered.length} atoms`}${flipped ? '  <-- FLIPPED TO SUCCESS' : ''}`);
    if (afterFiltered.length > 0) {
      const candCount = afterFiltered.filter(a => a.metadata?.source === 'event_candidate').length;
      if (candCount > 0) console.log(`    AFTER includes ${candCount} event-candidate atom(s) in the surfaced set`);
    }
  }

  console.log(`\n=== V5 KEY METRIC ===`);
  console.log(`  Specs that flip from "No atoms found matching specification" to success: ${flips} / ${SPECS.length}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
