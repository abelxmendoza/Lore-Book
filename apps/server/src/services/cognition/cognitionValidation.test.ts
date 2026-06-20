import { describe, it, expect } from 'vitest';
import {
  isUuid,
  parseQueryLimit,
  parseAssertionTargetKind,
  parseGraphNodeKind,
} from './cognitionValidation';

describe('cognitionValidation', () => {
  it('validates UUIDs strictly', () => {
    expect(isUuid('a0000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('a0000000-0000-4000-8000-000000000001-extra')).toBe(false);
  });

  it('clamps and defaults query limits', () => {
    expect(parseQueryLimit(undefined, 20, 100)).toBe(20);
    expect(parseQueryLimit('abc', 20, 100)).toBe(20);
    expect(parseQueryLimit('-5', 20, 100)).toBe(20);
    expect(parseQueryLimit('50', 20, 100)).toBe(50);
    expect(parseQueryLimit('9999', 20, 100)).toBe(100);
    expect(parseQueryLimit('3.7', 20, 100)).toBe(3);
  });

  it('parses assertion target kinds', () => {
    expect(parseAssertionTargetKind('node')).toBe('node');
    expect(parseAssertionTargetKind('narrative_claim')).toBe('narrative_claim');
    expect(parseAssertionTargetKind('bogus')).toBeNull();
  });

  it('parses graph node kinds', () => {
    expect(parseGraphNodeKind('event')).toBe('event');
    expect(parseGraphNodeKind('decision')).toBe('decision');
    expect(parseGraphNodeKind(undefined)).toBeUndefined();
    expect(parseGraphNodeKind('invalid_kind')).toBeUndefined();
  });
});
