import { describe, expect, it } from 'vitest';

import {
  classifyChatGPTLoreCategory,
  extractUserAuthoredChatGPTClaims,
} from '../../src/services/chatgptImport/chatGPTLoreMigrationService';

describe('classifyChatGPTLoreCategory', () => {
  it('routes autobiographical claims into profile preview categories', () => {
    expect(classifyChatGPTLoreCategory('I built MemoVault as my main project.')).toBe('projects');
    expect(classifyChatGPTLoreCategory('I prefer quiet mornings and coffee.')).toBe('preferences_habits');
    expect(classifyChatGPTLoreCategory('I want to learn Japanese next year.')).toBe('skills_interests');
    expect(classifyChatGPTLoreCategory('I met Jamie while working at Vanguard Robotics.')).toBe('relationships');
  });

  it('keeps autobiographical evidence while excluding prompts and sensitive claims by default', () => {
    expect(
      extractUserAuthoredChatGPTClaims('I built a Python app called MemoVault.').claims,
    ).toEqual(['I built a Python app called MemoVault.']);
    expect(
      extractUserAuthoredChatGPTClaims('Write me a fictional biography where I live on Mars.'),
    ).toMatchObject({ claims: [], excludedAsHypothetical: true });
    expect(
      extractUserAuthoredChatGPTClaims('I was diagnosed with a medical condition last year.'),
    ).toMatchObject({ claims: [], sensitiveClaimsExcluded: 1 });
  });
});
