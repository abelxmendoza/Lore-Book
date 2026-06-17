/**
 * Romantic lexical intelligence — deterministic pre-LLM parsing of love/relationship
 * signals from conversations using the ontology glossary + partner-name heuristics.
 */
import { normalizeNameKey } from '../../utils/nameNormalization';
import { isIndividualPersonName } from '../../utils/personNameValidation';
import {
  discoverRelationshipHints,
  enrichEntity,
  type RelationshipHintHit,
} from './lexicalIntelligence';
import type {
  RomanticRelationshipType,
  RelationshipStatus,
} from '../conversationCentered/romanticRelationshipDetector';

const norm = (s: string) => (s ?? '').toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();

export interface RomanticLexicalHit {
  partnerName: string;
  relationshipType: RomanticRelationshipType;
  status: RelationshipStatus;
  confidence: number;
  evidence: string;
  cues: string[];
  ontologyTags: string[];
  isSituationship: boolean;
}

const JUNK_NAMES = new Set(['me', 'myself', 'you', 'i', 'we', 'they', 'her', 'him', 'them', 'someone']);

const TYPE_RULES: Array<{ re: RegExp; type: RomanticRelationshipType; weight: number }> = [
  { re: /\bmy\s+wife\b|\bmarried\s+to\b|\bhusband\b(?!\s+material)/i, type: 'wife', weight: 0.9 },
  { re: /\bmy\s+husband\b/i, type: 'husband', weight: 0.9 },
  { re: /\bfianc[ée]e\b|\bengaged\s+to\b/i, type: 'fiancée', weight: 0.88 },
  { re: /\bmy\s+girlfriend\b|\bshe(?:'s| is)\s+my\s+girl\b/i, type: 'girlfriend', weight: 0.88 },
  { re: /\bmy\s+boyfriend\b|\bhe(?:'s| is)\s+my\s+man\b/i, type: 'boyfriend', weight: 0.88 },
  { re: /\bex[\s-]?girlfriend\b|\bmy\s+ex\s+girl\b/i, type: 'ex_girlfriend', weight: 0.85 },
  { re: /\bex[\s-]?boyfriend\b|\bmy\s+ex\s+boy\b/i, type: 'ex_boyfriend', weight: 0.85 },
  { re: /\bex[\s-]?wife\b/i, type: 'ex_wife', weight: 0.85 },
  { re: /\bex[\s-]?husband\b/i, type: 'ex_husband', weight: 0.85 },
  { re: /\bex[\s-]?lover\b|\bmy\s+ex\b|\bwas my ex lover\b/i, type: 'ex_lover', weight: 0.82 },
  { re: /\band I broke up\b|\bbroke up a\b/i, type: 'ex_girlfriend', weight: 0.8 },
  { re: /\bsituationship\b|\bnot\s+official\b|\bno\s+label\b/i, type: 'situationship', weight: 0.82 },
  { re: /\bfriends\s+with\s+benefits\b|\bfwb\b/i, type: 'friends_with_benefits', weight: 0.8 },
  { re: /\bfuck\s+buddy\b/i, type: 'fuck_buddy', weight: 0.78 },
  { re: /\bone[\s-]?night\s+stand\b/i, type: 'one_night_stand', weight: 0.8 },
  { re: /\bhooking\s+up\b|\bhooked\s+up\b/i, type: 'hooking_up', weight: 0.75 },
  { re: /\btalking\s+stage\b|\btalking\s+to\b|\bgetting\s+to\s+know\b/i, type: 'talking', weight: 0.72 },
  { re: /\bblocked me\b/i, type: 'ex_lover', weight: 0.77 },
  { re: /\brekindled\b|\bmight be rekindled\b/i, type: 'ex_girlfriend', weight: 0.79 },
  { re: /\binfatuation\b|\bcan(?:'t|not)\s+stop\s+thinking\b/i, type: 'infatuation', weight: 0.78 },
  { re: /\bcrush\b|\bcrush\s+on\b|\battracted\s+to\b|\bfeelings\s+for\b/i, type: 'crush', weight: 0.76 },
  { re: /\bin\s+love\b|\blove\s+her\b|\blove\s+him\b/i, type: 'in_love', weight: 0.82 },
  { re: /\bdating\b|\bwent\s+on\s+a\s+date\b|\bdate\s+with\b/i, type: 'dating', weight: 0.74 },
  { re: /\bmy\s+lover\b|\blover\b/i, type: 'lover', weight: 0.72 },
  { re: /\blust\b|\bphysical\s+chemistry\b/i, type: 'lust', weight: 0.68 },
];

const STATUS_RULES: Array<{ re: RegExp; status: RelationshipStatus; weight: number }> = [
  { re: /\bghosted\b|\bleft\s+on\s+read\b|\bstopped\s+responding\b|\bdisappeared\b/i, status: 'ghosted', weight: 0.85 },
  { re: /\bblocked\b|\bblocked\s+me\b/i, status: 'blocked', weight: 0.88 },
  { re: /\bbroke\s+up\b|\bbreakup\b|\bended\s+things\b|\bsplit\s+up\b|\bmy\s+ex\b/i, status: 'ended', weight: 0.82 },
  { re: /\bon\s+a\s+break\b|\btaking\s+a\s+break\b/i, status: 'on_break', weight: 0.8 },
  { re: /\brekindled\b|\bback\s+together\b|\btalking\s+again\b/i, status: 'rekindled', weight: 0.78 },
  { re: /\bunrequited\b|\bone[\s-]?sided\b|\bthey\s+don(?:'t| not)\s+feel\b/i, status: 'unrequited', weight: 0.76 },
  { re: /\bfading\b|\bdrifting\s+apart\b|\bgrowing\s+distant\b/i, status: 'fading', weight: 0.74 },
  { re: /\bcomplicated\b|\bit(?:'s| is)\s+complicated\b/i, status: 'complicated', weight: 0.72 },
  { re: /\bpaused\b|\bon\s+hold\b/i, status: 'paused', weight: 0.7 },
];

const NAME_PATTERNS: RegExp[] = [
  /\b(?:my\s+)?(?:girlfriend|boyfriend|partner|wife|husband|fianc[ée]e|crush|ex|lover)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+){0,2})\b/g,
  /\b(?:dating|seeing|talking\s+to|hooking\s+up\s+with|went\s+on\s+a\s+date\s+with|situationship\s+with|in\s+love\s+with|crush\s+on|attracted\s+to|obsessed\s+with|infatuation\s+with|feelings\s+for)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+){0,2})\b/gi,
  /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+){0,2})\s+(?:and\s+)?(?:I|we)\s+(?:went\s+on\s+a\s+date|are\s+dating|hooked\s+up|broke\s+up|are\s+on\s+a\s+break|might\s+be\s+rekindled)\b/g,
  /\b(?:with|from|things\s+with)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\b/gi,
  /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+blocked\s+me\b/gi,
  /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+was\s+my\s+ex\s+lover\b/gi,
];

function inferType(text: string): { type: RomanticRelationshipType; confidence: number } {
  let best: { type: RomanticRelationshipType; confidence: number } = { type: 'dating', confidence: 0.55 };
  for (const rule of TYPE_RULES) {
    if (rule.re.test(text)) {
      const score = rule.weight;
      if (score > best.confidence) best = { type: rule.type, confidence: score };
    }
  }
  return best;
}

function inferStatus(text: string, type: RomanticRelationshipType): RelationshipStatus {
  for (const rule of STATUS_RULES) {
    if (rule.re.test(text)) return rule.status;
  }
  if (type.startsWith('ex_')) return 'ended';
  if (['ghosted', 'blocked'].includes(type)) return type as RelationshipStatus;
  return 'active';
}

function extractPartnerNames(text: string): string[] {
  const names = new Set<string>();
  const add = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeNameKey(name);
    if (!name || key.length < 2 || JUNK_NAMES.has(key)) return;
    if (!isIndividualPersonName(name)) return;
    names.add(name);
  };

  for (const re of NAME_PATTERNS) {
    const pattern = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m[1]) add(m[1]);
    }
  }

  const properNoun = /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+){0,2})\b/g;
  const romanticWindow = 80;
  const lower = text.toLowerCase();
  const romanticAnchors = [
    'girlfriend', 'boyfriend', 'dating', 'date with', 'crush', 'lover', 'situationship',
    'hooked up', 'in love', 'my ex', 'ex lover', 'wife', 'husband', 'talking to',
    'blocked', 'broke up', 'rekindled', 'infatuation', 'complicated', 'on a break',
    'feelings for', 'things with', 'ghosted',
  ];
  let match: RegExpExecArray | null;
  while ((match = properNoun.exec(text)) !== null) {
    const idx = match.index;
    const window = lower.slice(Math.max(0, idx - romanticWindow), idx + romanticWindow);
    if (romanticAnchors.some((a) => window.includes(a))) add(match[1]);
  }

  return [...names];
}

function snippetAround(text: string, cue: string, maxLen = 160): string {
  const lower = norm(text);
  const idx = lower.indexOf(cue.toLowerCase());
  if (idx < 0) return text.trim().slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + cue.length + 80);
  const slice = text.slice(start, end).trim();
  return (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '');
}

/** True when glossary or extended patterns detect romantic relationship language. */
export function hasRomanticSignals(text: string): boolean {
  const hints = discoverRelationshipHints(text);
  if (hints.some((h) => h.hint === 'ROMANTIC_RELATIONSHIP')) return true;
  return TYPE_RULES.some((r) => r.re.test(text)) || STATUS_RULES.some((r) => r.re.test(text));
}

/** Parse a single message/episode for romantic relationship lexical hits. */
export function parseRomanticEpisode(text: string): RomanticLexicalHit[] {
  if (!text?.trim() || !hasRomanticSignals(text)) return [];

  const hints = discoverRelationshipHints(text).filter((h) => h.hint === 'ROMANTIC_RELATIONSHIP');
  const cues = hints.map((h) => h.cue);
  const { type, confidence: typeConf } = inferType(text);
  const status = inferStatus(text, type);
  const names = extractPartnerNames(text);
  if (names.length === 0) return [];

  const hintBoost = hints.length > 0 ? Math.min(0.12, hints.length * 0.04) : 0;
  const baseConfidence = Math.min(0.95, typeConf + hintBoost);

  return names.map((partnerName) => {
    const enrichment = enrichEntity(partnerName, text);
    const evidenceCue = cues[0] ?? type;
    return {
      partnerName,
      relationshipType: type,
      status,
      confidence: baseConfidence,
      evidence: snippetAround(text, evidenceCue),
      cues,
      ontologyTags: enrichment.ontologyTags,
      isSituationship: type === 'situationship' || /\bsituationship\b/i.test(text),
    };
  });
}

export interface RomanticLexicalSummary {
  romanticEpisodes: number;
  hits: RomanticLexicalHit[];
  glossaryCues: RelationshipHintHit[];
}

/** Aggregate romantic parsing across many episodes (deduped by partner + type). */
export function summarizeRomanticCorpus(episodes: string[]): RomanticLexicalSummary {
  const allHits: RomanticLexicalHit[] = [];
  const cueSet = new Map<string, RelationshipHintHit>();
  let romanticEpisodes = 0;

  for (const text of episodes) {
    if (!hasRomanticSignals(text)) continue;
    romanticEpisodes += 1;
    for (const h of discoverRelationshipHints(text)) {
      if (h.hint === 'ROMANTIC_RELATIONSHIP' && !cueSet.has(h.cue)) cueSet.set(h.cue, h);
    }
    allHits.push(...parseRomanticEpisode(text));
  }

  const bestByPartner = new Map<string, RomanticLexicalHit>();
  for (const hit of allHits) {
    const key = normalizeNameKey(hit.partnerName);
    const prev = bestByPartner.get(key);
    if (!prev || hit.confidence > prev.confidence) bestByPartner.set(key, hit);
  }

  return {
    romanticEpisodes,
    hits: [...bestByPartner.values()].sort((a, b) => b.confidence - a.confidence),
    glossaryCues: [...cueSet.values()],
  };
}
