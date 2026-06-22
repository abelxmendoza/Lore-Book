import { describe, expect, it } from 'vitest';

import {
  evaluateLoreAvatarCadence,
  hashLoreAvatarContext,
  LORE_AVATAR_COOLDOWN_MS,
} from '../../../src/services/characters/loreAvatarCadence';

const baseCtx = {
  name: 'Maria',
  summary: 'College friend from Austin',
  facts: [
    {
      category: 'appearance',
      fact: 'Short black hair',
      status: 'active',
    },
  ],
  loreSnippets: ['rock climbing'],
};

describe('loreAvatarCadence', () => {
  it('hashes context deterministically', () => {
    const a = hashLoreAvatarContext(baseCtx);
    const b = hashLoreAvatarContext({ ...baseCtx });
    expect(a).toBe(b);
    expect(a).toHaveLength(20);
  });

  it('changes hash when lore context changes', () => {
    const before = hashLoreAvatarContext(baseCtx);
    const after = hashLoreAvatarContext({
      ...baseCtx,
      facts: [{ category: 'appearance', fact: 'Blonde hair', status: 'active' }],
    });
    expect(before).not.toBe(after);
  });

  it('allows first-time generation when no lore portrait exists', () => {
    expect(
      evaluateLoreAvatarCadence({
        avatarUrl: null,
        metadata: {},
        contextHash: 'abc',
      }).action,
    ).toBe('generate');
  });

  it('skips when context hash is unchanged', () => {
    const hash = hashLoreAvatarContext(baseCtx);
    const decision = evaluateLoreAvatarCadence({
      avatarUrl: 'https://cdn.example/portrait.png',
      metadata: {
        avatar_source: 'lore_generated',
        avatar_generated_at: new Date().toISOString(),
        avatar_context_hash: hash,
      },
      contextHash: hash,
    });
    expect(decision).toMatchObject({ action: 'skip', reason: 'same_context' });
  });

  it('skips within 30-day cooldown when context changed', () => {
    const generatedAt = new Date('2026-06-01T12:00:00Z');
    const decision = evaluateLoreAvatarCadence({
      avatarUrl: 'https://cdn.example/portrait.png',
      metadata: {
        avatar_source: 'lore_generated',
        avatar_generated_at: generatedAt.toISOString(),
        avatar_context_hash: 'old-hash',
      },
      contextHash: 'new-hash',
      now: new Date(generatedAt.getTime() + 5 * 24 * 60 * 60 * 1000),
    });
    expect(decision).toMatchObject({ action: 'skip', reason: 'cooldown' });
    if (decision.action === 'skip') {
      expect(decision.nextEligibleAt).toBeDefined();
    }
  });

  it('allows regeneration after cooldown when context changed', () => {
    const generatedAt = new Date('2026-05-01T12:00:00Z');
    const decision = evaluateLoreAvatarCadence({
      avatarUrl: 'https://cdn.example/portrait.png',
      metadata: {
        avatar_source: 'lore_generated',
        avatar_generated_at: generatedAt.toISOString(),
        avatar_context_hash: 'old-hash',
      },
      contextHash: 'new-hash',
      now: new Date(generatedAt.getTime() + LORE_AVATAR_COOLDOWN_MS + 1),
    });
    expect(decision.action).toBe('generate');
  });
});
