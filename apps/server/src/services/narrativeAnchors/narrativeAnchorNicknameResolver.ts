/**
 * Nickname / honorific resolution — do not infer kinship from token alone.
 */

import type { HonorificResolution } from './narrativeAnchorCognitionTypes';

const KINSHIP_TITLES =
  /^(t[ií]o|t[ií]a|tio|tia|uncle|aunt|abuela|abuelo|grandma|grandpa|mama|papa|mom|dad|cousin|primo|prima)\b/i;

const SCENE_PREFIX =
  /^(goth|ska|punk|metal|club|scene|dj|mc|los|la|el)\b/i;

/**
 * Resolve whether a surface form is literal kinship vs nickname/scene identity.
 */
export function resolveHonorific(surfaceForm: string): HonorificResolution {
  const raw = (surfaceForm ?? '').trim();
  const reasons: string[] = [];
  if (!raw) {
    return {
      surfaceForm: raw,
      interpretation: 'UNKNOWN',
      cleanedName: raw,
      confidence: 0.1,
      reasons: ['empty'],
    };
  }

  // Strip trailing possessive for analysis
  const base = raw.replace(/['’]s$/i, '').trim();

  // "Goth Tio" / "Ska Tio" — scene nickname, not uncle
  const tokens = base.split(/\s+/);
  if (tokens.length >= 2 && SCENE_PREFIX.test(tokens[0]!) && KINSHIP_TITLES.test(tokens[tokens.length - 1]!)) {
    reasons.push('scene_prefix_plus_kinship_token_nickname');
    return {
      surfaceForm: raw,
      interpretation: 'NICKNAME',
      cleanedName: base,
      confidence: 0.9,
      reasons,
    };
  }

  // "Tío Ralph" / "Tía Grace" — literal kinship title + given name
  if (tokens.length >= 2 && KINSHIP_TITLES.test(tokens[0]!) && !SCENE_PREFIX.test(tokens[0]!)) {
    const given = tokens.slice(1).join(' ');
    if (/^[A-ZÁÉÍÓÚÑ][\p{L}'-]+$/u.test(given) || /^[A-Za-zÁÉÍÓÚÑáéíóúñ][\p{L}'-]+$/u.test(given)) {
      reasons.push('title_plus_given_name_literal_kinship');
      const rel = tokens[0]!.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      let kinshipRelation = 'relative';
      if (/^tio$/.test(rel)) kinshipRelation = 'uncle';
      if (/^tia$/.test(rel)) kinshipRelation = 'aunt';
      if (/^abuela$/.test(rel)) kinshipRelation = 'grandmother';
      if (/^abuelo$/.test(rel)) kinshipRelation = 'grandfather';
      return {
        surfaceForm: raw,
        interpretation: 'LITERAL_KINSHIP_TITLE',
        cleanedName: base,
        kinshipRelation,
        confidence: 0.85,
        reasons,
      };
    }
  }

  // Bare "Tio" alone is weak
  if (tokens.length === 1 && KINSHIP_TITLES.test(tokens[0]!)) {
    reasons.push('bare_kinship_token_unknown');
    return {
      surfaceForm: raw,
      interpretation: 'UNKNOWN',
      cleanedName: base,
      confidence: 0.3,
      reasons,
    };
  }

  reasons.push('default_unknown');
  return {
    surfaceForm: raw,
    interpretation: 'UNKNOWN',
    cleanedName: base,
    confidence: 0.4,
    reasons,
  };
}

export function isNicknameFamilyFalsePositive(name: string): boolean {
  const r = resolveHonorific(name);
  return r.interpretation === 'NICKNAME';
}

export function familySignalFromPersonNames(peopleNames: string[]): {
  hasLiteralFamily: boolean;
  hasNicknameFalsePositive: boolean;
  details: HonorificResolution[];
} {
  const details = peopleNames.map(resolveHonorific);
  return {
    hasLiteralFamily: details.some((d) => d.interpretation === 'LITERAL_KINSHIP_TITLE'),
    hasNicknameFalsePositive: details.some((d) => d.interpretation === 'NICKNAME'),
    details,
  };
}
