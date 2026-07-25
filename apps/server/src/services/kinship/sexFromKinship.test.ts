import { describe, it, expect } from 'vitest';
import {
  sexFromKinship,
  sexFromKinshipPhrase,
  sexFromKinshipRole,
  sexFromKinshipString,
  canSoftWriteSex,
  kinshipSexMetadataPatch,
} from './sexFromKinship';

describe('sexFromKinship', () => {
  it('maps parental and extended roles', () => {
    expect(sexFromKinshipRole('MOTHER')).toBe('female');
    expect(sexFromKinshipRole('FATHER')).toBe('male');
    expect(sexFromKinshipRole('AUNT')).toBe('female');
    expect(sexFromKinshipRole('UNCLE')).toBe('male');
    expect(sexFromKinshipRole('GRANDMOTHER')).toBe('female');
    expect(sexFromKinshipRole('GRANDFATHER')).toBe('male');
    expect(sexFromKinshipRole('SIBLING')).toBeNull();
    expect(sexFromKinshipRole('COUSIN')).toBeNull();
  });

  it('recovers sex from brother/sister/primo/prima phrases', () => {
    expect(sexFromKinshipPhrase('my sister')).toBe('female');
    expect(sexFromKinshipPhrase('Brother James')).toBe('male');
    expect(sexFromKinshipPhrase('Prima Elena')).toBe('female');
    expect(sexFromKinshipPhrase('Primo Carlos')).toBe('male');
  });

  it('combines role + phrase for collapsed roles', () => {
    expect(sexFromKinship('SIBLING', 'my brother')).toBe('male');
    expect(sexFromKinship('COUSIN', 'prima Maya')).toBe('female');
    expect(sexFromKinship('MOTHER')).toBe('female');
  });

  it('maps kinship strings used on relationship edges', () => {
    expect(sexFromKinshipString('mother')).toBe('female');
    expect(sexFromKinshipString('stepfather')).toBe('male');
    expect(sexFromKinshipString('aunt')).toBe('female');
  });

  it('does not overwrite user-confirmed sex', () => {
    expect(canSoftWriteSex({ sex: 'male', sex_source: 'user_confirmed' })).toBe(false);
    expect(canSoftWriteSex({ sex: 'female', sex_source: 'explicit' })).toBe(false);
    expect(canSoftWriteSex({ sex: 'unknown' })).toBe(true);
    expect(canSoftWriteSex({})).toBe(true);
  });

  it('builds a metadata patch for kinship inference', () => {
    expect(kinshipSexMetadataPatch({}, 'female')).toEqual({
      sex: 'female',
      sex_source: 'kinship_inferred',
    });
    expect(kinshipSexMetadataPatch({ sex: 'female', sex_source: 'user_confirmed' }, 'male')).toBeNull();
  });
});
