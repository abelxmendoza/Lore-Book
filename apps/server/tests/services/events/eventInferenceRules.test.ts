import { describe, it, expect } from 'vitest';

import { eventInferenceService } from '../../../src/services/events/inference/eventInferenceService';
import { isBareGenericEvent } from '../../../src/services/events/inference/contextualEventInference';
import { isTimeOnlySpan } from '../../../src/services/events/inference/eventTimeAnchorResolver';
import { isSchoolDayTimeOnly } from '../../../src/services/events/inference/schoolEventInference';
import { hasProvenance } from '../../../src/services/events/inference/eventProvenanceService';

function infer(text: string, extra: Parameters<typeof eventInferenceService.inferFromMessage>[0] = {}) {
  return eventInferenceService.inferFromMessage({
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

describe('event inference rules', () => {
  it("Leslie's Graduation Party becomes graduation_party event", () => {
    const result = infer(
      "Yesterday was my cousin Leslie's Graduation Party at my Tio Ralph's house.",
    );
    const party = findAccepted(result, 'Leslie');
    expect(party).toBeDefined();
    expect(party!.eventType).toBe('graduation_party');
    expect(party!.displayName.toLowerCase()).toContain('graduation');
  });

  it('party alone is rejected', () => {
    expect(isBareGenericEvent('party')).toBe(true);
    const result = infer('We had a party.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'party')).toBe(false);
  });

  it('Ska Prom becomes named event', () => {
    const result = infer('I briefly saw her at Ska Prom a couple weeks ago.');
    const prom = findAccepted(result, 'Ska Prom');
    expect(prom).toBeDefined();
    expect(prom!.eventType).toMatch(/music_event|show/);
  });

  it('Gothicumbia last night splits into event + time anchor', () => {
    const result = infer("So I didn't go to Gothicumbia last night.");
    const event = findAccepted(result, 'Gothicumbia');
    expect(event).toBeDefined();
    expect(event!.displayName).not.toMatch(/last night/i);
    expect(result.timeAnchors.some((t) => /last night/i.test(t))).toBe(true);
  });

  it('fight at Bad Dogg Compound becomes sensitive conflict event', () => {
    const result = infer(
      'There was a fight involving Michael Fasbender and Charlie at Bad Dogg Compound.',
    );
    const fight = findAccepted(result, 'Fight at Bad Dogg');
    expect(fight).toBeDefined();
    expect(fight!.eventType).toMatch(/conflict|fight/);
    expect(fight!.sensitive).toBe(true);
    expect(fight!.requiresReview).toBe(true);
    expect(fight!.context.place?.displayName).toMatch(/Bad Dogg Compound/i);
  });

  it('Amazon Interview becomes work event', () => {
    const result = infer('I had an Amazon Interview with Engineers last week.');
    const interview = findAccepted(result, 'Amazon Interview');
    expect(interview).toBeDefined();
    expect(interview!.eventType).toMatch(/work_event|interview/);
    expect(interview!.context.organization?.displayName).toMatch(/Amazon/i);
  });

  it('Japan last summer becomes travel event', () => {
    const result = infer('We went to Japan last summer with Japanese Class.');
    const trip = findAccepted(result, 'Japan Trip');
    expect(trip).toBeDefined();
    expect(trip!.eventType).toMatch(/trip|travel/);
    expect(trip!.context.timeHint).toMatch(/last summer/i);
  });

  it('every Wednesday band practice becomes recurring event', () => {
    const result = infer('We practiced in band every Wednesday after school.');
    const practice = findAccepted(result, 'Wednesday Band Practice');
    expect(practice).toBeDefined();
    expect(practice!.eventType).toBe('recurring_activity');
  });

  it('lunch break alone is time, not event', () => {
    expect(isSchoolDayTimeOnly('We talked during lunch break.')).toBe(true);
    const result = infer('We talked during lunch break.');
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'school_day_time_only')).toBe(true);
  });

  it('detention yesterday becomes sensitive school event', () => {
    const result = infer('Abel Mendoza got detention yesterday at school.');
    const detention = findAccepted(result, 'Detention');
    expect(detention).toBeDefined();
    expect(detention!.eventType).toBe('school_event');
    expect(detention!.sensitive).toBe(true);
    expect(detention!.requiresReview).toBe(true);
  });

  it('show alone is rejected unless place/time/person attached', () => {
    expect(isBareGenericEvent('show')).toBe(true);
    const bare = infer('There was a show.');
    expect(bare.accepted.some((c) => c.displayName.toLowerCase() === 'show')).toBe(false);

    const contextual = infer('There was a show at Bad Dogg Compound last night.');
    expect(contextual.accepted.length).toBeGreaterThan(0);
  });

  it('does not create unnamed individual people from friends', () => {
    const result = infer('I hung out with my friends at the mall.');
    for (const event of result.accepted) {
      const people = event.context.people ?? [];
      expect(people.every((p) => !/^(friends|my friends)$/i.test(p.displayName))).toBe(true);
    }
  });

  it('every event includes provenance', () => {
    const result = infer(
      "Yesterday was my cousin Leslie's Graduation Party at my Tio Ralph's house.",
    );
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const event of result.accepted) {
      expect(hasProvenance(event)).toBe(true);
      expect(event.sourceMessageIds.length).toBeGreaterThan(0);
      expect(event.evidencePhrases.length).toBeGreaterThan(0);
    }
  });

  it('rejects last night as standalone event', () => {
    expect(isTimeOnlySpan('last night')).toBe(true);
    const result = infer('We went out last night.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'last night')).toBe(false);
  });

  it('assistant-generated guesses do not create events', () => {
    const result = eventInferenceService.inferFromMessage({
      text: "You probably went to Ska Prom based on context.",
      authorRole: 'assistant',
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'assistant_generated')).toBe(true);
  });
});
