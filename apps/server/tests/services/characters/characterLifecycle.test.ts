import { describe, expect, it } from 'vitest';

import {
  assertCharacterStatusTransition,
  canPermanentlyDeleteCharacter,
  normalizeCharacterStatus,
} from '../../../src/services/characters/characterLifecycle';

describe('characterLifecycle', () => {
  it('requires archive before pending_deletion from active', () => {
    expect(assertCharacterStatusTransition('active', 'pending_deletion').ok).toBe(true);
    expect(assertCharacterStatusTransition('active', 'archived').ok).toBe(true);
    expect(assertCharacterStatusTransition('active', 'inactive').ok).toBe(true);
  });

  it('blocks permanent delete path skip from active', () => {
    expect(canPermanentlyDeleteCharacter('active')).toBe(false);
    expect(canPermanentlyDeleteCharacter('archived')).toBe(false);
    expect(canPermanentlyDeleteCharacter('pending_deletion')).toBe(true);
  });

  it('allows archived → pending_deletion and pending_deletion → archived', () => {
    expect(assertCharacterStatusTransition('archived', 'pending_deletion').ok).toBe(true);
    expect(assertCharacterStatusTransition('pending_deletion', 'archived').ok).toBe(true);
    expect(assertCharacterStatusTransition('pending_deletion', 'active').ok).toBe(true);
  });

  it('normalizes unknown status to active', () => {
    expect(normalizeCharacterStatus(null)).toBe('active');
    expect(normalizeCharacterStatus('ARCHIVED')).toBe('archived');
  });
});
