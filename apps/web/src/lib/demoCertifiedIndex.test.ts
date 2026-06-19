import { describe, it, expect, beforeEach } from 'vitest';
import { buildDemoCertifiedIndex } from './demoCertifiedIndex';
import { mockDataService } from '../services/mockDataService';

describe('buildDemoCertifiedIndex', () => {
  beforeEach(() => {
    mockDataService.register.characters([
      { id: 'c-1', name: 'Alex', alias: [] } as never,
    ]);
    mockDataService.register.locations([
      { id: 'l-1', name: 'Mission Beach' } as never,
    ]);
    mockDataService.register.skills([
      { id: 's-1', skill_name: 'Muay Thai' } as never,
    ]);
  });

  it('builds certified entities from mock book data', () => {
    const index = buildDemoCertifiedIndex();
    expect(index.some((e) => e.name === 'Alex' && e.type === 'character')).toBe(true);
    expect(index.some((e) => e.name === 'Mission Beach' && e.type === 'location')).toBe(true);
    expect(index.some((e) => e.name === 'Muay Thai' && e.type === 'skill')).toBe(true);
  });
});
