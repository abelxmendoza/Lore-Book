/**
 * Kinship-aware structured name splitting for Character Book identity fields.
 * Mirrors apps/server/src/utils/nameNormalization.ts — keep in sync.
 */

const LEADING_TITLE_RE =
  /^(?:(?:mr|mrs|ms|miss|mx|dr|prof|professor|dj|sir|dame|lord|lady|rev|fr)\.?\s+|(?:my|our)\s+)?(?:step(?:\s|-)?(?:dad|father|mom|mother)|t[íi]o|t[íi]a|uncle|auntie|aunt|abuelita|abuelito|abuela|abuelo|grandma|grandpa|grandmother|grandfather|cousin|primo|prima|brother|sister|hermano|hermana|mom|dad|mother|father|mommy|daddy|mama|papa|mamá|papá)\s+/i;

const KINSHIP_NAME_TOKENS = new Set([
  'step', 'dad', 'mom', 'father', 'mother', 'stepfather', 'stepmother', 'stepdad', 'stepmom',
  'tio', 'tío', 'tia', 'tía', 'uncle', 'aunt', 'auntie', 'abuela', 'abuelo', 'abuelita', 'abuelito',
  'grandma', 'grandpa', 'grandmother', 'grandfather', 'cousin', 'primo', 'prima',
  'brother', 'sister', 'hermano', 'hermana', 'mommy', 'daddy', 'mama', 'papa', 'mamá', 'papá',
]);

function normalizeNameKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isKinshipNameToken(token: string | null | undefined): boolean {
  const t = normalizeNameKey(token ?? '');
  return Boolean(t) && KINSHIP_NAME_TOKENS.has(t);
}

export function stripLeadingPersonTitles(fullName: string): string {
  let working = (fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!working) return '';
  for (let i = 0; i < 3; i++) {
    const next = working.replace(LEADING_TITLE_RE, '').trim();
    if (next === working) break;
    working = next;
  }
  return working;
}

export function splitStructuredPersonName(fullName: string): {
  firstName: string;
  middleName: string;
  lastName: string;
} {
  const cleaned = stripLeadingPersonTitles(fullName);
  const parts = cleaned.split(/\s+/).filter(Boolean).filter((p) => !isKinshipNameToken(p));
  if (parts.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}
