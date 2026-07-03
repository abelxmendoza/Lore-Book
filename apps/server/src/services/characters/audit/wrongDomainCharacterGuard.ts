import { isCollectivePersonName } from '../../../utils/personNameValidation';
import { normalizePersonNameKey } from '../../../utils/personNameValidation';

const SYSTEM_CONTEXT_PATTERNS = [
  /^last\s+chat$/i,
  /^previous\s+chat$/i,
  /^this\s+chat$/i,
  /^recent\s+chat$/i,
  /^chat\s+history$/i,
];

const INTEREST_GENRE_LABELS = new Set([
  'cyberpunk',
  'gothic',
  'goth',
  'punk',
  'ska',
  'metal',
  'jazz',
  'horror',
  'fantasy',
  'sci-fi',
  'scifi',
  'science fiction',
]);

const JUNK_TEST_LABELS = new Set(['foo', 'bar', 'baz', 'test', 'asdf', 'qwerty', 'xxx']);

const ROLE_TITLE_PATTERNS = [
  /\b(technician|engineer|manager|operator|qa technician|quality assurance technician|developer|analyst)\b/i,
  /technician$/i,
  /engineer$/i,
  // Resume-shaped titles: "Field Robotics Agent", "Robotics Deployment Specialist", …
  /\b(agent|specialist|coordinator|consultant|architect|scientist|intern|supervisor|administrator|director)$/i,
];

export type WrongDomainResult = {
  wrongDomain: boolean;
  target?: 'group' | 'interest' | 'system';
  reason?: string;
};

export function evaluateWrongDomain(
  name: string,
  provenanceText = '',
): WrongDomainResult {
  const key = normalizePersonNameKey(name);

  if (JUNK_TEST_LABELS.has(key)) {
    return { wrongDomain: true, target: 'system', reason: 'Test/junk placeholder label' };
  }

  for (const re of SYSTEM_CONTEXT_PATTERNS) {
    if (re.test(key)) {
      return { wrongDomain: true, target: 'system', reason: 'System or time reference, not a person' };
    }
  }

  if (isCollectivePersonName(name) || /\bmajors?\b/i.test(name)) {
    return { wrongDomain: true, target: 'group', reason: 'Collective or group label — belongs in Organizations/Groups' };
  }

  if (INTEREST_GENRE_LABELS.has(key)) {
    const hasPersonEvidence =
      /\b(nickname|stage name|persona|called|known as|alias)\b/i.test(provenanceText) ||
      /\b(he|she|they|him|her|them)\b/i.test(provenanceText);
    if (!hasPersonEvidence) {
      return {
        wrongDomain: true,
        target: 'interest',
        reason: 'Genre/style/interest label unless explicitly used as a person nickname',
      };
    }
  }

  // Prevent role titles (e.g. "Quality Assurance Technician", "Engineer") from becoming Character cards.
  // They should be Work Roles attached to user / orgs.
  for (const pat of ROLE_TITLE_PATTERNS) {
    if (pat.test(name) && !/\b(person|guy|girl|friend|colleague|coworker|my|I)\b/i.test(provenanceText)) {
      return {
        wrongDomain: true,
        target: 'group', // or 'system' — roles go to work/organizations domain
        reason: 'Role or job title (e.g. technician, engineer) — attach to user as Work Role, not as Character',
      };
    }
  }

  return { wrongDomain: false };
}

export function isJunkTestData(name: string, provenanceText = ''): boolean {
  const key = normalizePersonNameKey(name);
  if (JUNK_TEST_LABELS.has(key)) {
    if (/\b(real|story|mentioned|said|met)\b/i.test(provenanceText)) return false;
    return true;
  }
  return false;
}
