/**
 * Client mirror of server personNameEpithet — clean identity vs intentional
 * "Name the Epithet" display composition.
 */

const FROM_WITH_THE_RE = /\b(?:from|with|of|at|in|on|to)\s+the\b/i;
const THE_EPITHET_TAIL_RE = /^(.*?)\s{1,40}the\s{1,40}([\w][\w ]{0,80})$/i;

export type PersonNameEpithetSplit = {
  baseName: string;
  epithet: string | null;
};

function titleCaseEpithet(raw: string): string {
  return raw
    .trim()
    .replace(/^the\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function splitPersonNameEpithet(raw: string): PersonNameEpithetSplit {
  const name = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { baseName: '', epithet: null };
  if (FROM_WITH_THE_RE.test(name)) {
    return { baseName: name, epithet: null };
  }
  const m = name.match(THE_EPITHET_TAIL_RE);
  if (!m) return { baseName: name, epithet: null };
  const base = m[1].trim();
  const epithetRaw = m[2].trim();
  if (!base || !epithetRaw) return { baseName: name, epithet: null };
  if (base.split(' ').length > 5) return { baseName: name, epithet: null };
  return { baseName: base, epithet: titleCaseEpithet(epithetRaw) };
}

export function stripPersonNameEpithet(raw: string): string {
  return splitPersonNameEpithet(raw).baseName;
}

export function normalizeEpithetText(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const cleaned = titleCaseEpithet(raw);
  return cleaned || null;
}

/**
 * Identity themes / chapter titles ("Isolation And Resilience") are not
 * personality nicknames. "Name the Isolation And Resilience" is not a card title.
 */
export function isThemeShapedEpithet(raw: string | null | undefined): boolean {
  const e = normalizeEpithetText(raw);
  if (!e) return false;
  return /\s+(?:and|&)\s+/i.test(e);
}

export function resolveStoredEpithet(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata || metadata.epithet_disabled === true) return null;
  const fromEpithet = normalizeEpithetText(
    typeof metadata.epithet === 'string' ? metadata.epithet : null,
  );
  if (fromEpithet) {
    return isThemeShapedEpithet(fromEpithet) && metadata.epithet_pinned !== true
      ? null
      : fromEpithet;
  }
  const fromContextual = normalizeEpithetText(
    typeof metadata.contextual_title === 'string' ? metadata.contextual_title : null,
  );
  if (fromContextual && isThemeShapedEpithet(fromContextual) && metadata.epithet_pinned !== true) {
    return null;
  }
  return fromContextual;
}

export function composeDisplayNameWithEpithet(
  baseName: string,
  epithet: string | null | undefined,
): string {
  const base = stripPersonNameEpithet(baseName).trim();
  const e = normalizeEpithetText(epithet);
  if (!base) return e ? `the ${e}` : '';
  if (!e) return base;
  if (new RegExp(`\\bthe\\s+${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(base)) {
    return base;
  }
  return `${base} the ${e}`;
}
