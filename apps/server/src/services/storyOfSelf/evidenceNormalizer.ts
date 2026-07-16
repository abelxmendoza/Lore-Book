/**
 * Normalizes raw memory entries into typed EvidenceRecords and quarantines
 * the two classes of text that used to leak straight into the final answer:
 *
 *   conversational_fragment — short chat interjections ("over capacity???",
 *     "aww what happened?") that carry no autobiographical content.
 *   system_artifact — assistant failure/retry text, UI errors, raw JSON.
 *
 * Quarantined records stay available as provenance but can never reach the
 * event pipeline or the renderer.
 */
import type { MemoryEntry } from '../../types';

import {
  CURRENT_STATE_RE,
  ENTITY_FACT_PREDICATE_RE,
  EVENT_VERB_RE,
  IDENTITY_FACT_RE,
  RELATIONSHIP_FACT_RE,
  UNCERTAINTY_RE,
  detectDomains,
} from './lexicons';
import type { EvidenceKind, EvidenceRecord, NarrativeRecordType } from './narrativeRecords';

const SYSTEM_ARTIFACT_RE =
  /\b(over capacity|rate limit(ed)?|something went wrong|try again (later|in a moment)|i wasn'?t able to|failed to (generate|load|fetch)|internal (server )?error|request timed out|context (window|length) exceeded|as an ai\b)\b/i;

const INTERJECTION_RE =
  /^(aww+|oh+|ah+|lol|lmao|omg|wtf|huh|hmm+|ok(ay)?|yeah+|nah+|yes|no|what|why|really|wait|bruh|damn|nice|cool|same|fr|rip)\b/i;

const CONVERSATIONAL_OPENER_RE =
  /^(what happened|are you (ok|there|sure)|did (you|it)|can you|i was expecting|that'?s not what)/i;

const JSON_BLOB_RE = /^\s*[[{]["{[]?/;

function classifyKind(text: string): EvidenceKind {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'system_artifact';
  if (JSON_BLOB_RE.test(trimmed) && /[:,]/.test(trimmed)) return 'system_artifact';
  if (SYSTEM_ARTIFACT_RE.test(trimmed)) return 'system_artifact';

  const short = trimmed.length < 80;
  const isQuestionBurst = /[?!]{2,}\s*$/.test(trimmed);
  const isInterjection = INTERJECTION_RE.test(trimmed) || CONVERSATIONAL_OPENER_RE.test(trimmed);
  const hasEventContent = EVENT_VERB_RE.test(trimmed) || IDENTITY_FACT_RE.test(trimmed);

  if (short && (isQuestionBurst || isInterjection) && !hasEventContent) {
    return 'conversational_fragment';
  }
  return 'usable';
}

/**
 * Classify what role a piece of evidence can play in the narrative.
 * Order matters: durable self-attributes and third-party metadata are pulled
 * out before anything is allowed to look like an event.
 */
export function classifyRecordType(text: string): NarrativeRecordType {
  const firstPersonAction = /\b(i|we)\b/i.test(text) && EVENT_VERB_RE.test(text);

  if (IDENTITY_FACT_RE.test(text) && !readsAsDatedEpisode(text)) return 'identity_fact';
  if (RELATIONSHIP_FACT_RE.test(text)) return 'relationship_fact';
  if (isThirdPartyAttribute(text)) return 'entity_fact';
  if (CURRENT_STATE_RE.test(text)) return 'current_state';
  if (firstPersonAction || EVENT_VERB_RE.test(text)) return 'event';
  if (UNCERTAINTY_RE.test(text)) return 'uncertainty';
  return 'event';
}

/**
 * "I earned my degree" is a durable identity fact; "yesterday I earned my
 * degree" reads as a dated episode and belongs in the event stream too —
 * clustering and turning-point assessment will place it.
 */
function readsAsDatedEpisode(text: string): boolean {
  return /\b(yesterday|today|last (night|week|weekend)|this (week|morning|weekend))\b/i.test(text);
}

/**
 * A third-party attribute statement: the sentence's grammatical subject is a
 * capitalized name (not "I"/"We"), followed by a copula/role predicate, with
 * no first-person action. "Marcus leads the failure analysis department."
 */
function isThirdPartyAttribute(text: string): boolean {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let attributeSentences = 0;
  let otherContent = 0;
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    const subjectMatch = /^([A-Z][\w'.-]+(?: [A-Z][\w'.-]+)?)\s/.exec(trimmed);
    const firstPerson = /\b(i|we|my|our)\b/i.test(trimmed.slice(0, 40));
    if (
      subjectMatch &&
      !/^(I|We|My|Our|The|A|An|It|This|That|There|Today|Yesterday|Everyone|Everybody|Someone|Somebody|Nobody|Anyone|People)$/.test(
        subjectMatch[1]
      ) &&
      ENTITY_FACT_PREDICATE_RE.test(trimmed) &&
      !firstPerson &&
      !/\b(went|started|met us|took us)\b/i.test(trimmed)
    ) {
      attributeSentences++;
    } else if (trimmed.length > 20) {
      otherContent++;
    }
  }
  return attributeSentences > 0 && attributeSentences >= otherContent;
}

export function normalizeEvidence(entries: MemoryEntry[]): EvidenceRecord[] {
  return entries.map((entry) => {
    const raw = (entry.content || entry.summary || '').trim();
    const text = raw.replace(/\s+/g, ' ');
    const kind = classifyKind(text);
    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
    return {
      id: entry.id,
      text,
      date: entry.date || entry.created_at,
      source: entry.source,
      conversationId:
        typeof metadata.conversation_id === 'string' ? metadata.conversation_id : undefined,
      mood: entry.mood ?? undefined,
      emotionalIntensity: entry.emotional_intensity ?? undefined,
      tags: entry.tags ?? [],
      contentType: entry.content_type,
      kind,
      recordType: kind === 'usable' ? classifyRecordType(text) : 'uncertainty',
      domains: kind === 'usable' ? detectDomains(text) : [],
      mentions: [],
    };
  });
}
