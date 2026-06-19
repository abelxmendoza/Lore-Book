import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openCharacterBookModal } from './openCharacterBookModal';

describe('openCharacterBookModal', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      'dispatchEvent',
      vi.fn()
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores character id and tab then navigates to characters', () => {
    openCharacterBookModal({ characterId: 'char-001', tab: 'timeline' });
    expect(sessionStorage.getItem('highlightItem')).toBe('char-001');
    expect(sessionStorage.getItem('characterModalTab')).toBe('timeline');
    expect(window.dispatchEvent).toHaveBeenCalled();
  });

  it('clears tab when not provided', () => {
    sessionStorage.setItem('characterModalTab', 'chat');
    openCharacterBookModal({ characterId: 'char-002' });
    expect(sessionStorage.getItem('characterModalTab')).toBeNull();
  });
});
