import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('merges single class', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('merges multiple classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });

  it('merges tailwind classes correctly', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('handles undefined and null', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });
});
