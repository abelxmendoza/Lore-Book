import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EmotionAttachedTo, EmotionAttachmentEntityType } from './emotionInferenceTypes';

const SKIP_NAMES = new Set([
  'i',
  'the',
  'my',
  'we',
  'he',
  'she',
  'they',
  'it',
  'after',
  'before',
  'when',
  'today',
  'amazon',
  'lorebook',
]);

const EVENT_PATTERNS: Array<{ re: RegExp; title: string; entityType: EmotionAttachmentEntityType }> = [
  { re: /\bSka Prom\b/i, title: 'Ska Prom', entityType: 'event' },
  { re: /\b(?:Amazon(?:\s+(?:offer|interview))?)\b/i, title: 'Amazon offer', entityType: 'event' },
  { re: /\b(?:job rejection|rejected from)\b/i, title: 'job rejection event', entityType: 'event' },
  { re: /\b(?:birthday|my birthday)\b/i, title: 'birthday', entityType: 'event' },
  { re: /\b(?:fight|got kicked out)\b/i, title: 'conflict event', entityType: 'event' },
];

const PROJECT_PATTERNS: Array<{ re: RegExp; title: string }> = [
  { re: /\bLoreBook\b/i, title: 'LoreBook' },
  { re: /\bOmega-1\b/i, title: 'Omega-1' },
];

function extractPersonNames(text: string): string[] {
  const names: string[] = [];
  const re = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  for (const match of text.matchAll(re)) {
    const name = match[1].trim();
    const key = normalizeNameKey(name);
    if (SKIP_NAMES.has(key) || names.some((n) => normalizeNameKey(n) === key)) continue;
    names.push(name);
  }
  return names;
}

function nearestAttachment(
  text: string,
  clause: string,
  knownEntities?: Record<
    string,
    { entityType: EmotionAttachmentEntityType; entityId?: string; inferredTitle?: string }
  >,
): EmotionAttachedTo {
  const searchBlob = clause || text;

  if (knownEntities) {
    for (const [key, meta] of Object.entries(knownEntities)) {
      if (searchBlob.toLowerCase().includes(key.toLowerCase())) {
        return {
          entityType: meta.entityType,
          entityId: meta.entityId,
          inferredTitle: meta.inferredTitle ?? key,
        };
      }
    }
  }

  for (const { re, title, entityType } of EVENT_PATTERNS) {
    if (re.test(searchBlob)) {
      return { entityType, inferredTitle: title };
    }
  }

  for (const { re, title } of PROJECT_PATTERNS) {
    if (re.test(searchBlob)) {
      return { entityType: 'project', inferredTitle: title };
    }
  }

  const people = extractPersonNames(searchBlob);
  if (people.length >= 2) {
    return {
      entityType: 'relationship',
      inferredTitle: `${people[0]} & ${people[1]}`,
    };
  }
  if (people.length === 1) {
    return { entityType: 'person', inferredTitle: people[0] };
  }

  if (/\b(?:ghosted|blocked|relationship|crush|dating)\b/i.test(searchBlob)) {
    const fallbackPerson = extractPersonNames(text)[0];
    if (fallbackPerson) {
      return { entityType: 'relationship', inferredTitle: `${fallbackPerson} relationship arc` };
    }
  }

  if (/\b(?:memory|remember|never forgot|still think about)\b/i.test(searchBlob)) {
    return { entityType: 'memory', inferredTitle: extractMemoryTitle(searchBlob) };
  }

  return { entityType: 'narrative_anchor', inferredTitle: inferNarrativeAnchorTitle(searchBlob) };
}

function extractMemoryTitle(clause: string): string {
  const m = clause.match(/\b(?:about|with|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (m) return `${m[1]} memory`;
  const person = extractPersonNames(clause)[0];
  return person ? `${person} memory` : 'relationship memory';
}

function inferNarrativeAnchorTitle(clause: string): string {
  if (/\boffer\b/i.test(clause)) return 'job offer moment';
  if (/\bjump me\b/i.test(clause)) return 'threat incident';
  if (/\bghosted\b/i.test(clause)) return 'ghosting incident';
  return 'emotional moment';
}

export function attachEmotionToNearestTarget(
  text: string,
  clause: string,
  knownEntities?: EmotionInferenceInputKnownEntities,
): EmotionAttachedTo {
  return nearestAttachment(text, clause, knownEntities);
}

type EmotionInferenceInputKnownEntities = Record<
  string,
  { entityType: EmotionAttachmentEntityType; entityId?: string; inferredTitle?: string }
>;

export function splitMixedEmotionClauses(text: string): string[] {
  if (!/\b(?:but|however|though)\b/i.test(text)) return [text];
  return text
    .split(/\b(?:but|however|though)\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}
