import { describe, it, expect } from 'vitest';
import {
  RETRIEVAL_ANTI_ECHO_INSTRUCTION,
  formatSkillReferenceLine,
  formatWorkingMemoryCitation,
} from './systemPromptBuilder';

describe('Retrieval Compression (Blueprint 21 Phase 3)', () => {
  it('RETRIEVAL_ANTI_ECHO_INSTRUCTION is non-empty and warns against echoing structure', () => {
    expect(RETRIEVAL_ANTI_ECHO_INSTRUCTION.length).toBeGreaterThan(0);
    expect(RETRIEVAL_ANTI_ECHO_INSTRUCTION).toContain('Never quote a bracketed tag');
  });

  it('formatSkillReferenceLine never emits a bare [skill: prefix directly on the name', () => {
    const line = formatSkillReferenceLine({ id: 'abc-123', name: 'Rock Climbing', category: 'fitness' });
    expect(line).not.toMatch(/^- \[skill:/);
    expect(line).toContain('Rock Climbing');
    expect(line).toContain('internal ref: skill:abc-123');
  });

  it('formatWorkingMemoryCitation never emits the bare [source=...|...] bracket', () => {
    const line = formatWorkingMemoryCitation({
      title: 'Coffee with Kiley',
      content: 'Caught up over coffee',
      source: 'episode',
      confidence: 0.8,
      score: 62,
    });
    expect(line).not.toMatch(/\[source=/);
    expect(line).toContain('internal only — do not repeat');
    expect(line).toContain('src=episode');
  });

  it('formatWorkingMemoryCitation falls back to safe defaults when fields are missing', () => {
    const line = formatWorkingMemoryCitation({ title: 'Untitled', content: '' });
    expect(line).toContain('src=working_memory');
    expect(line).toContain('conf=n/a');
    expect(line).toContain('wma_score=n/a');
  });
});
