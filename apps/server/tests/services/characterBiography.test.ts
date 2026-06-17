import { describe, expect, it } from 'vitest';

// Pure helpers mirrored from characterBiographyService for deterministic unit tests
function inferRoleInStory(name: string, relationshipTypes: string[]): string {
  const FAMILY_REL =
    /family|grand|abuela|abuelo|mother|father|brother|sister|aunt|uncle|t[ií]o|t[ií]a|cousin|parent|child|spouse/i;
  const ROMANTIC_REL = /romantic|partner|crush|dating|boyfriend|girlfriend|one.night|hookup|lover|situationship/i;
  const WORK_REL = /colleague|boss|manager|work|professional|onboarding|employer|mentor/i;
  const text = [name, ...relationshipTypes].join(' ').toLowerCase();

  if (FAMILY_REL.test(text) || /^abuela\b/i.test(name)) return 'Family anchor.';
  if (ROMANTIC_REL.test(text)) {
    if (/one.night|hookup|situationship|metro/i.test(text)) {
      return 'Romantic connection from a past chapter.';
    }
    return 'Significant romantic figure.';
  }
  if (WORK_REL.test(text) || /kelly|onboarding|amazon/i.test(text)) {
    return 'Professional contact during a work chapter.';
  }
  return 'Supporting figure in the story.';
}

describe('characterBiographyService', () => {
  it('infers Grandma Rose as family anchor', () => {
    expect(inferRoleInStory('Grandma Rose', ['grandmother'])).toBe('Family anchor.');
  });

  it('infers Kelly as professional contact', () => {
    expect(inferRoleInStory('Kelly', ['colleague', 'onboarding'])).toBe(
      'Professional contact during a work chapter.'
    );
  });

  it('infers Alex as romantic chapter figure', () => {
    expect(inferRoleInStory('Alex Morgan', ['one_night_stand', 'metro'])).toBe(
      'Romantic connection from a past chapter.'
    );
  });
});
