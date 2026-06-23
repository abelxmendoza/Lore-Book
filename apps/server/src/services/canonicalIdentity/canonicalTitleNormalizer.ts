const FAMILY_TITLE_MAP: Record<string, string> = {
  tio: 'Tio',
  'tío': 'Tio',
  tia: 'Tia',
  'tía': 'Tia',
  uncle: 'Tio',
  aunt: 'Tia',
  auntie: 'Tia',
  mom: 'Mom',
  mother: 'Mom',
  dad: 'Dad',
  father: 'Dad',
  abuela: 'Abuela',
  abuelo: 'Abuelo',
  grandma: 'Abuela',
  grandpa: 'Abuelo',
  brother: 'Brother',
  sister: 'Sister',
  cousin: 'Cousin',
};

const HONORIFIC_MAP: Record<string, string> = {
  mr: 'Mr.',
  mrs: 'Mrs.',
  ms: 'Ms.',
  miss: 'Miss',
  dr: 'Dr.',
  doctor: 'Dr.',
  prof: 'Professor',
  professor: 'Professor',
  pastor: 'Pastor',
  general: 'General',
  judge: 'Judge',
  coach: 'Coach',
};

export const BARE_FAMILY_TITLES = new Set([
  'mom',
  'dad',
  'brother',
  'sister',
  'tio',
  'tío',
  'tia',
  'tía',
  'abuela',
  'abuelo',
  'cousin',
]);

function titleCaseWord(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  return word.charAt(0).toUpperCase() + lower.slice(1);
}

export function titleCaseIdentity(value: string): string {
  return value
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/\.$/, '').toLowerCase();
      if (FAMILY_TITLE_MAP[bare]) return FAMILY_TITLE_MAP[bare];
      if (HONORIFIC_MAP[bare]) return HONORIFIC_MAP[bare];
      if (/^(la|oc|csuf|dtla)$/i.test(word)) return word.toUpperCase();
      return titleCaseWord(word);
    })
    .join(' ');
}

export function normalizePersonTitle(raw: string): {
  displayName: string;
  title?: string;
  isBareFamilyTitle: boolean;
  rulesFired: string[];
} {
  const cleaned = raw
    .replace(/[’‘]/g, "'")
    .replace(/^(?:my|our|the)\s+/i, '')
    .replace(/'s$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const rulesFired: string[] = [];
  const first = cleaned.split(/\s+/)[0]?.replace(/\.$/, '').toLowerCase() ?? '';
  const isBareFamilyTitle = BARE_FAMILY_TITLES.has(first) && cleaned.split(/\s+/).length === 1;
  const displayName = titleCaseIdentity(cleaned);

  if (FAMILY_TITLE_MAP[first] || HONORIFIC_MAP[first]) rulesFired.push('title_normalized');

  return {
    displayName,
    title: FAMILY_TITLE_MAP[first] ?? HONORIFIC_MAP[first],
    isBareFamilyTitle,
    rulesFired,
  };
}
