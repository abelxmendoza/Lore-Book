import { describe, expect, it } from 'vitest';

import { parseSkillMerge } from './skillWriteService';

describe('parseSkillMerge', () => {
  it('parses merge X into Y', () => {
    expect(parseSkillMerge('merge Web UI Development into Front-End Development')).toEqual({
      source: 'Web UI Development',
      target: 'Front-End Development',
    });
  });

  it('parses fold the skill X into the skill Y', () => {
    expect(parseSkillMerge('fold the skill Prototyping into Hardware Prototyping')).toEqual({
      source: 'Prototyping',
      target: 'Hardware Prototyping',
    });
  });

  it('ignores create phrasing', () => {
    expect(parseSkillMerge('add Welding as a skill')).toBeNull();
  });
});
