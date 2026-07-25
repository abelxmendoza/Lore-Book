import { describe, expect, it } from 'vitest';

import {
  buildContextualKnowledgeBundle,
  isUnsafeTherapyDiagnosisClaim,
} from './contextualKnowledgeBundle';

const MULTI_THREAD_DAY = `
I want to tell you about Jamie, Marcus's Social Worker, someone new in my life.
yeah thats Marcus's Social Worker Support Team
a bunch of women came in and talked with Marcus in the living room
This was my first time ever creating a DistroKid account and uploading my new song "Northwind Hymn" as MemoVault, trying to get it on Spotify
an agency recruiting for Rivian did a phone call and a video call
yeah and now im working on Lorebook again
It's nice to see him have a team. I kind of feel like I need something like that too.
Maybe I do need a therapist or something lmao.
but it may be a waste of time for someone as busy and ambitious as me.
Thats also why Im building Lorebook too, but nothing beats real people.
`.trim();

describe('buildContextualKnowledgeBundle', () => {
  it('decomposes person intro without role-contaminated canonical name', () => {
    const bundle = buildContextualKnowledgeBundle(MULTI_THREAD_DAY);
    const person = bundle.introducedEntities[0];
    expect(person?.canonicalName).toBe('Jamie');
    expect(person?.rolePhrase).toBe('social worker');
    expect(person?.supportsAnchor).toBe('Marcus');
    expect(person?.canonicalName).not.toMatch(/social worker/i);
  });

  it('captures user-authored care team naming', () => {
    const bundle = buildContextualKnowledgeBundle(MULTI_THREAD_DAY);
    expect(bundle.groupProposals[0]?.canonicalName).toMatch(/Social Worker Support Team/i);
    expect(bundle.groupProposals[0]?.groupType).toBe('care_team');
  });

  it('segments milestones and keeps Spotify publication uncertain', () => {
    const bundle = buildContextualKnowledgeBundle(MULTI_THREAD_DAY);
    const distro = bundle.eventProposals.find((e) => /DistroKid|distribution|Uploaded/i.test(e.title));
    expect(distro).toBeTruthy();
    expect(distro?.isMilestone || bundle.eventProposals.some((e) => e.isMilestone)).toBe(true);
    const upload = bundle.eventProposals.find((e) => e.publicationUncertain);
    expect(upload?.intendedPlatforms).toContain('Spotify');
  });

  it('preserves reflection modality and ambition conflict', () => {
    const bundle = buildContextualKnowledgeBundle(MULTI_THREAD_DAY);
    expect(bundle.reflectionProposals.some((r) => r.insight === 'NEED_FOR_SUPPORT')).toBe(true);
    expect(bundle.reflectionProposals.some((r) => r.insight === 'AMBITION_VS_SUPPORT')).toBe(true);
    expect(bundle.reflectionProposals.some((r) => r.insight === 'TECHNOLOGY_VS_HUMAN_CONNECTION')).toBe(true);
    expect(
      bundle.reflectionProposals.some(
        (r) => r.modality === 'JOKING_BUT_MEANINGFUL' || r.modality === 'CONSIDERING',
      ),
    ).toBe(true);
  });

  it('response plan mentions structured threads and avoids diagnosis', () => {
    const bundle = buildContextualKnowledgeBundle(MULTI_THREAD_DAY);
    const plan = bundle.responsePlan;
    expect(plan.acknowledgedIntroductions.join(' ')).toMatch(/Jamie/);
    expect(plan.promptBlock).toMatch(/Marcus's Social Worker Support Team|care_team/i);
    expect(plan.avoidedClaims.some((c) => /therapy/i.test(c))).toBe(true);
    expect(plan.promptBlock).toMatch(/Do NOT open with generic encouragement/i);
    expect(plan.highlightedMilestones.length).toBeGreaterThan(0);
    expect(plan.responseMode).toBe('MIXED');
  });

  it('does not invent placeholder people for unnamed visitors', () => {
    const bundle = buildContextualKnowledgeBundle(MULTI_THREAD_DAY);
    const visit = bundle.eventProposals.find((e) => e.kind === 'care_visit');
    expect(visit?.unresolvedParticipantCount).toBeGreaterThan(0);
    expect(bundle.introducedEntities.every((e) => !/Social Worker \d/i.test(e.canonicalName))).toBe(true);
  });
});

describe('isUnsafeTherapyDiagnosisClaim', () => {
  it('flags diagnosis-shaped claims but not vague support needs', () => {
    expect(isUnsafeTherapyDiagnosisClaim('Abel needs a therapist')).toBe(true);
    expect(isUnsafeTherapyDiagnosisClaim('I need something like that too')).toBe(false);
  });
});
