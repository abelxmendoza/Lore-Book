import { describe, expect, it } from 'vitest';
import { isKinshipNameToken, splitStructuredPersonName, stripLeadingPersonTitles } from './structuredPersonName';

describe('structuredPersonName', () => {
  it('strips kinship titles before splitting', () => {
    expect(stripLeadingPersonTitles('Step Dad Ben')).toBe('Ben');
    expect(stripLeadingPersonTitles('Tía Grace Rivera')).toBe('Grace Rivera');
    expect(splitStructuredPersonName('Step Dad Ben')).toEqual({
      firstName: 'Ben',
      middleName: '',
      lastName: '',
    });
    expect(splitStructuredPersonName('Benjamin Lopez')).toEqual({
      firstName: 'Benjamin',
      middleName: '',
      lastName: 'Lopez',
    });
  });

  it('treats kinship words as non-name tokens', () => {
    expect(isKinshipNameToken('Dad')).toBe(true);
    expect(isKinshipNameToken('Step')).toBe(true);
    expect(isKinshipNameToken('Benjamin')).toBe(false);
  });
});
