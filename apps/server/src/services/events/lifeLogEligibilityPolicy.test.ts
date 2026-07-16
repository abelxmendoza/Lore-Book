import { describe, expect, it } from 'vitest';

import {
  autobiographicalClause,
  evaluateLifeLogEligibility,
  isPublishableLifeLogTitle,
} from './lifeLogEligibilityPolicy';

describe('LifeLogEligibilityPolicy', () => {
  it.each([
    ['hi im Abel Mendoza', 'rejected_greeting'],
    ['Recap everything we discussed in this thread', 'rejected_command'],
    ['Do you remember them?', 'rejected_question'],
    ['testing the chat improvements', 'rejected_command'],
    ['I code LoreBook', 'rejected_static_fact'],
    ['The World Cup is going on', 'rejected_world_fact'],
  ])('rejects non-events: %s', (text, reason) => {
    expect(evaluateLifeLogEligibility({ text })).toMatchObject({ eligible: false, reason });
  });

  it('extracts the autobiographical payload from a mixed command', () => {
    const text = 'Remember that I visited Abuela yesterday.';
    expect(autobiographicalClause(text)).toBe('I visited Abuela yesterday.');
    expect(evaluateLifeLogEligibility({ text })).toMatchObject({ eligible: true, reason: 'personal_event' });
  });

  it('accepts meaningful project work', () => {
    expect(evaluateLifeLogEligibility({ text: "Today I worked on LoreBook's UI and improved its generation flow." }))
      .toMatchObject({ eligible: true, reason: 'project_milestone' });
  });

  it('accepts a concrete personal token-usage incident', () => {
    expect(evaluateLifeLogEligibility({ text: 'Damn, did someone spam my API tokens? I ran out unexpectedly.' }))
      .toMatchObject({ eligible: true, reason: 'personal_event' });
  });

  it('preserves a structured career event even when its derived summary is not first-person', () => {
    expect(evaluateLifeLogEligibility({
      text: 'Amazon onboarding and interview process',
      title: 'Amazon Onboarding',
      type: 'career_event',
    })).toMatchObject({ eligible: true, reason: 'state_transition' });
  });

  it('keeps a durable occupation fact out of Moments', () => {
    expect(evaluateLifeLogEligibility({
      text: 'I work as a Quality Assurance Technician at Amazon through an agency.',
    })).toMatchObject({ eligible: false, reason: 'rejected_static_fact' });
  });

  it.each([
    ['I started my first day at the Ring building.', 'state_transition'],
    ["I built LoreBook while staying at Tia Grace's house.", 'project_milestone'],
    ["I attended Leslie's graduation party.", 'attended_event'],
    ['I saw Moth Queen perform at Club Nova.', 'attended_event'],
    ['Sol blocked me on Instagram.', 'relationship_event'],
    ['I stayed home to build LoreBook instead of attending Gothicumbia.', 'intentional_nonattendance'],
  ])('classifies a known autobiographical example: %s', (text, reason) => {
    expect(evaluateLifeLogEligibility({ text })).toMatchObject({ eligible: true, reason });
  });

  it.each([
    ['I am currently onboarding with Kforce.', 'state_transition'],
    ['I briefly saw her at Ska Prom.', 'personal_event'],
    ["I stayed at Tia Grace's house for Memorial Day weekend.", 'visit'],
    ['I went to the club for the Anime Expo afters.', 'attended_event'],
    ['There was a conflict with two friends that changed our relationship.', 'relationship_event'],
    ['I hooked up with someone after the party.', 'personal_event'],
  ])('recognizes recoverable autobiographical categories: %s', (text, reason) => {
    expect(evaluateLifeLogEligibility({ text })).toMatchObject({ eligible: true, reason });
  });

  it('rejects fallback and audit records', () => {
    expect(evaluateLifeLogEligibility({ text: 'something happened', title: 'Captured Conversation' }))
      .toMatchObject({ eligible: false, reason: 'rejected_failed_extraction' });
    expect(evaluateLifeLogEligibility({ text: 'Background Check — reclassified', type: 'reclassified' }))
      .toMatchObject({ eligible: false, reason: 'rejected_audit_record' });
  });

  it('requires a meaningful bounded title', () => {
    expect(isPublishableLifeLogTitle('Captured Conversation')).toBe(false);
    expect(isPublishableLifeLogTitle('Damn Wtf Did Someone Spam My Tokens I')).toBe(false);
    expect(isPublishableLifeLogTitle('LoreBook UI Progress')).toBe(true);
    expect(isPublishableLifeLogTitle('A Story About the')).toBe(false);
  });
});
