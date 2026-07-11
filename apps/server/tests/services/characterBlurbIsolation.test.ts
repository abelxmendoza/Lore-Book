import { describe, expect, it } from 'vitest';

import { parseCharacterName } from '../../src/utils/characterNameMatching';

// Mirror hook rules from characterBlurbService — family members must not inherit protagonist hooks.
const PROTAGONIST_HOOK_RULES: Array<{ pattern: RegExp; hook: string }> = [
  { pattern: /\binterview\b/, hook: 'has an interview on the horizon' },
  { pattern: /\bepirus\b/, hook: 'Epirus enters the chat' },
  { pattern: /\bresume\b/, hook: 'resume lore unlocked' },
];

const CHARACTER_HOOK_RULES: Array<{ pattern: RegExp; hook: string }> = [
  { pattern: /\bfamily|relative|cousin|sibling\b/, hook: 'family tree material' },
];

function extractHooks(
  texts: string[],
  options: { isSelf: boolean; kinshipRole?: string | null }
): string[] {
  const hooks = new Set<string>();
  const blob = texts.join(' ').toLowerCase();
  const rules = options.isSelf
    ? PROTAGONIST_HOOK_RULES
    : options.kinshipRole
      ? CHARACTER_HOOK_RULES
      : CHARACTER_HOOK_RULES.filter((rule) => rule.hook !== 'family tree material');

  for (const rule of rules) {
    if (rule.pattern.test(blob)) hooks.add(rule.hook);
  }
  return [...hooks];
}

describe('character blurb isolation', () => {
  it('does not attach protagonist resume hooks to family characters', () => {
    const globalResumeBlob = [
      'Abel has an interview on the horizon at Epirus',
      'uploaded resume for robotics role',
      'family tree material with Abuela and Tio Juan',
    ];
    const tioJuan = parseCharacterName('Tío Rafa');

    const hooks = extractHooks(globalResumeBlob, {
      isSelf: false,
      kinshipRole: tioJuan.kinshipRole,
    });

    expect(hooks).not.toContain('has an interview on the horizon');
    expect(hooks).not.toContain('Epirus enters the chat');
    expect(hooks).not.toContain('resume lore unlocked');
  });

  it('still allows protagonist hooks on self character', () => {
    const hooks = extractHooks(['Abel has an interview at Epirus'], { isSelf: true });
    expect(hooks).toContain('has an interview on the horizon');
    expect(hooks).toContain('Epirus enters the chat');
  });
});
