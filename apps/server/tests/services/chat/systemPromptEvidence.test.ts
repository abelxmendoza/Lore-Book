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
      '**LOREBOOK EVIDENCE (from this message — cite when relevant):**\n- Memory candidate (skill, 90%): "cello"'
    );

    expect(prompt).toContain('LOREBOOK EVIDENCE');
    expect(prompt).toContain('cello');
  });

  it('omits evidence section when block is null', () => {
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
      null
    );

    expect(prompt).not.toContain('LOREBOOK EVIDENCE');
  });
});
