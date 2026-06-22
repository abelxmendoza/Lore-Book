import { describe, it, expect } from 'vitest';
import { extractResponseActions } from '../../../src/services/responseCompiler/responseActionExtractor';

describe('responseActionExtractor', () => {
  it('extracts add relationship action chip', () => {
    const actions = extractResponseActions('Would you like to add Bryan as a best friend?');
    expect(actions.some((a) => a.type === 'add_relationship' && /Bryan/i.test(a.label))).toBe(true);
    expect(actions[0].requiresConfirmation).toBe(true);
  });

  it('extracts create group action chip', () => {
    const actions = extractResponseActions('Should I create a School Band group for your cast?');
    expect(actions.some((a) => a.type === 'create_group' && /School Band/i.test(a.label))).toBe(true);
  });
});
