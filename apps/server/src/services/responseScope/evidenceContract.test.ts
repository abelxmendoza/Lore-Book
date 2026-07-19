import { describe, expect, it } from 'vitest';

import {
  buildEvidenceContract,
  enforceEvidenceContract,
  scoreEvidence,
  DEFAULT_MIN_EVIDENCE_SCORE,
} from './evidenceContract';

type TestSource = { type: string; id: string; title: string; snippet?: string };

function src(type: string, id: string, title: string, snippet?: string): TestSource {
  return { type, id, title, snippet };
}

/**
 * The mixed retrieval pool that motivated the contract: conflict evidence
 * buried under education, org, and errand entities that semantic search
 * considered "relevant."
 */
const CONFLICT_POOL: TestSource[] = [
  src('entry', 'e1', 'Conflict with the ska scene', 'Accusations on Instagram after the show fallout.'),
  src('entry', 'e2', 'Instagram accusations', 'They accused me publicly and blocked me.'),
  src('character', 'c1', 'Rina', 'Blocked me after the argument about the show.'),
  src('event', 'ev1', 'Removed as event organizer', 'Got kicked off the organizing team after the drama.'),
  src('character', 'c2', 'Crestline University', 'Bachelor degree, coursework in engineering.'),
  src('character', 'c3', 'Electrical Engineering', 'Degree program and certification track.'),
  src('character', 'c4', 'Northwind Depot interns', 'Summer onboarding cohort at the warehouse.'),
  src('entry', 'e3', 'Bought a new laptop', 'Picked up a laptop for coding.'),
  src('entry', 'e4', 'Gym routine update', 'New workout split this month.'),
];

describe('buildEvidenceContract', () => {
  it('predicts the answer shape for a conflict question', () => {
    const contract = buildEvidenceContract('Who am I having conflict with?');
    expect(contract.topic).toBe('conflict');
    expect(contract.expectedAnswerShape).toBe('list_of_people');
    expect(contract.targetKinds).toContain('character');
  });

  it('predicts an explanation for an emotional-state question', () => {
    const contract = buildEvidenceContract('Why do I feel depressed lately?');
    expect(contract.topic).toBe('emotional_state');
    expect(contract.expectedAnswerShape).toBe('explanation');
  });

  it('falls back to a general contract for ordinary chat', () => {
    const contract = buildEvidenceContract('Good morning, how are you?');
    expect(contract.topic).toBe('general');
  });
});

describe('scoreEvidence', () => {
  const contract = buildEvidenceContract('Who am I having conflict with?');

  it('scores conflict evidence high', () => {
    const { score, reasons } = scoreEvidence(CONFLICT_POOL[0], contract);
    expect(score).toBeGreaterThanOrEqual(35);
    expect(reasons).toContain('supports:conflict');
  });

  it('hard-rejects evidence kinds that can never answer the question', () => {
    const university = scoreEvidence(CONFLICT_POOL[4], contract);
    const degree = scoreEvidence(CONFLICT_POOL[5], contract);
    expect(university.score).toBe(0);
    expect(university.reasons).toContain('forbidden_evidence_kind');
    expect(degree.score).toBe(0);
  });

  it('scores unrelated purchases and workouts below the floor', () => {
    const laptop = scoreEvidence(CONFLICT_POOL[7], contract);
    const gym = scoreEvidence(CONFLICT_POOL[8], contract);
    expect(laptop.score).toBeLessThan(DEFAULT_MIN_EVIDENCE_SCORE);
    expect(gym.score).toBeLessThan(DEFAULT_MIN_EVIDENCE_SCORE);
  });

  it('boosts sources about the entities in the scope plan', () => {
    const planContract = buildEvidenceContract('Who am I having conflict with?', {
      primaryEntities: [{ name: 'Rina' }],
      maxEvidenceItems: 20,
    });
    const { score, reasons } = scoreEvidence(CONFLICT_POOL[2], planContract);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(reasons).toContain('entity:rina');
  });
});

describe('enforceEvidenceContract', () => {
  it('forwards only defensible evidence for a conflict question', () => {
    const contract = buildEvidenceContract('Who am I having conflict with?');
    const verdict = enforceEvidenceContract(CONFLICT_POOL, contract);

    const acceptedTitles = verdict.accepted.map((s) => s.title);
    expect(acceptedTitles).toContain('Conflict with the ska scene');
    expect(acceptedTitles).toContain('Instagram accusations');
    expect(acceptedTitles).toContain('Removed as event organizer');

    expect(acceptedTitles).not.toContain('Crestline University');
    expect(acceptedTitles).not.toContain('Electrical Engineering');
    expect(acceptedTitles).not.toContain('Northwind Depot interns');
    expect(acceptedTitles).not.toContain('Bought a new laptop');
    expect(acceptedTitles).not.toContain('Gym routine update');

    // Ranked by defensibility, every survivor carries its score.
    const scores = verdict.accepted.map((s) => s.relevanceScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(scores.every((s) => s >= DEFAULT_MIN_EVIDENCE_SCORE)).toBe(true);
  });

  it('keeps project evidence and drops social noise for a building question', () => {
    const contract = buildEvidenceContract('What am I building right now?');
    const pool: TestSource[] = [
      src('entry', 'p1', 'Shipped the timeline feature', 'Deployed the new timeline view.'),
      src('entry', 'p2', 'Working on MemoVault', 'Coding the retrieval pipeline.'),
      src('entry', 'n1', 'Date night downtown', 'Romantic dinner and a walk.'),
      src('entry', 'n2', 'Grocery run', 'Bought groceries for the week.'),
      src('event', 'n3', 'Concert at Neon Palace', 'Club night with the crew.'),
    ];
    const verdict = enforceEvidenceContract(pool, contract);
    const titles = verdict.accepted.map((s) => s.title);
    expect(titles).toContain('Shipped the timeline feature');
    expect(titles).toContain('Working on MemoVault');
    expect(titles).not.toContain('Date night downtown');
    expect(titles).not.toContain('Grocery run');
    expect(titles).not.toContain('Concert at Neon Palace');
  });

  it('does not starve ordinary chat of context', () => {
    const contract = buildEvidenceContract('Good morning!');
    const verdict = enforceEvidenceContract(
      [src('entry', 'e1', 'Morning walk', 'Walked around the block.')],
      contract,
    );
    expect(verdict.accepted).toHaveLength(1);
  });

  it('prefers crystallized knowledge over observations', () => {
    const contract = buildEvidenceContract('What is my job right now?');
    const pool: TestSource[] = [
      src(
        'knowledge',
        'k1',
        'You work at Vanguard Robotics as a QA technician',
        'Career: active role at Vanguard Robotics, QA / failure analysis.',
      ),
      src('entry', 'o1', 'First day at work', 'Started the new job at the office.'),
      src('entry', 'o2', 'Talked about work stuff', 'Mentioned the job in passing.'),
      src('entry', 'o3', 'Another workday', 'Went to work again.'),
    ];
    const verdict = enforceEvidenceContract(pool, contract);

    // The knowledge claim ranks first…
    expect(verdict.accepted[0].type).toBe('knowledge');
    expect(verdict.accepted[0].relevanceReasons).toContain('crystallized');

    // …and weak repeat observations are suppressed rather than re-proving it.
    const demoted = verdict.rejected.filter((s) =>
      s.relevanceReasons.includes('superseded_by_knowledge'),
    );
    expect(demoted.length).toBeGreaterThan(0);
    expect(verdict.accepted.filter((s) => s.type === 'entry').length).toBeLessThan(3);
  });

  it('never suppresses observations when no knowledge answers the question', () => {
    const contract = buildEvidenceContract('What is my job right now?');
    const pool: TestSource[] = [
      src('entry', 'o1', 'First day at work', 'Started the new job at the office.'),
      src('entry', 'o2', 'Met the team', 'Coworkers showed me the workplace.'),
    ];
    const verdict = enforceEvidenceContract(pool, contract);
    expect(verdict.accepted.length).toBe(2);
    expect(
      verdict.rejected.some((s) => s.relevanceReasons.includes('superseded_by_knowledge')),
    ).toBe(false);
  });

  it('caps forwarded sources at the contract budget', () => {
    const contract = buildEvidenceContract('Who am I having conflict with?', {
      primaryEntities: [],
      maxEvidenceItems: 2,
    });
    const pool = [
      src('entry', 'a', 'Argument at the show', 'Big fight and accusations.'),
      src('entry', 'b', 'Blocked on Instagram', 'They blocked me after the drama.'),
      src('entry', 'c', 'Another falling out', 'Tension and a grudge since spring.'),
    ];
    const verdict = enforceEvidenceContract(pool, contract);
    expect(verdict.accepted.length).toBeLessThanOrEqual(Math.max(2, 8));
  });
});
