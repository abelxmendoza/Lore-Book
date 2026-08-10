import { describe, expect, it } from 'vitest';

import type { BiographyOutput } from '../../src/services/biographyFoundationService';
import {
  compileIdentitySnapshot,
  composeIdentityRecall,
  type IdentitySnapshotInputs,
} from '../../src/services/identitySnapshot';
import type { NarrativeIR } from '../../src/services/narrative/types';
import type { ProjectRow } from '../../src/services/projectService';
import type { Skill } from '../../src/services/skills/skillService';

const NOW = '2026-08-08T12:00:00.000Z';

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'project-memovault',
    user_id: 'synthetic-user',
    name: 'MemoVault',
    normalized_name: 'memovault',
    type: 'software',
    status: 'active',
    description: 'Building an explainable personal memory platform',
    summary: null,
    tags: ['AI', 'product'],
    metadata: {},
    importance_score: 0.95,
    associated_character_ids: null,
    associated_location_ids: null,
    started_at: '2025-01-01',
    ended_at: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2026-08-07T00:00:00.000Z',
    ...overrides,
  };
}

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-robotics',
    user_id: 'synthetic-user',
    skill_name: 'Robotics engineering',
    skill_category: 'technical',
    current_level: 5,
    total_xp: 900,
    xp_to_next_level: 200,
    description: null,
    first_mentioned_at: '2024-01-01T00:00:00.000Z',
    last_practiced_at: '2026-08-06T00:00:00.000Z',
    practice_count: 14,
    auto_detected: false,
    confidence_score: 0.92,
    is_active: true,
    metadata: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

function inputs(): IdentitySnapshotInputs {
  const biography = {
    facts: {
      identity: {
        name: 'Marcus Vale',
        location: 'Pasadena',
        education: 'Computer Science graduate',
        employment: 'Robotics engineer',
        sourceEntryIds: ['entry-1'],
      },
      relationships: [],
      keyEvents: [],
      livingSituation: null,
      upcomingEvents: [],
      sourceEntryCount: 10,
    },
    themes: [],
    periods: [],
    snapshot: '',
    snapshotWordCount: 0,
    generatedAt: NOW,
    sourceEntryIds: ['entry-1'],
    timelineEventIds: [],
    characterIds: [],
    relationshipIds: [],
    provenance: {},
    stale: false,
  } satisfies BiographyOutput;

  const narrative = {
    generatedAt: NOW,
    currentChapter: {
      title: 'Engineering Rebuild and Creative Launch',
      summary: 'Rebuilding a robotics career while shipping MemoVault and releasing music.',
      startDate: '2026-01-01',
      endDate: null,
      dominantTheme: 'reinvention',
      confidence: 0.9,
      evidenceCount: 6,
      evidence: [],
      storyState: 'confirmed',
    },
    activeArcs: [
      {
        id: 'arc-career',
        title: 'Vanguard Robotics Career',
        category: 'career',
        status: 'growing',
        momentum: 'positive',
        confidence: 0.91,
        score: 0.9,
        evidence: [],
        storyState: 'confirmed',
        startDate: '2024-01-01',
        latestActivity: '2026-08-07',
      },
      {
        id: 'arc-music',
        title: 'Music Release Practice',
        category: 'creative',
        status: 'growing',
        momentum: 'positive',
        confidence: 0.86,
        score: 0.82,
        evidence: [],
        storyState: 'confirmed',
        startDate: '2026-02-01',
        latestActivity: '2026-08-05',
      },
    ],
    dormantArcs: [],
    conflicts: [],
    goals: [
      { id: 'goal-role', title: 'Land the next robotics role', status: 'active' },
      { id: 'goal-release', title: 'Release the next music single', status: 'in_progress' },
    ],
    projects: [],
    relationships: [],
    communities: [],
    turningPoints: [],
    scenes: [],
    timeline: [],
    family: { householdCount: 0, memberCount: 0, groupCount: 0 },
    evidence: [],
    provenance: { confidence: 0.88, signalInventory: {}, why: 'Synthetic evidence' },
  } satisfies NarrativeIR;

  return {
    userId: 'synthetic-user',
    generatedAt: NOW,
    biography,
    narrative,
    projects: [
      project(),
      project({
        id: 'org-fallback',
        name: 'Vanguard Robotics',
        metadata: { source: 'organizations_fallback' },
      }),
    ],
    skills: [
      skill(),
      skill({
        id: 'skill-music',
        skill_name: 'Music production',
        skill_category: 'creative',
        confidence_score: 0.88,
      }),
      skill({ id: 'skill-noise', skill_name: 'Possible hobby', confidence_score: 0.2 }),
    ],
    card: {
      name: 'Marcus Vale',
      currentChapter: { label: 'Old fallback chapter', evidence: [] },
      topThemes: [],
      keyPeople: [
        { name: 'Jamie Chen', relationship: 'friend', status: 'active' },
        { name: "Tio Ralph's", relationship: 'place', status: 'active' },
        { name: 'Organizations Book', relationship: 'app surface', status: 'active' },
      ],
      currentFocus: ['Ship MemoVault beta'],
      recentDevelopments: [],
      lastUpdated: NOW,
      hasEnoughData: true,
    },
  };
}

describe('Identity Snapshot projection', () => {
  it('preserves dominant technical, mission, and creative identity threads', () => {
    const snapshot = compileIdentitySnapshot(inputs());

    expect(snapshot.currentChapter?.title).toBe('Engineering Rebuild and Creative Launch');
    expect(snapshot.threads.map(thread => thread.domain)).toEqual(
      expect.arrayContaining(['career', 'projects', 'creativity']),
    );
    expect(snapshot.threads.find(thread => thread.domain === 'projects')?.name).toBe('MemoVault');
    expect(snapshot.goals.map(goal => goal.title)).toContain('Land the next robotics role');
  });

  it('rejects fallback organizations, low-certainty skills, and non-people', () => {
    const snapshot = compileIdentitySnapshot(inputs());

    expect(snapshot.threads.flatMap(thread => thread.supportingEvidence).map(item => item.label))
      .not.toContain('Vanguard Robotics');
    expect(snapshot.importantPeople.map(person => person.name)).toEqual(['Jamie Chen']);
    expect(snapshot.provenance.rejectedCounts).toMatchObject({
      organization_fallback_projects: 1,
      low_certainty_or_inactive_skills: 1,
      wrong_domain_people: 2,
    });
  });

  it('is stable for the same graph revision and exposes honest coverage', () => {
    const first = compileIdentitySnapshot(inputs());
    const second = compileIdentitySnapshot(inputs());

    expect(first.id).toBe(second.id);
    expect(first.graphRevision).toBe(second.graphRevision);
    expect(first.coverage.find(item => item.domain === 'career')?.band).not.toBe('unknown');
    expect(first.coverage.find(item => item.domain === 'health')?.band).toBe('unknown');
  });

  it('composes a concise identity answer without leaking storage diagnostics', () => {
    const answer = composeIdentityRecall(compileIdentitySnapshot(inputs()));

    expect(answer).toContain('Robotics');
    expect(answer).toContain('MemoVault');
    expect(answer).toContain('Creative');
    expect(answer).toContain('Land the next robotics role');
    expect(answer.split(/\s+/).length).toBeLessThan(260);
    expect(answer).not.toMatch(/graph revision|algorithm version|database|no identity profile/i);
  });
});
