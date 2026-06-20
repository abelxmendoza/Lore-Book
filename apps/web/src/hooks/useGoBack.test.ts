import { describe, it, expect } from 'vitest';
import { backLabelForPath } from './useGoBack';

describe('backLabelForPath', () => {
  it('labels book routes', () => {
    expect(backLabelForPath('/skills')).toBe('Back to Skills');
    expect(backLabelForPath('/characters')).toBe('Back to Characters');
  });

  it('falls back for unknown paths', () => {
    expect(backLabelForPath('/')).toBe('Back to Home');
    expect(backLabelForPath(undefined)).toBe('Back to Home');
  });
});
