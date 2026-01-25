import { describe, it, expect } from 'vitest';
import { inferScope, RELATIONSHIP_SCOPE_SET } from './scopeInference';

describe('scopeInference', () => {
  describe('RELATIONSHIP_SCOPE_SET', () => {
    it('includes friends and spiritual (Phase 3.1 extended)', () => {
      expect(RELATIONSHIP_SCOPE_SET.has('friends')).toBe(true);
      expect(RELATIONSHIP_SCOPE_SET.has('spiritual')).toBe(true);
      expect(RELATIONSHIP_SCOPE_SET.has('friendship')).toBe(true);
      expect(RELATIONSHIP_SCOPE_SET.has('transition')).toBe(true);
    });
  });

  describe('inferScope', () => {
    it('returns work for "meeting with boss"', () => {
      expect(inferScope('meeting with boss')).toBe('work');
    });

    it('returns family for "mom and dad"', () => {
      expect(inferScope('mom and dad')).toBe('family');
    });

    it('returns stress for "anxiety and crisis"', () => {
      expect(inferScope('anxiety and crisis')).toBe('stress');
    });

    it('returns global for "walked the dog"', () => {
      expect(inferScope('walked the dog')).toBe('global');
    });

    it('returns global for empty string', () => {
      expect(inferScope('')).toBe('global');
    });

    it('returns first matching scope', () => {
      expect(inferScope('discussed salary with my dad')).toBe('work');
    });

    it('returns spiritual for meditation and faith', () => {
      expect(inferScope('meditation and faith')).toBe('spiritual');
      expect(inferScope('church and prayer')).toBe('spiritual');
    });
  });
});
