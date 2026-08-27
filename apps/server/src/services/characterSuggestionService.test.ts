import { describe, expect, it } from 'vitest';

import { characterSuggestionService } from './characterSuggestionService';

async function extractNames(text: string): Promise<string[]> {
  return (characterSuggestionService as any).extractNamesFromText(text);
}

describe('characterSuggestionService.extractNamesFromText', () => {
  it('catches a name followed by an ordinary narrative verb, not just a fixed trigger list', async () => {
    // Real production gap: this exact sentence produced ZERO character
    // suggestions. "Romi" is preceded by "and" (a real trigger) but was
    // immediately followed by "saw" — not in the old '/'s|said|told|and/'
    // whitelist, so it fell through entirely.
    const text =
      'There was also this little girl Olive who I met that day and she yelled at me ' +
      '"She\'s a minor" at V and Romi saw and heard when that happened';

    const names = await extractNames(text);
    expect(names).toContain('Romi');
  });

  it('catches a name introduced by a person-descriptor noun ("girl X", "friend X")', async () => {
    const text =
      'There was also this little girl Olive who I met that day and she yelled at me ' +
      '"She\'s a minor" at V and Romi saw and heard when that happened';

    const names = await extractNames(text);
    expect(names).toContain('Olive');
  });

  it('still catches the original trigger shapes ("with X and", "X said", "X and")', async () => {
    expect(await extractNames('I went with Dorian and Rhys to the show.')).toContain('Dorian');
    expect(await extractNames('Kelly said she would be late.')).toContain('Kelly');
  });
});
