/**
 * Learn the narrator's confirmed sex, gender, orientation, and dating
 * preference from explicit first-person statements only.
 *
 * Never infer from who they date, crushes, or third-person talk.
 * Writes stay on the signed-in user's self character.
 */

export const SELF_SEX_VALUES = ['male', 'female', 'nonbinary'] as const;
export const SELF_GENDER_VALUES = ['man', 'woman', 'nonbinary', 'trans_man', 'trans_woman'] as const;
export const SELF_ORIENTATION_VALUES = [
  'gay',
  'lesbian',
  'bisexual',
  'heterosexual',
  'queer',
  'asexual',
  'pansexual',
] as const;

export type SelfSexValue = (typeof SELF_SEX_VALUES)[number];
export type SelfGenderValue = (typeof SELF_GENDER_VALUES)[number];
export type SelfOrientationValue = (typeof SELF_ORIENTATION_VALUES)[number];

export type SelfDatingPreference = {
  partner_sexes: SelfSexValue[];
  label: string;
};

export type ParsedSelfRomanticIdentity = {
  sex?: SelfSexValue;
  gender_identity?: SelfGenderValue;
  sexual_orientation?: SelfOrientationValue;
  pronouns?: string;
  dating_preference?: SelfDatingPreference;
  evidence: string[];
};

const QUESTION_SENTENCE = /^(?:am i|are you|is it|do you think i(?:'m| am))\b/i;
const NEGATION = /\b(?:not|never|no longer|don't|do not|isn't|is not)\b/i;

function sentences(text: string): string[] {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function usableSentence(sentence: string): boolean {
  if (!sentence) return false;
  if (sentence.endsWith('?') || QUESTION_SENTENCE.test(sentence)) return false;
  if (NEGATION.test(sentence)) return false;
  return true;
}

function partnerSexesFromLabel(raw: string): SelfDatingPreference | null {
  const key = raw.toLowerCase();
  if (['women', 'woman', 'girls', 'girl', 'females', 'female'].includes(key)) {
    return { partner_sexes: ['female'], label: 'women' };
  }
  if (['men', 'man', 'guys', 'guy', 'males', 'male'].includes(key)) {
    return { partner_sexes: ['male'], label: 'men' };
  }
  if (['both', 'everyone', 'anybody', 'anyone', 'people'].includes(key)) {
    return { partner_sexes: ['male', 'female', 'nonbinary'], label: 'anyone' };
  }
  return null;
}

export function parseSelfRomanticIdentity(text: string): ParsedSelfRomanticIdentity | null {
  const parsed: ParsedSelfRomanticIdentity = { evidence: [] };

  for (const sentence of sentences(text)) {
    if (!usableSentence(sentence)) continue;
    const s = sentence.toLowerCase();

    const pronouns = sentence.match(
      /\bmy pronouns (?:are|is)\s+(he\/him|she\/her|they\/them|he\/they|she\/they)\b/i,
    );
    if (pronouns?.[1]) {
      parsed.pronouns = pronouns[1].toLowerCase();
      parsed.evidence.push(sentence);
      if (/^he\//.test(parsed.pronouns) && !parsed.sex) parsed.sex = 'male';
      if (/^she\//.test(parsed.pronouns) && !parsed.sex) parsed.sex = 'female';
      if (/^they\//.test(parsed.pronouns) && !parsed.sex) parsed.sex = 'nonbinary';
    }

    const trans = s.match(/\bi(?:'m| am)(?: a)? trans(?:gender)?(?:\s+)?(man|woman|male|female)?\b/);
    if (trans) {
      const side = trans[1];
      if (side === 'man' || side === 'male') {
        parsed.gender_identity = 'trans_man';
        parsed.sex = parsed.sex ?? 'male';
      } else if (side === 'woman' || side === 'female') {
        parsed.gender_identity = 'trans_woman';
        parsed.sex = parsed.sex ?? 'female';
      } else {
        parsed.gender_identity = parsed.gender_identity ?? 'nonbinary';
      }
      parsed.evidence.push(sentence);
    }

    const gender = s.match(
      /\bi(?:'m| am)(?: a| an)? (?:cis(?:gender)? )?(man|woman|male|female|guy|girl|non[- ]?binary|enby)\b/,
    );
    if (gender?.[1] && !parsed.gender_identity?.startsWith('trans_')) {
      const g = gender[1].replace(/[\s-]/g, '');
      if (g === 'man' || g === 'male' || g === 'guy') {
        parsed.gender_identity = parsed.gender_identity ?? 'man';
        parsed.sex = parsed.sex ?? 'male';
      } else if (g === 'woman' || g === 'female' || g === 'girl') {
        parsed.gender_identity = parsed.gender_identity ?? 'woman';
        parsed.sex = parsed.sex ?? 'female';
      } else {
        parsed.gender_identity = 'nonbinary';
        parsed.sex = parsed.sex ?? 'nonbinary';
      }
      parsed.evidence.push(sentence);
    }

    const orientation = s.match(
      /\bi(?:'m| am)(?: a| an)? (gay|lesbian|bisexual|bi|pansexual|pan|queer|asexual|ace|straight|heterosexual|hetero)\b/,
    );
    if (orientation?.[1]) {
      const o = orientation[1];
      if (o === 'lesbian') {
        parsed.sexual_orientation = 'lesbian';
        parsed.sex = parsed.sex ?? 'female';
        parsed.dating_preference = parsed.dating_preference ?? { partner_sexes: ['female'], label: 'women' };
      } else if (o === 'gay') {
        parsed.sexual_orientation = 'gay';
      } else if (o === 'bisexual' || o === 'bi') {
        parsed.sexual_orientation = 'bisexual';
        parsed.dating_preference = parsed.dating_preference ?? {
          partner_sexes: ['male', 'female', 'nonbinary'],
          label: 'anyone',
        };
      } else if (o === 'pansexual' || o === 'pan') {
        parsed.sexual_orientation = 'pansexual';
        parsed.dating_preference = parsed.dating_preference ?? {
          partner_sexes: ['male', 'female', 'nonbinary'],
          label: 'anyone',
        };
      } else if (o === 'queer') {
        parsed.sexual_orientation = 'queer';
      } else if (o === 'asexual' || o === 'ace') {
        parsed.sexual_orientation = 'asexual';
      } else {
        parsed.sexual_orientation = 'heterosexual';
      }
      parsed.evidence.push(sentence);
    }

    const preference = s.match(
      /\bi(?:'m| am)?(?: only)? (?:attracted to|into|date|dating|like dating|prefer(?: dating)?|like)\s+(men|women|guys|girls|males|females|both|everyone|anybody|anyone)\b/,
    );
    if (preference?.[1]) {
      const next = partnerSexesFromLabel(preference[1]);
      if (next) {
        parsed.dating_preference = next;
        parsed.evidence.push(sentence);
      }
    }
  }

  const hasIdentity =
    Boolean(parsed.sex) ||
    Boolean(parsed.gender_identity) ||
    Boolean(parsed.sexual_orientation) ||
    Boolean(parsed.pronouns) ||
    Boolean(parsed.dating_preference);
  if (!hasIdentity) return null;
  parsed.evidence = [...new Set(parsed.evidence)];
  return parsed;
}

export function selfRomanticIdentitySignalRe(): RegExp {
  return /\b(i(?:'m| am)(?: a| an)? (?:cis(?:gender)? )?(?:gay|lesbian|bisexual|bi|pansexual|pan|queer|asexual|ace|straight|heterosexual|hetero|man|woman|male|female|guy|girl|non[- ]?binary|enby|trans(?:gender)?)|my pronouns|attracted to|like dating|i date|i like (?:men|women|guys|girls)|sexual orientation|gender identity)\b/i;
}

export function formatSelfRomanticIdentityLines(meta: Record<string, unknown> | null | undefined): string[] {
  if (!meta) return [];
  const lines: string[] = [];
  const sex = typeof meta.sex === 'string' && meta.sex !== 'unknown' ? meta.sex : null;
  const gender = typeof meta.gender_identity === 'string' && meta.gender_identity !== 'unknown' ? meta.gender_identity : null;
  const orientation =
    typeof meta.sexual_orientation === 'string' && meta.sexual_orientation !== 'unknown'
      ? meta.sexual_orientation
      : null;
  const pronouns = typeof meta.pronouns === 'string' && meta.pronouns.trim() ? meta.pronouns.trim() : null;
  const pref = meta.dating_preference as SelfDatingPreference | undefined;
  if (gender) lines.push(`Gender: ${gender.replace(/_/g, ' ')}`);
  if (sex) lines.push(`Sex: ${sex}`);
  if (pronouns) lines.push(`Pronouns: ${pronouns}`);
  if (orientation) lines.push(`Orientation: ${orientation}`);
  if (pref?.label) lines.push(`Dating preference: ${pref.label}`);
  return lines;
}

export function mergeSelfRomanticIdentityMetadata(
  existing: Record<string, unknown>,
  parsed: ParsedSelfRomanticIdentity,
  now = new Date().toISOString(),
): Record<string, unknown> {
  const next = { ...existing };
  const confirm = (key: string, value: unknown) => {
    next[key] = value;
    next[`${key}_source`] = 'user_confirmed';
    next[`${key}_confirmed_at`] = now;
  };

  if (parsed.sex) confirm('sex', parsed.sex);
  if (parsed.gender_identity) confirm('gender_identity', parsed.gender_identity);
  if (parsed.sexual_orientation) confirm('sexual_orientation', parsed.sexual_orientation);
  if (parsed.pronouns) {
    next.pronouns = parsed.pronouns;
    next.pronouns_source = 'user_confirmed';
    next.pronouns_confirmed_at = now;
  }
  if (parsed.dating_preference) {
    next.dating_preference = {
      ...parsed.dating_preference,
      source: 'user_confirmed',
      confirmed_at: now,
    };
  }
  return next;
}

export function selfRomanticIdentityFacts(parsed: ParsedSelfRomanticIdentity): string[] {
  const facts: string[] = [];
  if (parsed.gender_identity) facts.push(`Gender identity is ${parsed.gender_identity.replace(/_/g, ' ')}`);
  if (parsed.sex) facts.push(`Sex is ${parsed.sex}`);
  if (parsed.pronouns) facts.push(`Pronouns are ${parsed.pronouns}`);
  if (parsed.sexual_orientation) facts.push(`Sexual orientation is ${parsed.sexual_orientation}`);
  if (parsed.dating_preference) facts.push(`Is attracted to ${parsed.dating_preference.label}`);
  return facts;
}
