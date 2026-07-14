import { describe, it, expect } from 'vitest';

import {
  planResponseScope,
  detectScopeIntent,
  extractCorrectionNames,
} from '../../../src/services/responseScope/responseScopePlanner';
import { resolveResponseMode } from '../../../src/services/responseScope/responseModeResolver';

// Fictional cast only — never real lore in tests.
const TEAM_QUESTION = "Who's on my team at Titanworks?";

describe('response mode resolution', () => {
  it('memory questions become focused_recall, default is chat', () => {
    expect(resolveResponseMode(TEAM_QUESTION)).toBe('focused_recall');
    expect(resolveResponseMode('what do you know about Voltra?')).toBe('focused_recall');
    expect(resolveResponseMode('today was a long shift, the soak test ran late')).toBe('chat');
  });

  it('audit and debug only fire on explicit requests', () => {
    expect(resolveResponseMode('show me everything you know about my characters')).toBe('audit');
    expect(resolveResponseMode('why did you retrieve that memory?')).toBe('debug_inspector');
  });

  it('corrections are conversational — never debug', () => {
    expect(resolveResponseMode('you forgot Kavi, Joss, and Wren')).toBe('focused_recall');
    expect(resolveResponseMode("you don't remember my team?")).not.toBe('debug_inspector');
  });
});

describe('scope intent and domain routing', () => {
  it('work questions allow work domains and block family/romance/music', () => {
    const plan = planResponseScope(TEAM_QUESTION);
    expect(plan.intent).toBe('work');
    expect(plan.allowedDomains).toContain('teams');
    expect(plan.allowedDomains).toContain('work_relationships');
    expect(plan.blockedDomains).toEqual(
      expect.arrayContaining(['family', 'romance', 'music_scene', 'diagnostics', 'full_graph']),
    );
  });

  it('family questions block work and romance', () => {
    const plan = planResponseScope('who is in my family?');
    expect(plan.intent).toBe('family');
    expect(plan.allowedDomains).toContain('family');
    expect(plan.blockedDomains).toEqual(expect.arrayContaining(['work_roles', 'romance']));
  });

  it('diagnostics are blocked for every chat-facing intent', () => {
    for (const msg of [TEAM_QUESTION, 'who is in my family?', 'tell me about Club Nova']) {
      const plan = planResponseScope(msg);
      expect(plan.blockedDomains).toContain('diagnostics');
      expect(plan.blockedDomains).toContain('character_audit');
    }
  });

  it('detects primary entities from the question', () => {
    const plan = planResponseScope(TEAM_QUESTION);
    expect(plan.primaryEntities.map((e) => e.name)).toContain('Titanworks');
  });

  it('event intent stays available for scene questions', () => {
    expect(detectScopeIntent('what happened at the festival last night?')).toBe('event');
  });
});

describe('correction parsing', () => {
  it('extracts the names listed in a correction', () => {
    const names = extractCorrectionNames('You forgot Kavi, Joss, and Wren.');
    expect(names).toEqual(expect.arrayContaining(['Kavi', 'Joss', 'Wren']));
  });

  it('a correction inherits the previous intent when its own is general', () => {
    const plan = planResponseScope('you forgot Kavi and Joss', { previousIntent: 'work' });
    expect(plan.isCorrection).toBe(true);
    expect(plan.intent).toBe('work');
  });
});
