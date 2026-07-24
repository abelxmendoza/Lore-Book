/**
 * Agent ownership gate — who demonstrated / possessed the capability?
 * Hard rule: only USER subjects may enter the owner's Skills Book from inference.
 *
 * Known person names (from entity resolver / character registry) strengthen
 * third-person attribution; first-person practice still wins for the user.
 */

import type { SkillAgentResolution, SkillSubjectType } from './skillCognitionTypes';
import { normalizeSkillKey } from './skillIdentity';

const DEFAULT_USER_NAMES = ['i', 'me', 'my', 'myself'];

/** Clear third-person credential / specialty attribution */
const OTHER_ATTRIBUTION: Array<{ re: RegExp; strength: number }> = [
  {
    re: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:earned|received|completed|got)\s+(?:a\s+)?(?:master'?s|bachelor'?s|phd|degree)(?:\s+in\s+([^.!?]+))?/i,
    strength: 0.95,
  },
  {
    re: /\b([A-Z][a-z]+)\s+(?:is|was)\s+(?:a\s+)?(?:[\w]+\s+){0,6}(?:graduate|specialist|expert)(?:\s+(?:in|of)\s+([^.!?]+))?/i,
    strength: 0.92,
  },
  {
    re: /\b([A-Z][a-z]+)\s+specializ(?:es|ed|ing)\s+in\s+([^.!?]+)/i,
    strength: 0.93,
  },
  {
    re: /\b([A-Z][a-z]+)\s+(?:runs?|ran|leads?|led|manages?|managed)\s+(?:the\s+)?([^.!?]{0,40}?)(?:department|team|lab)\b/i,
    strength: 0.9,
  },
  {
    re: /\b([A-Z][a-z]+)'s\s+(?:degree|master'?s|background|expertise|speciali[sz]ation)\s+in\s+([^.!?]+)/i,
    strength: 0.9,
  },
];

const USER_FIRST_PERSON =
  /\b(?:i|i'm|i’ve|i've|i’d|i'd|i’ll|i'll|me|my|myself)\b/i;

const USER_ACTION =
  /\b(?:i)\s+(?:used|built|debug(?:ged)?|investigated|traced|trained|practice[ds]?|wrote|fixed|designed|interviewed|shipped|deployed|implemented|drove|coordinated|scheduled|learned|know|knew|work(?:ed)?|code[sd]?|test(?:ed)?|develop(?:ed)?)\b/i;

export type SkillAgentResolverOptions = {
  userNames?: string[];
  /** Known non-self person names from character / entity registry */
  knownPersonNames?: string[];
  /** When true, empty/missing evidence defaults toward USER (existing book row) */
  preferUserWhenAmbiguous?: boolean;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isUserName(name: string, userNames: string[]): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  if (DEFAULT_USER_NAMES.includes(n)) return true;
  return userNames.some((u) => {
    const un = normalizeName(u);
    return un === n || n.includes(un) || un.includes(n);
  });
}

function skillLinkedToPhrase(span: string, phrase: string | undefined): boolean {
  if (!phrase) return true; // pattern without specialty clause — still attribution-ish
  const spanKey = normalizeSkillKey(span);
  const phraseKey = normalizeSkillKey(phrase);
  if (!spanKey || !phraseKey) return false;
  if (phraseKey.includes(spanKey) || spanKey.includes(phraseKey)) return true;
  // token overlap (electrical engineering vs Electrical Engineering degree)
  const st = new Set(spanKey.split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  const pt = phraseKey.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  let hits = 0;
  for (const t of pt) if (st.has(t)) hits += 1;
  return hits >= Math.min(2, st.size) || (st.size === 1 && hits === 1);
}

function findKnownPersonInText(text: string, knownPersonNames: string[], userNames: string[]): string | undefined {
  let best: { name: string; idx: number } | undefined;
  for (const raw of knownPersonNames) {
    if (!raw || isUserName(raw, userNames)) continue;
    const re = new RegExp(`\\b${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const m = text.match(re);
    if (m && m.index != null) {
      if (!best || m.index < best.idx) best = { name: raw, idx: m.index };
    }
  }
  return best?.name;
}

/**
 * Resolve who the skill evidence is about.
 */
export function resolveSkillAgent(
  span: string,
  evidenceText: string,
  opts: SkillAgentResolverOptions = {},
): SkillAgentResolution {
  const text = `${evidenceText || ''} ${span || ''}`.trim();
  const userNames = (opts.userNames ?? []).filter(Boolean);
  const knownPersonNames = (opts.knownPersonNames ?? []).filter(Boolean);
  const reasons: string[] = [];

  if (!text || text === span.trim()) {
    if (opts.preferUserWhenAmbiguous) {
      return {
        subjectType: 'USER',
        subjectName: userNames[0] ?? 'user',
        resolutionMethod: 'conversation_subject',
        confidence: 0.55,
        reasons: ['empty_evidence_prefer_user_registry'],
      };
    }
    return {
      subjectType: 'UNKNOWN',
      resolutionMethod: 'unresolved',
      confidence: 0.2,
      reasons: ['empty_evidence'],
    };
  }

  const hasUserFirst = USER_FIRST_PERSON.test(text);
  const hasUserAction = USER_ACTION.test(text);

  // 1) Explicit other-person attribution that links the *skill span* to them.
  for (const { re, strength } of OTHER_ATTRIBUTION) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const name = m[1].trim();
    if (isUserName(name, userNames) || name.length < 2) continue;
    if (/^(The|A|An|This|That|Our|His|Her|When|After)$/i.test(name)) continue;

    const linkedField = m[2];
    const linked = skillLinkedToPhrase(span, linkedField);
    // Degree/specialty patterns without field still count if span appears near the sentence
    const nearSpan =
      linked
      || new RegExp(
        `${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.!?]{0,80}${span.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      ).test(text)
      || new RegExp(
        `${span.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.!?]{0,80}${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      ).test(text);

    if (!nearSpan && !linked) continue;

    // If user also clearly practices this skill, split: attribution is other person for THAT clause
    // but user action for the skill overall → only block when other attribution is the main claim
    if (hasUserAction && strength < 0.93) {
      reasons.push(`other_person_mentioned:${name}_but_user_action`);
      continue;
    }
    if (hasUserFirst && hasUserAction && linked && strength >= 0.93) {
      // "I work with Ravi who earned a master's in EE" — EE still other person if span is EE
      reasons.push(`other_person_skill_attribution:${name}`);
      return {
        subjectName: name,
        subjectType: 'OTHER_PERSON',
        resolutionMethod: 'explicit_subject',
        confidence: strength,
        reasons,
      };
    }
    if (!hasUserAction) {
      reasons.push(`other_person_skill_attribution:${name}`);
      return {
        subjectName: name,
        subjectType: 'OTHER_PERSON',
        resolutionMethod: 'explicit_subject',
        confidence: strength,
        reasons,
      };
    }
  }

  // 2) User practice wins when present (coworkers can co-appear in evidence)
  if (hasUserAction || (hasUserFirst && /\b(?:built|debug|train|investigat|interview|practice|code|design|drive|coordinat|work|test|develop|ship|fix|learn)\b/i.test(text))) {
    reasons.push('first_person_action');
    return {
      subjectType: 'USER',
      subjectName: userNames[0] ?? 'user',
      resolutionMethod: 'pronoun_resolution',
      confidence: 0.92,
      reasons,
    };
  }

  if (hasUserFirst) {
    reasons.push('first_person_mention');
    return {
      subjectType: 'USER',
      subjectName: userNames[0] ?? 'user',
      resolutionMethod: 'pronoun_resolution',
      confidence: 0.8,
      reasons,
    };
  }

  // 3) Known registry person without user voice
  const known = findKnownPersonInText(text, knownPersonNames, userNames);
  if (known) {
    reasons.push(`known_person_registry:${known}`);
    return {
      subjectName: known,
      subjectType: 'OTHER_PERSON',
      resolutionMethod: 'explicit_subject',
      confidence: 0.8,
      reasons,
    };
  }

  // 4) Possessive third person without first person
  if (/\b(?:his|her|their)\s+(?:degree|master'?s|background|expertise|speciali[sz]ation|department)\b/i.test(text)) {
    reasons.push('third_person_possessive');
    return {
      subjectType: 'OTHER_PERSON',
      resolutionMethod: 'explicit_subject',
      confidence: 0.75,
      reasons,
    };
  }

  // 5) Named subject at sentence start with credential verbs — no first person
  const named = text.match(
    /\b([A-Z][a-z]{2,})\s+(?:is|was|earned|specializes|runs|joined|has|holds)\b/,
  );
  if (named?.[1] && !isUserName(named[1], userNames)) {
    const stop = new Set([
      'The', 'This', 'That', 'When', 'After', 'Before', 'While', 'During', 'With', 'From',
      'Into', 'Over', 'Under', 'LoreBook', 'React', 'Python', 'JavaScript', 'Failure',
      'Software', 'Product', 'Family', 'Social', 'Event', 'Artificial', 'Electrical',
    ]);
    if (!stop.has(named[1])) {
      reasons.push(`named_subject:${named[1]}`);
      return {
        subjectName: named[1],
        subjectType: 'OTHER_PERSON',
        resolutionMethod: 'explicit_subject',
        confidence: 0.72,
        reasons,
      };
    }
  }

  if (opts.preferUserWhenAmbiguous) {
    reasons.push('ambiguous_prefer_user_registry');
    return {
      subjectType: 'USER',
      subjectName: userNames[0] ?? 'user',
      resolutionMethod: 'conversation_subject',
      confidence: 0.5,
      reasons,
    };
  }

  reasons.push('unresolved_subject');
  return {
    subjectType: 'UNKNOWN',
    resolutionMethod: 'unresolved',
    confidence: 0.35,
    reasons,
  };
}

export function isUserOwnedSkill(subject: SkillAgentResolution): boolean {
  return subject.subjectType === 'USER';
}

export function subjectBlocksUserSkillBook(subject: SkillAgentResolution): boolean {
  return subject.subjectType === 'OTHER_PERSON' || subject.subjectType === 'ORGANIZATION' || subject.subjectType === 'FICTIONAL_CHARACTER';
}

export type { SkillSubjectType };
