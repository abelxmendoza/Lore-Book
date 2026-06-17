import { describe, it, expect } from 'vitest';
import { classifyIntentForAudit } from '../../src/services/chat/workingMemoryAssembler';
import { classifyResponseType, isStoryIntent } from '../../src/services/storyContextService';

describe('story query routing', () => {
  it('routes chapter questions', () => {
    expect(classifyIntentForAudit('What chapter am I in?')).toBe('CHAPTER_QUERY');
    expect(isStoryIntent('CHAPTER_QUERY')).toBe(true);
    expect(classifyResponseType('CHAPTER_QUERY')).toBe('STORY_RESPONSE');
  });

  it('routes arc questions', () => {
    expect(classifyIntentForAudit('What stories am I living?')).toBe('ARC_QUERY');
    expect(classifyIntentForAudit('What is my family arc?')).toBe('ARC_QUERY');
  });

  it('routes conflict questions', () => {
    expect(classifyIntentForAudit('What conflicts keep appearing?')).toBe('CONFLICT_QUERY');
    expect(classifyResponseType('CONFLICT_QUERY')).toBe('INSIGHT_RESPONSE');
  });

  it('routes direction and momentum', () => {
    expect(classifyIntentForAudit('Where is my life heading?')).toBe('DIRECTION_QUERY');
    expect(classifyIntentForAudit('What is gaining momentum?')).toBe('MOMENTUM_QUERY');
  });

  it('routes identity including defines me', () => {
    expect(classifyIntentForAudit('What defines me?')).toBe('IDENTITY_QUERY');
  });

  it('keeps memory queries off story intents', () => {
    expect(classifyIntentForAudit('Who is Andrew?')).toBe('PERSON_QUERY');
    expect(isStoryIntent('PERSON_QUERY')).toBe(false);
  });
});
