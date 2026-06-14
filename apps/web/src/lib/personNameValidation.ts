const PLACEHOLDER_NAME_KEYS = new Set([
  'unknown',
  'unknown person',
  'unnamed',
  'unnamed person',
  'someone',
  'somebody',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
]);

const COLLECTIVE_TAIL_WORDS = new Set([
  'engineers', 'engineer', 'developers', 'developer', 'designers', 'designer',
  'managers', 'manager', 'employees', 'employee', 'recruiters', 'recruiter',
  'analysts', 'analyst', 'consultants', 'consultant', 'contractors', 'contractor',
  'interns', 'intern', 'staff', 'team', 'teams', 'crew', 'squad', 'department',
  'departments', 'division', 'divisions', 'unit', 'units', 'group', 'groups',
  'members', 'member', 'colleagues', 'colleague', 'coworkers', 'co-workers',
  'coworker', 'people', 'folks', 'guys', 'girls', 'boys', 'friends', 'classmates',
  'teammates', 'siblings', 'parents', 'cousins', 'nephews', 'nieces', 'children',
  'kids', 'executives', 'executive', 'leadership', 'management', 'workers',
  'worker', 'associates', 'associate', 'representatives', 'representative',
  'agents', 'agent', 'specialists', 'specialist', 'onboarding', 'hiring',
]);

const COLLECTIVE_INLINE_PATTERN =
  /\b(?:team|crew|squad|group|department|division|unit|staff|roster|committee|guild|union|society|association|board|leadership|management|workforce|personnel)\b/i;

function normalizePersonNameKey(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isPlaceholderPersonName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return true;
  const key = normalizePersonNameKey(String(name));
  if (!key) return true;
  if (PLACEHOLDER_NAME_KEYS.has(key)) return true;
  if (/\bunknown\b/.test(key)) return true;
  return false;
}

export function isCollectivePersonName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const trimmed = String(name).trim();
  const key = normalizePersonNameKey(trimmed);
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length === 0) return false;

  const last = tokens[tokens.length - 1];
  if (COLLECTIVE_TAIL_WORDS.has(last)) return true;
  if (COLLECTIVE_INLINE_PATTERN.test(trimmed)) return true;

  if (/^(?:the|my|our)\s+/.test(trimmed) && tokens.length >= 2) {
    const head = tokens[1];
    if (COLLECTIVE_TAIL_WORDS.has(head) || COLLECTIVE_INLINE_PATTERN.test(tokens.slice(1).join(' '))) {
      return true;
    }
  }

  return false;
}

export function isDisplayablePersonName(name: string | null | undefined): boolean {
  return !isPlaceholderPersonName(name);
}

export function isIndividualPersonName(name: string | null | undefined): boolean {
  return isDisplayablePersonName(name) && !isCollectivePersonName(name);
}
