import { createHash } from 'node:crypto';

/** Lore portrait may be regenerated at most once per rolling 30-day window per character. */
export const LORE_AVATAR_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export type LoreAvatarContextFingerprint = {
  name: string;
  alias?: string | null;
  role?: string | null;
  archetype?: string | null;
  summary?: string | null;
  facts: Array<{ category: string; fact: string; status?: string }>;
  loreSnippets: string[];
};

export type LoreAvatarCadenceDecision =
  | { action: 'generate' }
  | {
      action: 'skip';
      reason: 'same_context' | 'cooldown';
      avatarUrl: string;
      nextEligibleAt?: string;
    };

type AvatarMetadata = {
  avatar_source?: unknown;
  avatar_generated_at?: unknown;
  avatar_context_hash?: unknown;
};

function readAvatarMetadata(metadata: Record<string, unknown> | null | undefined): AvatarMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as AvatarMetadata;
}

/** Stable fingerprint of the lore used to build the portrait prompt. */
export function hashLoreAvatarContext(ctx: LoreAvatarContextFingerprint): string {
  const payload = {
    name: ctx.name.trim(),
    alias: ctx.alias?.trim() || null,
    role: ctx.role?.trim() || null,
    archetype: ctx.archetype?.trim() || null,
    summary: ctx.summary?.trim().slice(0, 400) || null,
    facts: ctx.facts
      .filter((f) => f.status !== 'contradicted')
      .map((f) => `${f.category}:${f.fact.trim()}`)
      .sort(),
    loreSnippets: [...ctx.loreSnippets].map((s) => s.trim()).filter(Boolean).sort(),
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 20);
}

export function parseAvatarGeneratedAt(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function evaluateLoreAvatarCadence(opts: {
  avatarUrl: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  contextHash: string;
  now?: Date;
  force?: boolean;
}): LoreAvatarCadenceDecision {
  const now = opts.now ?? new Date();
  const meta = readAvatarMetadata(opts.metadata);
  const storedHash = typeof meta.avatar_context_hash === 'string' ? meta.avatar_context_hash : null;
  const generatedAt = parseAvatarGeneratedAt(meta.avatar_generated_at);
  const isLoreGenerated = meta.avatar_source === 'lore_generated';
  const avatarUrl = opts.avatarUrl?.trim() || null;

  if (!isLoreGenerated || !generatedAt || !avatarUrl) {
    return { action: 'generate' };
  }

  if (opts.force) {
    const elapsed = now.getTime() - generatedAt.getTime();
    if (elapsed >= LORE_AVATAR_COOLDOWN_MS) {
      return { action: 'generate' };
    }
    return {
      action: 'skip',
      reason: 'cooldown',
      avatarUrl,
      nextEligibleAt: new Date(generatedAt.getTime() + LORE_AVATAR_COOLDOWN_MS).toISOString(),
    };
  }

  if (storedHash && storedHash === opts.contextHash) {
    return { action: 'skip', reason: 'same_context', avatarUrl };
  }

  const elapsed = now.getTime() - generatedAt.getTime();
  if (elapsed < LORE_AVATAR_COOLDOWN_MS) {
    return {
      action: 'skip',
      reason: 'cooldown',
      avatarUrl,
      nextEligibleAt: new Date(generatedAt.getTime() + LORE_AVATAR_COOLDOWN_MS).toISOString(),
    };
  }

  return { action: 'generate' };
}
