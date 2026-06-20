import { describe, expect, it } from 'vitest';

import {
  defaultConsolidationMode,
  getAvailableConsolidationModes,
} from './entityConsolidation';

describe('entityConsolidation', () => {
  it('offers nested mode for organizations and locations', () => {
    expect(getAvailableConsolidationModes('ORG', 'ORG')).toContain('nested');
    expect(getAvailableConsolidationModes('LOCATION', 'LOCATION')).toContain('nested');
  });

  it('does not offer nested mode for characters', () => {
    expect(getAvailableConsolidationModes('CHARACTER', 'CHARACTER')).not.toContain('nested');
    expect(getAvailableConsolidationModes('CHARACTER', 'CHARACTER')).toEqual([
      'merge',
      'alias',
      'link',
    ]);
  });

  it('defaults mixed-type pairs to link-only resolution', () => {
    expect(getAvailableConsolidationModes('ORG', 'LOCATION')).toEqual(['link']);
    expect(defaultConsolidationMode('ORG', 'LOCATION')).toBe('link');
  });
});
