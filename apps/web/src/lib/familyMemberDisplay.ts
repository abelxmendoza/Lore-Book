/**
 * Family-tree display labels — kinship call-name with legal name in parentheses
 * when we know both (e.g. "Mom (Elena Chen)", "Dad (Roberto Whitmore)").
 */

export type FamilyDisplayMember = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  kinship_title?: string | null;
  relation_label?: string | null;
  relation?: string | null;
};

/** Canonical parent call-names we surface in the tree. */
const PARENT_CALL_BY_KEY: Record<string, string> = {
  mom: 'Mom',
  mother: 'Mom',
  mama: 'Mom',
  mamá: 'Mom',
  mami: 'Mom',
  stepmom: 'Stepmom',
  stepmother: 'Stepmom',
  'step mom': 'Stepmom',
  'step-mom': 'Stepmom',
  'step mother': 'Stepmom',
  'step-mother': 'Stepmom',
  dad: 'Dad',
  father: 'Dad',
  papa: 'Dad',
  papá: 'Dad',
  papi: 'Dad',
  stepdad: 'Stepdad',
  stepfather: 'Stepdad',
  'step dad': 'Stepdad',
  'step-dad': 'Stepdad',
  'step father': 'Stepdad',
  'step-father': 'Stepdad',
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function callNameFromToken(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const key = normalizeKey(raw);
  if (PARENT_CALL_BY_KEY[key]) return PARENT_CALL_BY_KEY[key];
  // "Mom (shared)" / "Dad · paternal"
  const first = key.split(/[·(]/)[0]?.trim();
  if (first && PARENT_CALL_BY_KEY[first]) return PARENT_CALL_BY_KEY[first];
  return null;
}

/** Prefer kinship_title, then relation_label, then bare name when it's Mom/Dad. */
export function resolveParentCallName(member: FamilyDisplayMember): string | null {
  return (
    callNameFromToken(member.kinship_title) ||
    callNameFromToken(member.relation_label) ||
    callNameFromToken(member.name) ||
    null
  );
}

/**
 * Legal / civil name without the Mom/Dad call-name prefix.
 * Falls back to first + last when the stored name is just "Mom" / "Dad".
 */
export function resolveLegalPersonName(
  member: FamilyDisplayMember,
  callName?: string | null,
): string | null {
  const call = callName ?? resolveParentCallName(member);
  let name = (member.name ?? '').trim();
  if (!name) {
    const composed = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
    return composed || null;
  }

  if (call) {
    const callKey = normalizeKey(call);
    const nameKey = normalizeKey(name);
    if (nameKey === callKey) {
      const composed = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
      return composed || null;
    }
    // "Mom Elena Chen" / "Dad Roberto" → strip leading call-name
    const stripped = name.replace(
      new RegExp(`^(?:step[\\s-]?)?(?:mom|mother|mama|mami|dad|father|papa|papi)\\s+`, 'i'),
      '',
    ).trim();
    if (stripped && normalizeKey(stripped) !== callKey) return stripped;
  }

  // Name is a real person name (not only a kinship word)
  if (!callNameFromToken(name)) return name;

  const composed = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
  return composed || null;
}

/**
 * Primary tree label. Parents become `Mom (First Last)` / `Dad (First Last)`
 * when both the call-name and a legal name are known.
 */
export function formatFamilyMemberDisplayName(member: FamilyDisplayMember): string {
  const call = resolveParentCallName(member);
  const legal = resolveLegalPersonName(member, call);
  if (call && legal) return `${call} (${legal})`;
  if (call) return call;
  return (member.name ?? '').trim() || 'Unknown';
}

/** Secondary subtitle under the primary label — skip when already encoded above. */
export function formatFamilyMemberSubtitle(member: FamilyDisplayMember): string | null {
  const call = resolveParentCallName(member);
  const primary = formatFamilyMemberDisplayName(member);
  if (call && primary.startsWith(`${call} (`)) return null;
  const label = (member.relation_label ?? '').trim();
  if (!label || normalizeKey(label) === normalizeKey(primary)) return null;
  if (call && normalizeKey(label) === normalizeKey(call)) return null;
  return label;
}
