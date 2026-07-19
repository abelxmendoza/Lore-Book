/**
 * Mention Resolver — classify noun phrases before they become Actors.
 *
 * A mention is evidence. An actor is an identity. Never confuse the two.
 *
 * Pipeline: Detection → Classification → Resolution → Actor decision
 */

import {
  classifyActorLabel,
  type ActorType,
} from './actorLabelPolicy';

export type MentionStatus =
  | 'RESOLVED'
  | 'UNRESOLVED'
  | 'GENERIC'
  | 'GROUP'
  | 'IGNORE';

export type ClassifiedMention = {
  text: string;
  status: MentionStatus;
  actorType?: ActorType;
  confidence: number;
  reason?: string;
};

export type ClassifyMentionInput = {
  text: string;
  entityId?: string | null;
  provenance?: string | null;
  /** Omega mention_status when known. */
  mentionStatus?: 'confirmed' | 'mentioned_only' | null;
  kind?: string | null;
};

const PROPER_NAME_RE = /^[A-ZÀ-Ý][a-zà-ÿ'’-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]+){0,2}$/;

function looksLikeProperName(text: string): boolean {
  return PROPER_NAME_RE.test(text.trim());
}

/**
 * Classify a detected mention into a lifecycle status.
 * Does not create entities — callers decide persistence from status.
 */
export function classifyMention(input: ClassifyMentionInput): ClassifiedMention {
  const text = (input.text ?? '').trim();
  if (!text) {
    return { text: '', status: 'IGNORE', confidence: 0, reason: 'empty' };
  }

  const actor = classifyActorLabel(text);

  if (actor.reason === 'self' || actor.reason === 'empty') {
    return { text, status: 'IGNORE', actorType: actor.actorType, confidence: 0, reason: actor.reason };
  }

  if (actor.action === 'reject') {
    const genericReasons = new Set([
      'indefinite_reference',
      'bare_generic',
      'bare_collective',
      'vague_collective',
      'vague_scene',
      'social_category',
      'anonymous_vague',
    ]);
    if (actor.reason && genericReasons.has(actor.reason)) {
      return {
        text,
        status: 'GENERIC',
        actorType: actor.actorType,
        confidence: 0.12,
        reason: actor.reason,
      };
    }
    return { text, status: 'IGNORE', actorType: actor.actorType, confidence: 0, reason: actor.reason };
  }

  if (actor.action === 'group') {
    return {
      text,
      status: 'GROUP',
      actorType: actor.actorType,
      confidence: 0.62,
      reason: actor.reason,
    };
  }

  if (actor.action === 'anonymous') {
    return {
      text,
      status: 'UNRESOLVED',
      actorType: 'ANONYMOUS_PERSON',
      confidence: 0.55,
      reason: actor.reason,
    };
  }

  // Named / identifiable person path
  const fromBook =
    input.provenance === 'character_book' ||
    input.provenance === 'organization_book' ||
    input.provenance === 'location_book';
  const confirmed = input.mentionStatus === 'confirmed' || fromBook;
  const proper = looksLikeProperName(text);
  const kind = String(input.kind ?? '').toLowerCase();
  const hasDurableId = Boolean(input.entityId);

  // Places/orgs with book linkage are resolved identities for those domains
  if ((kind === 'location' || kind === 'organization') && (fromBook || hasDurableId)) {
    return {
      text,
      status: 'RESOLVED',
      actorType: kind === 'organization' ? 'ORGANIZATION' : 'PERSON',
      confidence: 0.9,
      reason: 'resolved_non_person',
    };
  }

  // Durable character/person id → RESOLVED (nickname shapes like "Juan (work)" are OK).
  // Generic pollution never reaches here — classifyActorLabel already rejected it.
  if ((fromBook || hasDurableId) && actor.action === 'person') {
    return {
      text,
      status: 'RESOLVED',
      actorType: 'PERSON',
      confidence: confirmed || fromBook ? 0.95 : 0.88,
      reason: 'resolved_identity',
    };
  }

  if (proper) {
    return {
      text,
      status: 'RESOLVED',
      actorType: 'PERSON',
      confidence: 0.85,
      reason: 'proper_name',
    };
  }

  return {
    text,
    status: 'UNRESOLVED',
    actorType: 'PERSON',
    confidence: 0.4,
    reason: 'unresolved_person',
  };
}

/** Stable Cast/Actors bar — resolved identities only. */
export function mayAppearOnCast(mention: ClassifiedMention): boolean {
  return mention.status === 'RESOLVED';
}

/** Transcript / Detected chips — evidence, not necessarily actors. */
export function mayAppearAsTranscriptMention(mention: ClassifiedMention): boolean {
  return (
    mention.status === 'RESOLVED' ||
    mention.status === 'UNRESOLVED' ||
    mention.status === 'GROUP'
  );
}

/** Composer "building on" — only stable resolved identities. */
export function mayAppearAsBuildingOn(mention: ClassifiedMention): boolean {
  return mention.status === 'RESOLVED';
}

/** Character Book promotion — resolved PERSON only. */
export function mayPromoteMentionToCharacter(mention: ClassifiedMention): boolean {
  return mention.status === 'RESOLVED' && mention.actorType === 'PERSON';
}
