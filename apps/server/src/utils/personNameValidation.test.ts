import { describe, it, expect } from 'vitest';
import {
  isAppSurfacePersonName,
  isCollectivePersonName,
  isDisplayablePersonName,
  isIndividualPersonName,
  isPlaceholderPersonName,
} from './personNameValidation';

describe('personNameValidation', () => {
  it('treats Unknown and variants as placeholders', () => {
    expect(isPlaceholderPersonName('Unknown')).toBe(true);
    expect(isPlaceholderPersonName('unknown person')).toBe(true);
    expect(isPlaceholderPersonName('')).toBe(true);
    expect(isPlaceholderPersonName(null)).toBe(true);
  });

  it('treats names containing unknown as placeholders', () => {
    expect(isPlaceholderPersonName('Alex Unknown')).toBe(true);
  });

  it('allows real names', () => {
    expect(isDisplayablePersonName('Maria')).toBe(true);
    expect(isDisplayablePersonName('Jordan Lee')).toBe(true);
  });

  it('rejects title-only labels', () => {
    expect(isIndividualPersonName('Professor')).toBe(false);
    expect(isIndividualPersonName('Tio')).toBe(false);
    expect(isIndividualPersonName('Friend')).toBe(false);
    expect(isIndividualPersonName('Promoter')).toBe(false);
    expect(isIndividualPersonName('Professor Kim')).toBe(true);
    expect(isIndividualPersonName('Tio Ralph')).toBe(true);
  });

  it('rejects collective and group labels', () => {
    expect(isCollectivePersonName('Amazon Engineers')).toBe(true);
    expect(isCollectivePersonName('KForce Recruiters')).toBe(true);
    expect(isCollectivePersonName('HR Team')).toBe(true);
    expect(isCollectivePersonName('my coworkers')).toBe(true);
    expect(isIndividualPersonName('Amazon Engineers')).toBe(false);
  });

  it('allows individual people with org-adjacent names', () => {
    expect(isIndividualPersonName('Jordan Lee')).toBe(true);
    expect(isIndividualPersonName('Reese')).toBe(true);
    expect(isIndividualPersonName('The Rock')).toBe(true);
  });

  it('rejects LoreBook app surfaces as people', () => {
    expect(isAppSurfacePersonName('Organizations Book')).toBe(true);
    expect(isAppSurfacePersonName('Groups & Organizations Book')).toBe(true);
    expect(isIndividualPersonName('Organizations Book')).toBe(false);
    expect(isIndividualPersonName('Character Book')).toBe(false);
  });

  it('rejects singular generic person references', () => {
    expect(isCollectivePersonName('one girl')).toBe(true);
    expect(isCollectivePersonName('the new guy')).toBe(true);
    expect(isCollectivePersonName('a random person')).toBe(true);
    expect(isIndividualPersonName('one girl')).toBe(false);
    expect(isIndividualPersonName('the new guy')).toBe(false);
  });

  it('rejects generic person references with an "in ..." suffix', () => {
    expect(isCollectivePersonName('people in the scene')).toBe(true);
    expect(isCollectivePersonName('people in the office')).toBe(true);
    expect(isCollectivePersonName('friends in the group chat')).toBe(true);
    expect(isIndividualPersonName('people in the scene')).toBe(false);
  });

  it('still allows real names that merely contain a generic word', () => {
    expect(isIndividualPersonName('The Rock')).toBe(true);
    expect(isCollectivePersonName('Guy Fieri')).toBe(false);
  });
});
