/**
 * Regression fixtures from observed production failures.
 * Assert stage contracts reject garbage before canonical storage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateEntityCandidateBeforePersist,
  validateRelationshipBeforeWrite,
  validateEventBeforePersist,
  validateMemoryProposalBeforePersist,
  validateCorrectionBeforeApply,
  validateRetractionBeforeApply,
} from '../../src/services/ingestion/stageContractGate';
import {
  getStageContractMetrics,
  resetStageContractMetricsForTests,
} from '../../src/services/ingestion/stageContractMetrics';

describe('stageContractGate regressions (real failure fixtures)', () => {
  beforeEach(() => {
    resetStageContractMetricsForTests();
  });

  describe('entity_candidate', () => {
    const rejectPerson = (name: string) => {
      const r = validateEntityCandidateBeforePersist({
        name,
        type: 'PERSON',
        evidenceIds: ['fixture'],
        confidence: 0.9,
      });
      expect(r.accepted).toBe(false);
    };

    it('rejects tonight as PERSON', () => rejectPerson('tonight'));
    it('rejects Background Check as PERSON', () => rejectPerson('Background Check'));
    it('rejects Quality Assurance Technician as PERSON', () =>
      rejectPerson('Quality Assurance Technician'));
    it('rejects One Piece as PERSON', () => rejectPerson('One Piece'));
    it('rejects Claude Code as PERSON', () => rejectPerson('Claude Code'));
    it('rejects command as PERSON', () => rejectPerson('Can you list my friends?'));
    it('rejects chat bubble styling as PERSON', () => rejectPerson('chat bubbles'));
    it('rejects testing chatter as PERSON', () => rejectPerson('testing the new chat'));

    it('retypes Catch One toward LOCATION', () => {
      const r = validateEntityCandidateBeforePersist({
        name: 'Catch One',
        type: 'PERSON',
        evidenceIds: ['fixture'],
      });
      // may reject or retype to LOCATION
      if (r.accepted) {
        expect(r.value.retyped === 'LOCATION' || r.value.type === 'LOCATION').toBe(true);
      } else {
        expect(r.accepted).toBe(false);
      }
    });

    it('retypes Ex Lover toward ORGANIZATION', () => {
      const r = validateEntityCandidateBeforePersist({
        name: 'Ex Lover',
        type: 'PERSON',
        evidenceIds: ['fixture'],
      });
      if (r.accepted) {
        expect(r.value.retyped === 'ORGANIZATION' || r.value.type === 'ORGANIZATION').toBe(true);
      } else {
        expect(r.accepted).toBe(false);
      }
    });

    it('accepts a real person name', () => {
      const r = validateEntityCandidateBeforePersist({
        name: 'Maya',
        type: 'PERSON',
        evidenceIds: ['msg-1'],
        confidence: 0.9,
      });
      expect(r.accepted).toBe(true);
    });
  });

  describe('relationship_candidate', () => {
    it('rejects endpoint-less coworker shell', () => {
      const r = validateRelationshipBeforeWrite({
        subjectEntityId: 'u1',
        objectEntityId: 'u1',
        relationshipType: 'coworker',
        description: 'User has a coworker relationship.',
        evidenceIds: ['e1'],
        temporalStatus: 'active',
      });
      expect(r.accepted).toBe(false);
    });

    it('rejects generic romantic partner shell', () => {
      const r = validateRelationshipBeforeWrite({
        subjectEntityId: 'a',
        objectEntityId: 'b',
        relationshipType: 'relationship',
        description: 'User has a romantic partner relationship.',
        evidenceIds: ['e1'],
        temporalStatus: 'active',
      });
      expect(r.accepted).toBe(false);
    });

    it('accepts concrete coworker edge', () => {
      const r = validateRelationshipBeforeWrite({
        subjectEntityId: 'char-self',
        objectEntityId: 'char-jordan',
        relationshipType: 'WORKS_WITH',
        description: 'Jordan is my coworker at Amazon',
        evidenceIds: ['ev-1'],
        confidence: 0.85,
        temporalStatus: 'active',
      });
      expect(r.accepted).toBe(true);
    });
  });

  describe('event_candidate', () => {
    it('rejects greetings / commands via eligibility', () => {
      const r = validateEventBeforePersist({
        title: 'Hello there',
        occurredAt: null,
        recordedAt: new Date().toISOString(),
        eligibilityEligible: false,
        eligibilityReason: 'rejected_greeting',
        evidenceIds: ['u1'],
        publishableTitle: false,
      });
      expect(r.accepted).toBe(false);
    });

    it('rejects Captured Conversation title', () => {
      const r = validateEventBeforePersist({
        title: 'Captured Conversation',
        occurredAt: new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        eligibilityEligible: true,
        eligibilityReason: 'personal_event',
        evidenceIds: ['u1'],
        publishableTitle: false,
      });
      expect(r.accepted).toBe(false);
      if (!r.accepted) expect(r.reason).toBe('unpublishable_title');
    });

    it('accepts visiting Abuela house style event', () => {
      const r = validateEventBeforePersist({
        title: "Visited Abuela's house",
        occurredAt: '2026-06-01T00:00:00.000Z',
        recordedAt: '2026-07-12T00:00:00.000Z',
        temporalPrecision: 'day',
        temporalSource: 'explicit_in_text',
        eligibilityEligible: true,
        eligibilityReason: 'visit',
        confidence: 0.88,
        evidenceIds: ['unit-1'],
        publishableTitle: true,
      });
      expect(r.accepted).toBe(true);
    });
  });

  describe('memory_proposal / correction', () => {
    it('rejects relationship proposal without object endpoint', () => {
      const r = validateMemoryProposalBeforePersist({
        proposalKind: 'relationship',
        subjectEntityId: 'self',
        predicate: 'related_to',
        confidence: 0.5,
        risk: 'HIGH',
        sensitivity: 'PRIVATE',
        evidenceIds: ['e1'],
        proposedMutation: 'Add coworker relationship',
        claimText: 'User has a coworker relationship.',
      });
      expect(r.accepted).toBe(false);
    });

    it('accepts occupation fact with typedValue', () => {
      const r = validateMemoryProposalBeforePersist({
        proposalKind: 'occupation',
        subjectEntityId: 'self',
        predicate: 'works_as',
        typedValue: 'Quality Assurance Technician',
        confidence: 0.9,
        risk: 'MEDIUM',
        sensitivity: 'NORMAL',
        evidenceIds: ['e1'],
        proposedMutation: 'Add works_as Quality Assurance Technician',
        claimText: 'I work as a Quality Assurance Technician',
      });
      expect(r.accepted).toBe(true);
    });

    it('accepts not-a-DJ correction with targets', () => {
      const r = validateCorrectionBeforeApply({
        targetClaimIds: ['claim-dj'],
        replacementClaim: 'I am not a DJ',
        correctionAuthority: 'user_explicit',
        evidenceIds: ['msg-1'],
        supersessionBehavior: 'replace_claims',
      });
      expect(r.accepted).toBe(true);
    });

    it('accepts retraction of old occupation', () => {
      const r = validateRetractionBeforeApply({
        targetClaimIds: ['claim-dj'],
        reason: 'User stated they are not a DJ',
        authority: 'user_explicit',
      });
      expect(r.accepted).toBe(true);
    });
  });

  it('records metrics by kind', () => {
    validateEntityCandidateBeforePersist({
      name: 'tonight',
      type: 'PERSON',
      evidenceIds: ['x'],
    });
    const m = getStageContractMetrics();
    expect(m.entity_candidate?.produced).toBeGreaterThanOrEqual(1);
    expect(m.entity_candidate?.rejected).toBeGreaterThanOrEqual(1);
  });
});
