/**
 * Lightweight attribution ledger for interest ↔ character links.
 * Stored on interests.metadata so profile compile stays a single-row read.
 */
import type {
  InterestAttributionReason,
  InterestSubjectLink,
  InterestSubjectStance,
} from './interestSubjectResolver';

export type CharacterInterestAttribution = {
  reason: InterestAttributionReason | string;
  stance: InterestSubjectStance | 'dismissed';
  evidence?: string;
  attachedAt?: string;
  detachedAt?: string;
  sourceMessageId?: string | null;
};

export type InterestAttributionEvent = {
  at: string;
  action: 'attach' | 'detach' | 'repair' | 'restore';
  characterId: string;
  reason: string;
  stance?: string;
  evidence?: string;
  sourceMessageId?: string | null;
};

const MAX_EVENTS = 40;

export function readCharacterAttributions(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, CharacterInterestAttribution> {
  const raw = metadata?.character_attributions;
  if (!raw || typeof raw !== 'object') return {};
  return { ...(raw as Record<string, CharacterInterestAttribution>) };
}

export function readDismissedCharacterIds(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const raw = metadata?.dismissed_character_ids;
  return Array.isArray(raw) ? (raw as string[]).filter((id) => typeof id === 'string') : [];
}

export function mergeAttributionLinksIntoMetadata(
  metadata: Record<string, unknown> | null | undefined,
  links: InterestSubjectLink[],
  opts?: { sourceMessageId?: string | null; now?: string },
): Record<string, unknown> {
  const now = opts?.now ?? new Date().toISOString();
  const meta = { ...(metadata ?? {}) };
  const attributions = readCharacterAttributions(meta);
  const dismissed = new Set(readDismissedCharacterIds(meta));
  const events = Array.isArray(meta.attribution_events)
    ? ([...(meta.attribution_events as InterestAttributionEvent[])] as InterestAttributionEvent[])
    : [];

  for (const link of links) {
    if (dismissed.has(link.characterId)) continue;
    const prev = attributions[link.characterId];
    attributions[link.characterId] = {
      reason: link.reason,
      stance: link.stance,
      evidence: link.evidence || prev?.evidence,
      attachedAt: prev?.attachedAt ?? now,
      sourceMessageId: opts?.sourceMessageId ?? prev?.sourceMessageId ?? null,
    };
    events.push({
      at: now,
      action: 'attach',
      characterId: link.characterId,
      reason: link.reason,
      stance: link.stance,
      evidence: link.evidence,
      sourceMessageId: opts?.sourceMessageId ?? null,
    });
  }

  meta.character_attributions = attributions;
  meta.attribution_events = events.slice(-MAX_EVENTS);
  return meta;
}

export function markCharacterDismissedInMetadata(
  metadata: Record<string, unknown> | null | undefined,
  characterId: string,
  reason: string,
  opts?: { evidence?: string; now?: string },
): Record<string, unknown> {
  const now = opts?.now ?? new Date().toISOString();
  const meta = { ...(metadata ?? {}) };
  const attributions = readCharacterAttributions(meta);
  const dismissed = readDismissedCharacterIds(meta);
  if (!dismissed.includes(characterId)) dismissed.push(characterId);

  if (attributions[characterId]) {
    attributions[characterId] = {
      ...attributions[characterId],
      stance: 'dismissed',
      reason,
      detachedAt: now,
      evidence: opts?.evidence ?? attributions[characterId].evidence,
    };
  } else {
    attributions[characterId] = {
      reason,
      stance: 'dismissed',
      detachedAt: now,
      evidence: opts?.evidence,
    };
  }

  const events = Array.isArray(meta.attribution_events)
    ? ([...(meta.attribution_events as InterestAttributionEvent[])] as InterestAttributionEvent[])
    : [];
  events.push({
    at: now,
    action: reason.includes('repair') ? 'repair' : 'detach',
    characterId,
    reason,
    stance: 'dismissed',
    evidence: opts?.evidence,
  });

  meta.dismissed_character_ids = dismissed;
  meta.character_attributions = attributions;
  meta.attribution_events = events.slice(-MAX_EVENTS);
  return meta;
}

/** Undo a dismiss — clears the learn-not-to-reattach block and restores attribution. */
export function restoreCharacterInMetadata(
  metadata: Record<string, unknown> | null | undefined,
  characterId: string,
  opts?: {
    evidence?: string;
    stance?: InterestSubjectStance;
    reason?: string;
    now?: string;
  },
): Record<string, unknown> {
  const now = opts?.now ?? new Date().toISOString();
  const meta = { ...(metadata ?? {}) };
  const attributions = readCharacterAttributions(meta);
  const dismissed = readDismissedCharacterIds(meta).filter((id) => id !== characterId);
  const prev = attributions[characterId];
  const stance = opts?.stance ?? (prev?.stance === 'dismissed' ? 'other_person' : prev?.stance) ?? 'other_person';
  const reason = opts?.reason ?? 'user_restored';

  attributions[characterId] = {
    reason,
    stance: stance === 'dismissed' ? 'other_person' : stance,
    evidence: opts?.evidence ?? prev?.evidence,
    attachedAt: now,
    sourceMessageId: prev?.sourceMessageId ?? null,
  };

  const events = Array.isArray(meta.attribution_events)
    ? ([...(meta.attribution_events as InterestAttributionEvent[])] as InterestAttributionEvent[])
    : [];
  events.push({
    at: now,
    action: 'restore',
    characterId,
    reason,
    stance: attributions[characterId].stance,
    evidence: attributions[characterId].evidence,
  });

  meta.dismissed_character_ids = dismissed;
  meta.character_attributions = attributions;
  meta.attribution_events = events.slice(-MAX_EVENTS);
  return meta;
}
