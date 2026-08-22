/**
 * Reject character candidates that are not stable person identities.
 *
 * Deterministic, no LLM. Only fires for the `characters` domain.
 *
 * Nearby software/place nouns in the same sentence must not retype a
 * person-shaped name (Maya next to Claude Code, Jamie Park after class).
 */

import { classifyActorLabel, mayPromoteToCharacter } from '../../actors/actorLabelPolicy';
import {
  classifyEntity,
  isCharacterEligible,
  isUnknownEntity,
  type EntityClass,
} from '../../entities/entityClassifier';
import { isIndividualPersonName } from '../../../utils/personNameValidation';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EntityQualityCandidate, EntityQualityVerdict } from './entityQualityGuardTypes';

const PROCESS_OR_META = new Set([
  'background check',
  'user mentioned',
  'relationships',
  'quality assurance',
  'quality assurance technician',
]);

const MEDIA_TITLES = new Set(['one piece', 'attack on titan', 'naruto']);

const SOFTWARE_TOOLS = new Set([
  'claude code',
  'cursor',
  'codex',
  'chatgpt',
  'github copilot',
  'windsurf',
]);

const JOB_TITLE_SPAN =
  /\b(?:technician|engineer|manager|analyst|specialist|coordinator|associate|intern|developer|designer|operator|supervisor|recruiter|quality assurance)\b/i;

const ACADEMIC_DISCIPLINE =
  /^(?:electrical|mechanical|software|computer|civil|chemical)\s+engineering$|^computer\s+science$|^failure\s+analysis$/i;

const TITLE_CASE_PERSON =
  /^[A-ZÀ-Ý][a-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][a-zÀ-ÿ'’-]+){0,2}$/;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasLocativePlaceEvidence(name: string, context: string): boolean {
  const n = escapeRe(name);
  return new RegExp(
    `\\b(?:went to|walked to|to|at|in|near)\\s+${n}\\b|\\b${n}\\s+for the hike\\b`,
    'i',
  ).test(context);
}

function hasPersonMeetingEvidence(name: string, context: string): boolean {
  const n = escapeRe(name);
  if (new RegExp(`\\bmet\\s+at\\s+${n}\\b`, 'i').test(context)) return false;
  return new RegExp(
    `\\b(?:had coffee with|coffee with|met|talked (?:to |with )?)[^.!?]{0,80}\\b${n}\\b|\\b${n}\\b[^.!?]{0,50}\\b(?:after class|waved|sat down|joined|stopped by)\\b`,
    'i',
  ).test(context);
}

function reject(name: string, rule: string): EntityQualityVerdict {
  return {
    gate: 'reject',
    name,
    domain: 'characters',
    rejectionReason: rule,
    confidence: 0,
    provenance: [{ guard: 'characterCandidateGuard', rule }],
    requiresReview: false,
  };
}

function shouldKeepPersonDespiteType(
  name: string,
  key: string,
  nameOnlyType: EntityClass,
  contextType: EntityClass,
  groundedContext: string,
): boolean {
  const personShape = TITLE_CASE_PERSON.test(name) && isIndividualPersonName(name);

  if ((contextType === 'APP' || contextType === 'PRODUCT') && !SOFTWARE_TOOLS.has(key) && personShape) {
    return nameOnlyType === 'PERSON' || isUnknownEntity(nameOnlyType);
  }

  if ((contextType === 'PLACE' || contextType === 'LOCATION') && personShape && groundedContext) {
    return hasPersonMeetingEvidence(name, groundedContext) && !hasLocativePlaceEvidence(name, groundedContext);
  }

  return false;
}

export function guardCharacterCandidate(candidate: EntityQualityCandidate): EntityQualityVerdict | null {
  if (candidate.domain !== 'characters') return null;
  const name = candidate.name.trim();
  if (!name) return null;
  const key = normalizeNameKey(name);

  if (PROCESS_OR_META.has(key)) return reject(name, 'process_or_meta_label');
  if (MEDIA_TITLES.has(key)) return reject(name, 'media_title_not_person');
  if (SOFTWARE_TOOLS.has(key)) return reject(name, 'software_tool_not_person');
  if (ACADEMIC_DISCIPLINE.test(name)) return reject(name, 'academic_discipline_not_person');

  const groundedContext = [candidate.evidence, candidate.contextText].filter(Boolean).join(' ');
  const nameOnly = classifyEntity(name);
  const classification = groundedContext ? classifyEntity(name, groundedContext) : nameOnly;
  if (!isCharacterEligible(classification.type) && classification.type !== 'UNKNOWN') {
    if (!shouldKeepPersonDespiteType(name, key, nameOnly.type, classification.type, groundedContext)) {
      return reject(name, `canonical_type_${classification.type.toLowerCase()}`);
    }
  }

  const actor = mayPromoteToCharacter(name);
  if (!actor) {
    const label = classifyActorLabel(name);
    if (label.action === 'unresolved' || label.action === 'anonymous') {
      return reject(name, label.reason ?? 'unresolved_reference');
    }
    return reject(name, label.reason ?? 'not_promotable_person');
  }

  const tokens = name.split(/\s+/);
  if (tokens.length >= 2 && JOB_TITLE_SPAN.test(tokens[tokens.length - 1] ?? '')) {
    return reject(name, 'job_title_not_person');
  }

  if (!isIndividualPersonName(name)) {
    return reject(name, 'not_individual_person_name');
  }

  return null;
}
