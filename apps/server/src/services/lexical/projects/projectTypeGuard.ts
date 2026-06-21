/**
 * Reject project candidates that are stopwords, generic category words, or wrong entity types.
 */

import {
  GENERIC_PROJECT_WORDS,
  KNOWN_PROJECT_ALIASES,
  REFERENCE_PHRASES,
  STOPWORD_SPANS,
  type ProjectSuggestionOptions,
} from './projectSuggestionTypes';
import { guardCrossBookEntity } from './projectCrossBookGuard';
import { guardConsumerAppReference } from './projectConsumerAppGuard';
import { guardObjectReference } from './projectObjectGuard';

const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const PERSON_LIKE = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/;
const PLACE_LIKE = /\b(street|city|house|park|campus|university|office at)\b/i;
const TIME_LIKE = /^(?:today|yesterday|last week|this week|ago)$/i;
const EVENT_LIKE = /\b(party|prom|concert|festival|wedding|graduation)\b/i;
const SKILL_LIKE = /^(?:python|typescript|javascript|react|ros2?)$/i;

export type ProjectGuardResult = {
  allowed: boolean;
  status?: 'known' | 'new' | 'reference' | 'rejected' | 'needs_review';
  rejectedAs?: string;
  confidenceBoost: number;
  rulesFired: string[];
  matchedProjectId?: string;
  rejectionReason?: string;
};

function isKnownProject(span: string, options?: ProjectSuggestionOptions): { known: boolean; id?: string } {
  const key = norm(span);
  const alias = KNOWN_PROJECT_ALIASES.get(key);
  const compare = alias ? norm(alias) : key;
  if (options?.knownProjects) {
    for (const known of options.knownProjects) {
      if (norm(known) === compare) {
        return { known: true, id: options.knownProjectIds?.get(norm(known)) };
      }
    }
  }
  if (alias) return { known: false };
  return { known: false };
}

function hasMeaningfulAnchor(text: string, contextLine: string): boolean {
  const n = norm(text);
  if (KNOWN_PROJECT_ALIASES.has(n)) return true;
  if (/^[A-Z][\w'&.-]+-\d+$/.test(text.trim())) return true;
  if (/^[A-Z][\w'&.-]+$/.test(text.trim()) && text.trim().length >= 3) return true;
  if (/["']/.test(contextLine) && contextLine.includes(text)) return true;
  if (text.split(/\s+/).length >= 2 && !GENERIC_PROJECT_WORDS.has(n)) return true;
  if (/\b(app|website|portfolio|build|robot|series|archive|demo|feature|memory|navigation)\b/i.test(text)) {
    return true;
  }
  return false;
}

function resolveReferencePhrase(text: string, options?: ProjectSuggestionOptions): ProjectGuardResult | null {
  if (!REFERENCE_PHRASES.test(text.trim())) return null;
  const active = options?.activeThreadProject?.trim();
  if (active) {
    return {
      allowed: false,
      status: 'reference',
      confidenceBoost: 0,
      rulesFired: ['reference_to_active_thread_project'],
      matchedProjectId: options?.knownProjectIds?.get(norm(active)),
      rejectionReason: `reference_to:${active}`,
    };
  }
  return {
    allowed: false,
    status: 'rejected',
    rejectedAs: 'generic_category',
    confidenceBoost: 0,
    rulesFired: ['generic_project_reference'],
    rejectionReason: 'generic_project_reference',
  };
}

const VERB_PHRASE_SPAN = /^(?:working on|building|developing|creating|launching|shipping|designing|prototyping|writing|recording|producing|needs|better|tests)$/i;

export function guardProjectCandidate(
  span: string,
  contextLine: string,
  options?: ProjectSuggestionOptions,
  sourceConfidence = 0.7
): ProjectGuardResult {
  const text = span.trim();
  const n = norm(text);
  const rulesFired: string[] = [];

  if (!text || text.length < 2) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'stopword',
      confidenceBoost: 0,
      rulesFired: ['too_short'],
      rejectionReason: 'too_short',
    };
  }

  if (STOPWORD_SPANS.has(n)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'stopword_or_conjunction',
      confidenceBoost: 0,
      rulesFired: ['stopword_only'],
      rejectionReason: 'stopword_or_conjunction',
    };
  }

  if (VERB_PHRASE_SPAN.test(n)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'generic_category',
      confidenceBoost: 0,
      rulesFired: ['verb_phrase_not_project'],
      rejectionReason: 'verb_phrase_not_project',
    };
  }

  if (GENERIC_PROJECT_WORDS.has(n)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'generic_category_word',
      confidenceBoost: 0,
      rulesFired: ['generic_category_word'],
      rejectionReason: 'generic_category_word',
    };
  }

  const reference = resolveReferencePhrase(text, options);
  if (reference) return reference;

  if (TRAILING_ONLY_GENERIC(text)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'generic_category',
      confidenceBoost: 0,
      rulesFired: ['generic_project_reference_or_trailing_conjunction'],
      rejectionReason: 'generic_project_reference_or_trailing_conjunction',
    };
  }

  const knownHit = isKnownProject(text, options);
  if (knownHit.known) {
    rulesFired.push('history_rescue');
    return {
      allowed: true,
      status: 'known',
      confidenceBoost: 0.12,
      rulesFired,
      matchedProjectId: knownHit.id,
    };
  }

  if (TIME_LIKE.test(n)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'time',
      confidenceBoost: 0,
      rulesFired: ['time_like'],
      rejectionReason: 'time',
    };
  }

  if (EVENT_LIKE.test(n)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'event',
      confidenceBoost: 0,
      rulesFired: ['event_like'],
      rejectionReason: 'event',
    };
  }

  if (SKILL_LIKE.test(n)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'skill',
      confidenceBoost: 0,
      rulesFired: ['skill_like'],
      rejectionReason: 'skill',
    };
  }

  if (PERSON_LIKE.test(text) && !hasMeaningfulAnchor(text, contextLine)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'person',
      confidenceBoost: 0,
      rulesFired: ['person_like'],
      rejectionReason: 'person',
    };
  }

  if (PLACE_LIKE.test(text)) {
    return {
      allowed: false,
      status: 'rejected',
      rejectedAs: 'place',
      confidenceBoost: 0,
      rulesFired: ['place_like'],
      rejectionReason: 'place',
    };
  }

  if (!hasMeaningfulAnchor(text, contextLine)) {
    if (sourceConfidence < 0.75) {
      return {
        allowed: false,
        status: 'rejected',
        rejectedAs: 'weak_anchor',
        confidenceBoost: 0,
        rulesFired: ['missing_project_anchor'],
        rejectionReason: 'missing_project_anchor',
      };
    }
    return {
      allowed: true,
      status: 'needs_review',
      confidenceBoost: 0,
      rulesFired: ['weak_anchor_needs_review'],
    };
  }

  if (/^(?:my|our|the)\s+(?:app|robot|project|build|system|feature)$/i.test(text)) {
    return {
      allowed: true,
      status: 'needs_review',
      confidenceBoost: 0,
      rulesFired: ['generic_with_determiner_needs_review'],
    };
  }

  rulesFired.push('project_allowed');
  return {
    allowed: true,
    status: 'new',
    confidenceBoost: sourceConfidence >= 0.85 ? 0.08 : 0.04,
    rulesFired,
  };
}

function TRAILING_ONLY_GENERIC(text: string): boolean {
  const n = norm(text);
  if (/\s{1,40}(?:and|or|but)\s{0,40}$/i.test(text)) return true;
  if (/^(?:my|our|the)\s+(?:project|app|build|system|feature|idea|thing|stuff)(?:\s+(?:and|or|but))?$/i.test(text)) {
    return true;
  }
  if (n.endsWith(' project and') || n.endsWith(' app and')) return true;
  return false;
}

/** Public helper for filtering persisted suggestion rows. */
export function isRejectedProjectSuggestionName(
  name: string,
  options?: ProjectSuggestionOptions,
  contextLine?: string
): boolean {
  const line = contextLine ?? name;
  const guard = guardProjectCandidate(name, line, options, 0.5);
  if (!guard.allowed || guard.status === 'rejected' || guard.status === 'reference') return true;

  const crossBook = guardCrossBookEntity(name, line, options?.crossBook, options);
  if (!crossBook.allowed) return true;

  const consumer = guardConsumerAppReference(name, line);
  if (!consumer.allowed) return true;

  const object = guardObjectReference(name, line);
  if (!object.allowed) return true;

  return false;
}
