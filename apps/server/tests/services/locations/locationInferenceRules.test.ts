import { describe, it, expect } from 'vitest';

import { locationInferenceService } from '../../../src/services/locations/inference/locationInferenceService';
import { isBrokenResidenceSpan } from '../../../src/services/locations/inference/privateResidenceInference';
import { isBareGenericPlace } from '../../../src/services/locations/inference/namedPlaceInference';
import { isBareSchoolLabel } from '../../../src/services/locations/inference/schoolPlaceInference';

function infer(text: string, extra: Parameters<typeof locationInferenceService.inferFromMessage>[0] = {}) {
  return locationInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findAccepted(result: ReturnType<typeof infer>, namePart: string) {
  return result.accepted.find((c) =>
    c.displayName.toLowerCase().includes(namePart.toLowerCase()),
  );
}

describe('location inference rules', () => {
  it('detects Bad Dogg Compound as venue', () => {
    const result = infer('There were a lot of people that day at Bad Dogg Compound.');
    const venue = findAccepted(result, 'Bad Dogg Compound');
    expect(venue).toBeDefined();
    expect(venue!.locationType).toMatch(/event_space|music_venue/);
  });

  it('detects Walmart as store', () => {
    const result = infer('My Abuela wanted me to take her to Walmart.');
    const walmart = findAccepted(result, 'Walmart');
    expect(walmart).toBeDefined();
    expect(walmart!.locationType).toBe('store');
  });

  it('detects CSUF as university', () => {
    const result = infer("CSUF weren't learning in classes.");
    const csuf = findAccepted(result, 'CSUF');
    expect(csuf).toBeDefined();
    expect(csuf!.locationType).toMatch(/university|campus|school/);
    expect(result.accepted.some((c) => /weren/i.test(c.displayName))).toBe(false);
  });

  it("detects Tio Ralph's house as private residence", () => {
    const result = infer(
      "Yesterday was my cousin Leslie's Graduation Party at my Tio Ralph's house.",
    );
    const residence = findAccepted(result, "Tio Ralph");
    expect(residence).toBeDefined();
    expect(residence!.locationType).toMatch(/private_residence|family_home/);
    expect(residence!.ownerDisplayName).toMatch(/Tio Ralph/i);
    expect(residence!.context.privacySensitive).toBe(true);
    expect(residence!.requiresReview).toBe(true);
  });

  it("rejects 's House", () => {
    expect(isBrokenResidenceSpan("'s House")).toBe(true);
    const result = infer("We stayed at 's House by mistake.");
    expect(result.accepted.some((c) => c.displayName.startsWith("'s"))).toBe(false);
  });

  it('rejects Sol in a few weeks as place', () => {
    const result = infer("I haven't talked to Sol in a few weeks.");
    expect(result.accepted.some((c) => /sol in a few weeks/i.test(c.displayName))).toBe(false);
    expect(result.accepted.some((c) => c.displayName === 'Sol')).toBe(false);
  });

  it('splits LA and Oscuri — only LA is a place', () => {
    const result = infer("It's actually here in LA and Oscuri.dad is her boyfriend.");
    expect(result.accepted.some((c) => c.displayName === 'LA')).toBe(true);
    expect(result.accepted.some((c) => /oscuro|oscouri/i.test(c.displayName))).toBe(false);
    expect(result.accepted.some((c) => /LA and Oscuri/i.test(c.displayName))).toBe(false);
  });

  it('rejects last night as place', () => {
    expect(isBareGenericPlace('last night')).toBe(true);
    const result = infer("We went out last night.");
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'last night')).toBe(false);
  });

  it("treats Denny's Hollywood as deployment site when employer context exists", () => {
    const result = infer(
      "I worked at Vanguard Robotics at Denny's in Hollywood for a summer gig.",
    );
    const worksite = findAccepted(result, "Denny");
    expect(worksite).toBeDefined();
    expect(worksite!.locationType).toBe('deployment_site');
    expect(worksite!.context.organizationContext).toMatch(/Vanguard Robotics/i);
    expect(result.accepted.some((c) => /vanguard robotics/i.test(c.displayName))).toBe(false);
  });

  it('does not create middle school as place without name', () => {
    expect(isBareSchoolLabel('middle school')).toBe(true);
    const result = infer('I hated middle school back then.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'middle school')).toBe(false);
  });

  it('detects Whittier Christian Middle School as school', () => {
    const result = infer('I graduated from Whittier Christian Middle School in 2012.');
    const school = findAccepted(result, 'Whittier Christian Middle School');
    expect(school).toBeDefined();
    expect(school!.locationType).toBe('school');
  });

  it('detects Japan as country', () => {
    const result = infer('I want to visit Japan next year.');
    const japan = findAccepted(result, 'Japan');
    expect(japan).toBeDefined();
    expect(japan!.locationType).toBe('country');
  });

  it('assistant-generated guesses do not create locations', () => {
    const result = locationInferenceService.inferFromMessage({
      text: 'You might have been at Walmart based on context.',
      authorRole: 'assistant',
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'assistant_generated')).toBe(true);
  });

  it('relative locations attach to anchors instead of becoming cards', () => {
    const result = infer('We were at Walmart and hung out around the corner afterward.');
    expect(result.relativeAttachments.some((a) => a.phrase.includes('around the corner'))).toBe(true);
    expect(result.accepted.some((c) => c.locationType === 'relative_location')).toBe(false);
  });

  it('every private residence includes provenance', () => {
    const result = infer("I'm staying at Mom's House for the weekend.");
    const residences = result.accepted.filter((c) =>
      c.locationType === 'private_residence' || c.locationType === 'family_home',
    );
    expect(residences.length).toBeGreaterThan(0);
    for (const r of residences) {
      expect(r.sourceMessageIds.length).toBeGreaterThan(0);
      expect(r.evidencePhrases.length).toBeGreaterThan(0);
      expect(r.ownerDisplayName).toBeTruthy();
      expect(r.context.privacySensitive).toBe(true);
    }
  });
});
