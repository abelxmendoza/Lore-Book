import { describe, expect, it } from 'vitest';

import {
  detectBookQueryDomains,
  isUniversalBookQueryRequest,
} from './bookQueryIntent';

describe('book query chat intent', () => {
  it('detects every explicitly named Book in a cross-Book question', () => {
    expect(detectBookQueryDomains('What skills support my active quests?')).toEqual([
      'skill',
      'quest',
    ]);
    expect(isUniversalBookQueryRequest('What skills support my active quests?')).toBe(true);
  });

  it('routes Books without dedicated chat handlers through the registry', () => {
    expect(isUniversalBookQueryRequest('Which documents mention MemoVault?')).toBe(true);
    expect(isUniversalBookQueryRequest('Show Life Log events with Marcus')).toBe(true);
    expect(isUniversalBookQueryRequest('Show narrative anchors about Vanguard Robotics')).toBe(true);
  });

  it('preserves mature single-Book handlers', () => {
    expect(isUniversalBookQueryRequest('Show my blocked quests')).toBe(false);
    expect(isUniversalBookQueryRequest('Show my maternal cousins')).toBe(false);
    expect(isUniversalBookQueryRequest('Which places did I visit?')).toBe(false);
    expect(isUniversalBookQueryRequest('Which people need review?')).toBe(false);
    expect(isUniversalBookQueryRequest('Show people connected to Vanguard Robotics')).toBe(false);
  });

  it('does not steal ordinary recall or conversational statements', () => {
    expect(isUniversalBookQueryRequest('When did I last eat pizza?')).toBe(false);
    expect(isUniversalBookQueryRequest('I practiced guitar today.')).toBe(false);
  });

  it('routes explicit connection questions into the shared graph path', () => {
    expect(isUniversalBookQueryRequest('Who introduced me to Marcus?')).toBe(true);
    expect(isUniversalBookQueryRequest('What is the connection between Marcus and MemoVault?')).toBe(true);
  });
});
