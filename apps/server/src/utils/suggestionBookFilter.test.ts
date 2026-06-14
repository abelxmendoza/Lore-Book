import { normalizeNameKey } from './nameNormalization';
import { collectNameKeys, isNameAlreadyInBook } from './suggestionBookFilter';

describe('suggestionBookFilter', () => {
  it('matches exact and alias names', () => {
    const { exactKeys, entries } = collectNameKeys(['Maya Chen', 'M.C.']);
    expect(isNameAlreadyInBook('Maya Chen', exactKeys, entries)).toBe(true);
    expect(isNameAlreadyInBook('maya chen', exactKeys, entries)).toBe(true);
  });

  it('matches containment when shorter name is in the book', () => {
    const { exactKeys, entries } = collectNameKeys(['Dana']);
    expect(isNameAlreadyInBook('Dana Onboarding', exactKeys, entries)).toBe(true);
  });

  it('does not suggest names not in the book', () => {
    const { exactKeys, entries } = collectNameKeys(['Maya']);
    expect(isNameAlreadyInBook('Jordan Lee', exactKeys, entries)).toBe(false);
  });
});
