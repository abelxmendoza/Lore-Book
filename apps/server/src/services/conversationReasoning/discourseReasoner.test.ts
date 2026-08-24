import { describe, it, expect } from 'vitest';
import { resolveDiscourseReferents, applyEntityReferentRewrite } from './discourseReasoner';
import type { ActiveConversationContext } from '../responseScope/responseScopeTypes';
import type { EntityReferent } from './discourseReasonerTypes';

function context(overrides: Partial<ActiveConversationContext> = {}): ActiveConversationContext {
  return { intent: 'general', entities: [{ name: 'Jerry' }], userTurnsSinceAnchor: 1, ...overrides };
}

describe('resolveDiscourseReferents', () => {
  it("the blueprint's own example: resolves to the exchange, not the entity", () => {
    const r = resolveDiscourseReferents({
      message: 'Do you remember when that was?',
      history: [],
      activeContext: context(),
    });
    expect(r.kind).toBe('exchange');
    if (r.kind === 'exchange') {
      expect(r.topicSummary).toContain('Jerry');
      expect(r.topicSummary).not.toBe('Jerry');
    }
  });

  it('resolves a bare pronoun to the anchored entity', () => {
    const r = resolveDiscourseReferents({
      message: 'How old is she?',
      history: [],
      activeContext: context(),
    });
    expect(r.kind).toBe('entity');
    if (r.kind === 'entity') {
      expect(r.entityName).toBe('Jerry');
    }
  });

  it('stays unresolved with no active context to anchor to', () => {
    const r = resolveDiscourseReferents({
      message: 'How old is she?',
      history: [],
      activeContext: undefined,
    });
    expect(r.kind).toBe('unresolved');
  });

  it('does not force a resolution on an ordinary, self-contained message', () => {
    const r = resolveDiscourseReferents({
      message: 'What is my job like these days?',
      history: [],
      activeContext: context(),
    });
    expect(r.kind).toBe('unresolved');
  });
});

describe('applyEntityReferentRewrite', () => {
  it('substitutes the pronoun with the resolved entity name, first occurrence only', () => {
    const referent: EntityReferent = { kind: 'entity', pronoun: 'she', entityName: 'Wren', confidence: 0.7 };
    expect(applyEntityReferentRewrite('How old is she?', referent)).toBe('How old is Wren?');
  });

  it('leaves the message untouched when the pronoun is not present', () => {
    const referent: EntityReferent = { kind: 'entity', pronoun: 'she', entityName: 'Wren', confidence: 0.7 };
    expect(applyEntityReferentRewrite('What time is it?', referent)).toBe('What time is it?');
  });
});
