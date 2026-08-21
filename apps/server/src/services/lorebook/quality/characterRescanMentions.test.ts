import { describe, expect, it } from 'vitest';

import { collectPersonMentions } from '../../characterConversationRescanService';

describe('collectPersonMentions — character rescan quality', () => {
  const story = [
    'Maya and I talked after class.',
    'Background Check cleared for the Ring job.',
    'Quality Assurance Technician is not a person.',
    'Claude Code helped me write tests.',
    'I went out with her friend.',
  ].join(' ');

  it('keeps stable person names and drops non-person noise', () => {
    const names = collectPersonMentions(story).map((n) => n.toLowerCase());
    expect(names.some((n) => n.includes('maya'))).toBe(true);
    expect(names).not.toContain('background check');
    expect(names).not.toContain('quality assurance technician');
    expect(names).not.toContain('claude code');
    expect(names).not.toContain('her friend');
  });
});
