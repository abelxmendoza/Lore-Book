/**
 * Deterministic context-aware actor label enrichment.
 *
 * Used when minting unnamed/group candidates so labels answer:
 * "If I read this six months from now, will I remember who this was?"
 *
 * No LLM — pure string heuristics from surrounding message cues.
 */

import { isVagueActorLabel, isVagueOrIndefiniteActorPhrase } from './actorLabelPolicy';

const MAX_LABEL_LEN = 72;

export type EnrichActorLabelInput = {
  raw: string;
  messageText?: string;
  places?: string[];
  orgs?: string[];
  actions?: string[];
  /** Prefer GROUP-shaped labels when true. */
  asGroup?: boolean;
};

export type EnrichActorLabelResult = {
  label: string;
  description?: string;
  enriched: boolean;
};

function titleCaseWords(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
    .replace(/\b(Who|That|From|With|At|In|On|Of|The|And)\b/g, (m) => m.toLowerCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function clip(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX_LABEL_LEN) return t;
  return `${t.slice(0, MAX_LABEL_LEN - 1).trim()}…`;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function inferAction(text: string): string | null {
  return firstMatch(text, [
    /\b(?:who\s+)?(?:reposted|shared|amplified|posted about)\s+([^.!?]{3,40})/i,
    /\b(?:discussing|talking about)\s+([^.!?]{3,40})/i,
    /\b(?:comment(?:ed|ing)?|respond(?:ed|ing)?)\s+(?:to\s+)?([^.!?]{3,40})/i,
    /\b(?:attended|at)\s+([A-Z][A-Za-z0-9&.'\s-]{2,40})/,
    /\b(?:removed|banned|kicked)\s+[^.!?]{0,20}\s+from\s+([A-Z][A-Za-z0-9&.'\s-]{2,40})/,
  ]);
}

function inferPlace(text: string, places: string[]): string | null {
  for (const p of places) {
    if (p && text.toLowerCase().includes(p.toLowerCase())) return p;
  }
  return firstMatch(text, [
    /\bat\s+([A-Z][A-Za-z0-9&.'\s-]{2,40})/,
    /\bin\s+([A-Z][A-Za-z0-9&.'\s-]{2,40})/,
    /\bfrom\s+([A-Z][A-Za-z0-9&.'\s-]{2,40})/,
  ]);
}

function baseRole(raw: string, asGroup: boolean): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^(?:a|an|one|some|that|this)\s+girl$/.test(key) || key === 'girl') {
    return asGroup ? 'Other women' : 'Anonymous woman';
  }
  if (/^(?:a|an|one|some|that|this)\s+guy$/.test(key) || key === 'guy') {
    return asGroup ? 'Other men' : 'Anonymous man';
  }
  if (/other girls|girls/.test(key)) return 'Other girls';
  if (/people in the scene|people/.test(key)) return 'Members of the scene';
  if (/egirls?|e-girls?/.test(key)) return 'Online creators';
  if (/friends/.test(key)) return 'Friends';
  if (/coworkers?|co-workers?/.test(key)) return 'Coworkers';
  if (/organizers?/.test(key)) return 'Event organizers';
  if (/attendees?/.test(key)) return 'Attendees';
  if (/fans?/.test(key)) return 'Fans';
  if (/commenters?/.test(key)) return 'Online commenters';
  return raw.trim();
}

/**
 * Enrich a vague or thin actor label using message context.
 * Returns the original (title-cased) label when already contextual.
 */
export function enrichActorLabel(input: EnrichActorLabelInput): EnrichActorLabelResult {
  const raw = (input.raw ?? '').trim();
  if (!raw) return { label: '', enriched: false };

  const messageText = input.messageText ?? '';
  const places = input.places ?? [];
  const orgs = input.orgs ?? [];
  const actions = input.actions ?? [];
  const asGroup = input.asGroup === true;

  if (!isVagueOrIndefiniteActorPhrase(raw) && !isVagueActorLabel(raw)) {
    return { label: clip(raw), enriched: false };
  }

  const role = baseRole(raw, asGroup);
  const actionHint = actions[0] || inferAction(messageText);
  const placeHint = places[0] || inferPlace(messageText, places);
  const orgHint = orgs[0] || null;

  let label = role;
  if (actionHint && /\bwho\b/i.test(actionHint) === false) {
    // "Other girls who reposted …"
    const actionBit = actionHint.length > 48 ? `${actionHint.slice(0, 45)}…` : actionHint;
    if (/^who\b/i.test(actionBit)) {
      label = `${role} ${actionBit}`;
    } else if (/\b(?:repost|share|amplif|post|discuss|comment|respond|attend)/i.test(actionBit)) {
      label = `${role} who ${actionBit.replace(/^(?:who\s+)/i, '')}`;
    } else {
      label = `${role} — ${actionBit}`;
    }
  } else if (placeHint) {
    label = asGroup ? `${role} at ${placeHint}` : `${role} at ${placeHint}`;
  } else if (orgHint) {
    label = `${role} from ${orgHint}`;
  } else if (asGroup) {
    // Still too thin — prefix Members/ of if we only have a category
    if (/^members\b/i.test(role) === false && /scene|community|crowd/i.test(role)) {
      label = role;
    }
  } else if (/^anonymous\b/i.test(role) === false && /woman|man|person/i.test(role)) {
    label = role.startsWith('Anonymous') ? role : `Anonymous ${role.replace(/^anonymous\s+/i, '')}`;
  }

  label = clip(titleCaseWords(label));

  const descriptionParts: string[] = [];
  if (placeHint) descriptionParts.push(`Associated with ${placeHint}.`);
  if (orgHint) descriptionParts.push(`Linked to ${orgHint}.`);
  if (actionHint) descriptionParts.push(`Role: ${actionHint}.`);

  return {
    label,
    description: descriptionParts.length ? descriptionParts.join(' ') : undefined,
    enriched: label.toLowerCase() !== raw.toLowerCase(),
  };
}
