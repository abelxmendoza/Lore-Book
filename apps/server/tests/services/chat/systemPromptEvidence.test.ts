import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '../../../src/services/chat/systemPromptBuilder';

describe('buildSystemPrompt agent evidence injection', () => {
  const minimalOrchestrator = {
    timeline: { events: [], arcs: [] },
    characters: [],
    locations: [],
    chapters: [],
  };

  it('appends the agent evidence block when provided', () => {
    const prompt = buildSystemPrompt(
      minimalOrchestrator,
      [],
      [],
      null,
      [],
      undefined,
      undefined,
      undefined,
      null,
      undefined,
      { primary: 'strategist', secondary: [], weights: { strategist: 1 } },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'user-1',
      '**LOREBOOK EVIDENCE (from this message — cite when relevant):**\n- Memory candidate (skill, 90%): "cello"',
      null
    );

    expect(prompt).toContain('LOREBOOK EVIDENCE');
    expect(prompt).toContain('cello');
  });

  it('injects the self-model block when provided', () => {
    const prompt = buildSystemPrompt(
      minimalOrchestrator,
      [],
      [],
      null,
      [],
      undefined,
      undefined,
      undefined,
      null,
      undefined,
      { primary: 'strategist', secondary: [], weights: { strategist: 1 } },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'user-1',
      null,
      '• LoreBook is a personal memory operating system.'
    );

    expect(prompt).toContain('HOW LOREBOOK WORKS');
    expect(prompt).toContain('personal memory operating system');
  });

  it('omits self-model section when block is null', () => {
    const prompt = buildSystemPrompt(
      minimalOrchestrator,
      [],
      [],
      null,
      [],
      undefined,
      undefined,
      undefined,
      null,
      undefined,
      { primary: 'strategist', secondary: [], weights: { strategist: 1 } },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'user-1',
      null,
      null
    );

    expect(prompt).not.toContain('HOW LOREBOOK WORKS');
  });
});
