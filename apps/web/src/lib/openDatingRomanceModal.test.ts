import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openDatingRomanceModal } from './openDatingRomanceModal';

describe('openDatingRomanceModal', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('dispatchEvent', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores relationship id and tab then navigates to love', () => {
    openDatingRomanceModal({ relationshipId: 'rel-001', tab: 'timeline' });
    expect(sessionStorage.getItem('highlightRelationship')).toBe('rel-001');
    expect(sessionStorage.getItem('relationshipModalTab')).toBe('timeline');
    expect(window.dispatchEvent).toHaveBeenCalled();
  });

  it('stores character id when relationship id is absent', () => {
    openDatingRomanceModal({ characterId: 'char-001', tab: 'timeline' });
    expect(sessionStorage.getItem('highlightRelationship')).toBeNull();
    expect(sessionStorage.getItem('highlightRelationshipCharacterId')).toBe('char-001');
    expect(sessionStorage.getItem('relationshipModalTab')).toBe('timeline');
  });

  it('no-ops without relationship or character id', () => {
    openDatingRomanceModal({ tab: 'timeline' });
    expect(sessionStorage.getItem('highlightRelationship')).toBeNull();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('clears tab when not provided', () => {
    sessionStorage.setItem('relationshipModalTab', 'overview');
    openDatingRomanceModal({ relationshipId: 'rel-002' });
    expect(sessionStorage.getItem('relationshipModalTab')).toBeNull();
  });
});
