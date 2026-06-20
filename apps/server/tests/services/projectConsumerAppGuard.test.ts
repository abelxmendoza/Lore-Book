import { describe, it, expect } from 'vitest';

import { guardConsumerAppReference } from '../../src/services/lexical/projects/projectConsumerAppGuard';
import { guardObjectReference } from '../../src/services/lexical/projects/projectObjectGuard';
import {
  processProjectSuggestionsForOutput,
  weakProjectCandidate,
} from '../../src/services/lexical/projects/projectSuggestionService';

describe('projectConsumerAppGuard', () => {
  it('rejects Find My app as consumer app reference', () => {
    const line = 'had to go on Find My app to locate it';
    const result = guardConsumerAppReference('Find My app', line);
    expect(result.allowed).toBe(false);
    expect(result.rejectionReason).toBe('consumer_app_reference');
  });

  it('rejects Codex, Cursor, and Claude Code as tool references', () => {
    const line = 'I used Codex, Cursor, and Claude Code to work on LoreBook.';
    for (const tool of ['Codex', 'Cursor', 'Claude Code']) {
      const result = guardConsumerAppReference(tool, line);
      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe('tool_reference');
    }
  });

  it('allows tool names when building an integration', () => {
    const line = 'building my Cursor extension for LoreBook';
    const result = guardConsumerAppReference('Cursor', line);
    expect(result.allowed).toBe(true);
  });

  it('rejects phone in my moms car as object/location phrase', () => {
    const line = "I forgot my phone in my mom's car";
    const result = guardObjectReference('phone in my mom\'s car', line);
    expect(result.allowed).toBe(false);
    expect(result.rejectionReason).toMatch(/object_location_phrase|physical_object/);
  });

  it('rejects Amazon Ring doorbell as product/device reference', () => {
    const line =
      "I rang the new Amazon Ring doorbell they have. It was funny because I'm going to be working on those soon.";
    const result = guardObjectReference('Amazon Ring doorbell', line);
    expect(result.allowed).toBe(false);
    expect(result.rejectionReason).toBe('product_device_reference');
  });

  it('regression: phone, Find My app, and car produce no project suggestions', () => {
    const text =
      "I forgot my phone in my mom's car and had to go on Find My app to locate it.";
    const weak = [
      weakProjectCandidate("phone in my mom's car", text, 0.7),
      weakProjectCandidate('Find My app', text, 0.75),
      weakProjectCandidate('phone', text, 0.6),
    ];
    expect(processProjectSuggestionsForOutput(text, undefined, weak)).toEqual([]);
  });

  it('regression: tools rejected but LoreBook kept in tool sentence', () => {
    const text = 'I used Codex, Cursor, and Claude Code to work on LoreBook.';
    const weak = [
      weakProjectCandidate('Codex', text, 0.7),
      weakProjectCandidate('Cursor', text, 0.7),
      weakProjectCandidate('Claude Code', text, 0.7),
      weakProjectCandidate('LoreBook', text, 0.9),
    ];
    const names = processProjectSuggestionsForOutput(text, undefined, weak).map(s => s.text);
    expect(names.some(n => /lorebook/i.test(n))).toBe(true);
    expect(names.some(n => /codex|cursor|claude code/i.test(n))).toBe(false);
  });
});
