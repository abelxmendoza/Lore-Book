/**
 * Builds and parses dynamic character display titles from names and references.
 */

import { parseCharacterName } from '../../utils/characterNameMatching';
import { splitPersonName } from '../../utils/nameNormalization';
import {
  evaluateTitleOnlyPersonGuard,
  isMinimumPersonEntity,
} from '../lexical/intelligence/titleOnlyEntityGuard';
import {
  buildContextualReferenceTitle,
  buildFunnyContextSubtitle,
  extractContextSources,
} from './contextualPersonReferenceService';
import type {
  CharacterDisplayTitle,
  CharacterTitleParts,
  CharacterTitleType,
  ContextualReferenceInput,
  TitleBuildResult,
  TitleStability,
} from './personDisplayTitleTypes';

const HONORIFIC_PREFIX =
  /^(Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Doctor|Prof\.?|Professor|Pastor|Rev\.?|Reverend|President|Senator|Mayor|Judge|Principal|Dean|Coach|Officer|Captain|General|Colonel|Sergeant)\.?\s+/i;

const FAMILY_PREFIX =
  /^(Tio|Tía|Tia|Tío|Uncle|Aunt|Auntie|Abuela|Abuelo|Grandma|Grandpa|Primo|Prima|Cousin)\.?\s+/i;

const SUFFIX_RE = /\s+(Jr\.?|Sr\.?|III|IV|II)$/i;

function normalizeHonorific(h: string): string {
  const map: Record<string, string> = {
    mr: 'Mr.',
    mrs: 'Mrs.',
    ms: 'Ms.',
    dr: 'Dr.',
    prof: 'Prof.',
    professor: 'Professor',
    doctor: 'Dr.',
  };
  const key = h.replace(/\./g, '').toLowerCase();
  return map[key] ?? (h.endsWith('.') ? h : `${h.charAt(0).toUpperCase()}${h.slice(1)}`);
}

export function parseTitlePartsFromName(name: string): CharacterTitleParts {
  const raw = name.trim();
  const parts: CharacterTitleParts = {};

  let working = raw;
  const honorificMatch = working.match(HONORIFIC_PREFIX);
  if (honorificMatch) {
    parts.honorific = normalizeHonorific(honorificMatch[1].replace(/\.$/, ''));
    working = working.slice(honorificMatch[0].length).trim();
  }

  const familyMatch = !parts.honorific ? working.match(FAMILY_PREFIX) : null;
  if (familyMatch) {
    parts.honorific = familyMatch[1].charAt(0).toUpperCase() + familyMatch[1].slice(1);
    working = working.slice(familyMatch[0].length).trim();
  }

  const suffixMatch = working.match(SUFFIX_RE);
  if (suffixMatch) {
    parts.suffix = suffixMatch[1];
    working = working.slice(0, -suffixMatch[0].length).trim();
  }

  const split = splitPersonName(working);
  if (split.firstName) parts.givenName = split.firstName;
  if (split.lastName) {
    const lastParts = split.lastName.split(/\s+/);
    if (lastParts.length > 1) {
      parts.middleName = lastParts.slice(0, -1).join(' ');
      parts.familyName = lastParts[lastParts.length - 1];
    } else {
      parts.familyName = split.lastName;
    }
  }

  if (!parts.givenName && !parts.familyName && working) {
    const tokens = working.split(/\s+/);
    if (tokens.length === 1) {
      if (/^[A-Z]/.test(tokens[0]!) && !evaluateTitleOnlyPersonGuard(tokens[0]!).isTitleOnly) {
        parts.nickname = tokens[0];
      }
    }
  }

  return parts;
}

export function inferTitleType(name: string, parts: CharacterTitleParts): CharacterTitleType {
  if (parts.contextualQualifier || /\sfrom\s/i.test(name)) return 'role_contextual';
  if (parts.stageName) return 'stage_name';
  if (parts.nickname && !parts.givenName && !parts.familyName) return 'nickname';
  if (parts.honorific && (parts.givenName || parts.familyName)) {
    if (/^(tio|tía|tia|tío|uncle|aunt|auntie|abuela|abuelo|grandma|grandpa|primo|prima|cousin)/i.test(parts.honorific)) {
      return 'family_title_name';
    }
    return 'honorific_name';
  }
  if (parts.givenName && parts.familyName) return 'legal_or_full_name';
  if (parts.givenName || parts.familyName) return 'legal_or_full_name';
  if (parts.roleTitle) return 'role_contextual';
  return 'unknown_contextual_reference';
}

export function formatTitleFromParts(parts: CharacterTitleParts, titleType?: CharacterTitleType): string {
  if (titleType === 'role_contextual' && parts.roleTitle && parts.contextualQualifier) {
    return `${parts.roleTitle} ${parts.contextualQualifier}`;
  }
  if (parts.stageName) return parts.stageName;
  if (parts.nickname && !parts.givenName && !parts.familyName) return parts.nickname;

  const segments: string[] = [];
  if (parts.honorific) segments.push(parts.honorific);
  if (parts.givenName) segments.push(parts.givenName);
  if (parts.middleName) segments.push(parts.middleName);
  if (parts.familyName) segments.push(parts.familyName);
  if (parts.suffix) segments.push(parts.suffix);
  if (segments.length > 0) return segments.join(' ');

  return parts.roleTitle ?? '';
}

export function buildDisplayTitleFromName(
  characterId: string,
  name: string,
  options: {
    stability?: TitleStability;
    evidencePhrases?: string[];
    messageId?: string;
  } = {}
): TitleBuildResult {
  const guard = evaluateTitleOnlyPersonGuard(name);
  if (guard.isTitleOnly) {
    return {
      rejected: true,
      rejectionReason: 'bare_title_without_context',
      displayTitle: {
        characterId,
        primaryTitle: name,
        titleParts: {},
        titleType: 'unknown_contextual_reference',
        aliases: [],
        stability: 'needs_resolution',
        evidencePhrases: options.evidencePhrases ?? [],
        lastUpdatedFromMessageId: options.messageId,
      },
    };
  }

  const parts = parseTitlePartsFromName(name);
  const parsed = parseCharacterName(name);
  if (parsed.strippedTitle && !parts.honorific) {
    parts.honorific = parsed.strippedTitle;
  }

  const titleType = inferTitleType(name, parts);
  const primaryTitle = formatTitleFromParts(parts, titleType) || name.trim();

  return {
    rejected: false,
    displayTitle: {
      characterId,
      primaryTitle,
      titleParts: parts,
      titleType,
      aliases: [],
      stability: options.stability ?? (guard.hasAttachedName ? 'stable' : 'temporary'),
      evidencePhrases: options.evidencePhrases ?? [],
      lastUpdatedFromMessageId: options.messageId,
    },
  };
}

export function buildDisplayTitleFromContextualReference(
  characterId: string,
  input: ContextualReferenceInput & { stability?: TitleStability }
): TitleBuildResult {
  const built = buildContextualReferenceTitle(input);
  if (built.rejected) {
    return {
      rejected: true,
      rejectionReason: built.reason,
      displayTitle: {
        characterId,
        primaryTitle: input.rolePhrase,
        titleParts: { roleTitle: input.rolePhrase },
        titleType: 'unknown_contextual_reference',
        aliases: [],
        stability: 'needs_resolution',
        evidencePhrases: input.evidencePhrases ?? [],
        lastUpdatedFromMessageId: input.messageId,
      },
    };
  }

  const parts: CharacterTitleParts = {
    roleTitle: built.primaryTitle.split(/\sfrom\s/i)[0]?.trim(),
    contextualQualifier: built.contextualQualifier,
  };

  const subtitle = buildFunnyContextSubtitle(input.text, built.primaryTitle);

  return {
    rejected: false,
    characterSubtitle: subtitle,
    displayTitle: {
      characterId,
      primaryTitle: built.primaryTitle,
      titleParts: parts,
      titleType: 'role_contextual',
      aliases: [],
      stability: input.stability ?? 'temporary',
      evidencePhrases: input.evidencePhrases ?? [input.text.slice(0, 160)],
      lastUpdatedFromMessageId: input.messageId,
    },
  };
}

export function buildDisplayTitleFromMention(
  characterId: string,
  mention: { text: string; rolePhrase?: string; messageId?: string }
): TitleBuildResult {
  const text = mention.text.trim();
  const roleFromText =
    mention.rolePhrase ??
    text.match(/\b(?:the|a|an|my|our)\s+([a-z][\w\s-]{2,40}?)(?:\s+(?:from|at|who|that|emailed|kicked))\b/i)?.[1]?.trim();

  if (roleFromText && evaluateTitleOnlyPersonGuard(roleFromText).isTitleOnly) {
    return buildDisplayTitleFromContextualReference(characterId, {
      rolePhrase: roleFromText,
      text,
      contextSources: extractContextSources(text),
      evidencePhrases: [text.slice(0, 160)],
      messageId: mention.messageId,
    });
  }

  if (isMinimumPersonEntity(text)) {
    return buildDisplayTitleFromName(characterId, text, {
      evidencePhrases: [text.slice(0, 160)],
      messageId: mention.messageId,
    });
  }

  return buildDisplayTitleFromName(characterId, text, {
    stability: 'needs_resolution',
    evidencePhrases: [text.slice(0, 160)],
    messageId: mention.messageId,
  });
}

export function shouldAllowCharacterCreation(titleResult: TitleBuildResult): boolean {
  if (titleResult.rejected) return false;
  const t = titleResult.displayTitle;
  if (t.stability === 'needs_resolution' && t.titleType === 'unknown_contextual_reference') {
    return Boolean(t.titleParts.contextualQualifier || t.titleParts.givenName || t.titleParts.nickname);
  }
  return Boolean(t.primaryTitle.trim());
}
