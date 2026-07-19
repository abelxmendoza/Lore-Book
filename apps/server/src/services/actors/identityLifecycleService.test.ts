import { describe, expect, it } from 'vitest';

import { classifyMention } from './mentionClassifier';
import {
  decideIdentityLifecycle,
  mayCreateCharacterFromLifecycle,
  scoreIdentity,
} from './identityLifecycleService';

describe('identityLifecycleService', () => {
  it('keeps vague generics as ephemeral mentions with low confidence', () => {
    const decision = decideIdentityLifecycle({
      name: 'one girl',
      signals: { mentionCount: 5, conversationCount: 3, timeSpanDays: 60 },
    });
    expect(decision.stage).toBe('MENTION');
    expect(decision.mayPromoteToCharacter).toBe(false);
    expect(decision.identityConfidence).toBeLessThanOrEqual(15);
    expect(decision.promotionLog).toContain('one girl');
  });

  it('keeps contextual groups as mentions (not characters)', () => {
    const decision = decideIdentityLifecycle({
      name: 'coworkers at Vanguard Robotics',
      signals: { mentionCount: 4, conversationCount: 2, timeSpanDays: 14 },
    });
    expect(decision.mayPromoteToCharacter).toBe(false);
    expect(decision.stage).toBe('MENTION');
  });

  it('treats anonymous contextual people as candidates, not characters', () => {
    const decision = decideIdentityLifecycle({
      name: 'Anonymous woman at Northwind Depot',
      signals: { mentionCount: 1, conversationCount: 1, timeSpanDays: 0 },
    });
    expect(decision.stage).toBe('CANDIDATE');
    expect(decision.mayPromoteToCharacter).toBe(false);
    expect(decision.identityConfidence).toBeGreaterThanOrEqual(25);
  });

  it('never promotes a named person on a single mention', () => {
    const mention = classifyMention({
      text: 'Jamie',
      entityId: 'c-jamie',
      provenance: 'character_book',
      kind: 'character',
    });
    const decision = decideIdentityLifecycle({
      name: 'Jamie',
      mention,
      signals: {
        mentionCount: 1,
        conversationCount: 1,
        timeSpanDays: 0,
        namedExplicitly: true,
      },
    });
    expect(decision.stage).toBe('RESOLVED');
    expect(decision.mayPromoteToCharacter).toBe(false);
    expect(decision.identityConfidence).toBeLessThan(99);
  });

  it('promotes a recurring named person to Character', () => {
    const mention = classifyMention({
      text: 'Marcus',
      entityId: 'c-marcus',
      provenance: 'character_book',
      kind: 'character',
    });
    const decision = decideIdentityLifecycle({
      name: 'Marcus',
      mention,
      signals: {
        mentionCount: 5,
        conversationCount: 3,
        timeSpanDays: 45,
        namedExplicitly: true,
        relationshipStrength: 0.6,
        emotionalWeight: 0.4,
      },
    });
    expect(decision.stage).toMatch(/CHARACTER|CORE_CHARACTER/);
    expect(decision.mayPromoteToCharacter).toBe(true);
    expect(decision.identityConfidence).toBeGreaterThanOrEqual(55);
    expect(decision.promotionLog).toContain('Marcus');
  });

  it('archives stale weak candidates', () => {
    const decision = decideIdentityLifecycle({
      name: 'Anonymous recruiter at MemoVault',
      signals: {
        mentionCount: 1,
        conversationCount: 1,
        timeSpanDays: 0,
        daysSinceLastSeen: 200,
      },
    });
    expect(decision.shouldArchive).toBe(true);
  });

  it('scores frequency and conversations into the breakdown', () => {
    const score = scoreIdentity({
      mentionCount: 4,
      conversationCount: 3,
      timeSpanDays: 40,
      namedExplicitly: true,
    });
    expect(score.frequency).toBeGreaterThan(0);
    expect(score.conversations).toBeGreaterThan(0);
    expect(score.naming).toBe(16);
    expect(score.total).toBeGreaterThanOrEqual(40);
  });

  it('gates Character Book creation via mayCreateCharacterFromLifecycle', () => {
    expect(mayCreateCharacterFromLifecycle({ name: 'one girl', mentionCount: 10 }).allow).toBe(
      false,
    );
    expect(mayCreateCharacterFromLifecycle({ name: 'Taylor', mentionCount: 1 }).allow).toBe(false);
    expect(
      mayCreateCharacterFromLifecycle({
        name: 'Alex',
        mentionCount: 4,
        conversationCount: 3,
        timeSpanDays: 30,
      }).allow,
    ).toBe(true);
  });

  it('allows user-confirmed promotion even with few mentions', () => {
    const { allow, decision } = mayCreateCharacterFromLifecycle({
      name: 'Jamie',
      mentionCount: 1,
      userConfirmed: true,
    });
    expect(allow).toBe(true);
    expect(decision.stage).toMatch(/CHARACTER|RESOLVED/);
  });
});
