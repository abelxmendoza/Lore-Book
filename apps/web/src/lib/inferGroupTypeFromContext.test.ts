import { describe, expect, it } from 'vitest';

import { inferGroupTypeFromContext } from './inferGroupTypeFromContext';

describe('inferGroupTypeFromContext', () => {
  it('classifies workplace language as company', () => {
    const result = inferGroupTypeFromContext({
      groupName: 'Vanguard Robotics',
      details: 'Marcus works at this company with me as a coworker',
      characterRole: 'colleague',
    });
    expect(result.groupType).toBe('company');
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('classifies family language as family', () => {
    const result = inferGroupTypeFromContext({
      groupName: 'Taylor family circle',
      details: 'siblings and cousins who gather for holidays',
    });
    expect(result.groupType).toBe('family');
  });

  it('classifies band language as band', () => {
    const result = inferGroupTypeFromContext({
      groupName: 'Static Bloom',
      details: 'our band — Jamie is the vocalist, we rehearse weekly',
    });
    expect(result.groupType).toBe('band');
  });

  it('falls back gently with thin context', () => {
    const result = inferGroupTypeFromContext({
      groupName: 'Northwind',
    });
    expect(result.groupType).toBeTruthy();
    expect(result.confidence).toBeLessThan(0.6);
  });
});
