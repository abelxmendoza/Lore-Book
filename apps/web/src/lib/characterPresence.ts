import type { Character } from '../components/characters/CharacterProfileCard';

export type CharacterPresencePhase = 'core' | 'active' | 'fading' | 'dormant';

export type CharacterPresence = {
  closeness: number | null;
  recency: number | null;
  lastSeenAt: string | null;
  phase: CharacterPresencePhase | null;
};

const DEPTH_CLOSENESS: Record<string, number> = {
  close: 80,
  moderate: 55,
  casual: 35,
  acquaintance: 20,
  mentioned_only: 8,
};

const STANDING_CLOSENESS: Record<string, number> = {
  inner_circle: 90,
  close: 75,
  regular: 50,
  public_figure: 25,
  peripheral: 15,
};

const LEVEL_CLOSENESS: Record<string, number> = {
  protagonist: 95,
  major: 75,
  supporting: 55,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Demo analytics uses 0–1; the server analytics service uses 0–100. */
export function normalizeRecency01(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  if (raw <= 1) return raw;
  return clamp(raw / 100, 0, 1);
}

export function recencyFromTimestamp(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const days = Math.max(0, (now - time) / 86_400_000);
  if (days <= 7) return 1;
  if (days <= 30) return 0.7;
  if (days <= 90) return 0.4;
  if (days <= 180) return 0.2;
  return 0.05;
}

export function formatPresenceLastSeen(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const days = Math.max(0, Math.floor((now - time) / 86_400_000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return new Date(time).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function closenessBandLabel(closeness: number | null): string | null {
  if (closeness == null) return null;
  if (closeness >= 75) return 'Close';
  if (closeness >= 50) return 'Warm';
  if (closeness >= 25) return 'Familiar';
  return 'Distant';
}

function mentionVolume(char: Character): number {
  return (
    (asFiniteNumber(char.memory_count) ?? 0) +
    (asFiniteNumber(char.direct_memory_count) ?? 0) +
    (asFiniteNumber(char.perception_count) ?? 0) +
    (asFiniteNumber(char.knowledge_count) ?? 0)
  );
}

function closenessFromCharacter(char: Character): number | null {
  const analytic = asFiniteNumber(char.analytics?.closeness_score);
  if (analytic != null) return clamp(analytic, 0, 100);

  const scores: number[] = [];
  let explicitZero = false;
  const meta = char.metadata ?? {};

  const metaClose = asFiniteNumber(meta.closeness_score);
  if (metaClose != null) {
    if (metaClose <= 0) explicitZero = true;
    else scores.push(clamp(metaClose, 0, 100));
  }

  const standing = meta.social_standing as { tier?: string; score?: number } | undefined;
  if (typeof standing?.score === 'number' && Number.isFinite(standing.score) && standing.score > 0) {
    scores.push(clamp(standing.score, 0, 100));
  } else if (standing?.tier && STANDING_CLOSENESS[standing.tier] != null) {
    scores.push(STANDING_CLOSENESS[standing.tier]);
  }

  if (char.relationship_depth && DEPTH_CLOSENESS[char.relationship_depth] != null) {
    scores.push(DEPTH_CLOSENESS[char.relationship_depth]);
  }

  const importance = asFiniteNumber(char.importance_score);
  if (importance != null && importance > 0) scores.push(clamp(importance, 0, 100));

  // DB default is `minor` — that is not evidence of closeness on its own.
  if (char.importance_level && LEVEL_CLOSENESS[char.importance_level] != null) {
    scores.push(LEVEL_CLOSENESS[char.importance_level]);
  }

  const volume = mentionVolume(char);
  if (volume >= 3) scores.push(clamp(16 + volume * 2, 0, 50));

  if (scores.length === 0) return explicitZero ? 0 : null;
  return Math.round(Math.max(...scores));
}

function lastSeenFromCharacter(char: Character): string | null {
  const candidates = [
    char.last_perception_at,
    typeof char.metadata?.last_seen_at === 'string' ? char.metadata.last_seen_at : null,
    typeof char.metadata?.last_mentioned_at === 'string' ? char.metadata.last_mentioned_at : null,
  ];
  let best: string | null = null;
  let bestTime = 0;
  for (const value of candidates) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time) || time <= bestTime) continue;
    bestTime = time;
    best = value;
  }
  return best;
}

function recencyFromCharacter(char: Character, lastSeenAt: string | null): number | null {
  const analytic = normalizeRecency01(asFiniteNumber(char.analytics?.recency_score));
  if (analytic != null) return analytic;
  return recencyFromTimestamp(lastSeenAt);
}

function phaseFromScores(closeness: number | null, recency: number | null): CharacterPresencePhase | null {
  if (closeness == null && recency == null) return null;
  const c = closeness ?? 0;
  const r = recency ?? 0;
  if (closeness != null && recency != null && c >= 70 && r >= 0.6) return 'core';
  if (c >= 45 || r >= 0.4) return 'active';
  if (c >= 20 || r >= 0.2) return 'fading';
  return 'dormant';
}

export function resolveCharacterPresence(char: Character): CharacterPresence {
  const closeness = closenessFromCharacter(char);
  const lastSeenAt = lastSeenFromCharacter(char);
  const recency = recencyFromCharacter(char, lastSeenAt);
  return {
    closeness,
    recency,
    lastSeenAt,
    phase: phaseFromScores(closeness, recency),
  };
}

export function indexCharacterPresence(characters: Character[]): Map<string, CharacterPresence> {
  const byId = new Map<string, CharacterPresence>();
  for (const character of characters) {
    byId.set(character.id, resolveCharacterPresence(character));
  }
  return byId;
}
