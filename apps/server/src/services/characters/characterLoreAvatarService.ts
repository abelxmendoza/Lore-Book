/**
 * Generate character portrait avatars from accumulated lore (facts, summary, attributes).
 *
 * DEFERRED PRODUCT FEATURE — not enabled in production yet.
 * Default avatars use DiceBear via assignCharacterAvatar() (free, deterministic).
 * When ENABLE_LORE_AVATARS=true, this module generates unique lore-context portraits
 * via OpenAI Images. Monthly cadence in loreAvatarCadence.ts applies when enabled.
 */

import { config } from '../../config';
import { logger } from '../../logger';
import { openai } from '../../lib/openai';
import { assignCharacterAvatar } from '../characterAvatarService';
import { compileCharacterLoreProfile } from './characterLoreProfileService';
import { entityFactsService, type EntityFact } from '../entityFactsService';
import { supabaseAdmin } from '../supabaseClient';
import {
  evaluateLoreAvatarCadence,
  hashLoreAvatarContext,
  LORE_AVATAR_COOLDOWN_MS,
} from './loreAvatarCadence';

export type LoreAvatarContext = {
  name: string;
  alias?: string | null;
  role?: string | null;
  archetype?: string | null;
  summary?: string | null;
  facts: EntityFact[];
  loreSnippets: string[];
};

const MIN_LORE_SIGNALS = 1;

/** Build an image prompt from character lore. Returns null when there is not enough context. */
export function buildLoreAvatarPrompt(ctx: LoreAvatarContext): string | null {
  const appearance = ctx.facts
    .filter((f) => f.category === 'appearance' && f.status !== 'contradicted')
    .map((f) => f.fact);
  const personality = ctx.facts
    .filter((f) => f.category === 'personality' && f.status !== 'contradicted')
    .slice(0, 4)
    .map((f) => f.fact);
  const career = ctx.facts
    .filter((f) => f.category === 'career' && f.status !== 'contradicted')
    .slice(0, 2)
    .map((f) => f.fact);

  const signalCount =
    (ctx.summary?.trim() ? 1 : 0) +
    appearance.length +
    personality.length +
    career.length +
    ctx.loreSnippets.length;

  if (signalCount < MIN_LORE_SIGNALS) return null;

  const lines = [
    'Portrait avatar for a character in a personal memory journal app.',
    'Head-and-shoulders, centered, soft neutral background, warm illustrative style.',
    'Not photorealistic. No text, logos, watermarks, or UI elements.',
    '',
    `Character name: ${ctx.name}`,
  ];

  if (ctx.alias?.trim()) lines.push(`Also known as: ${ctx.alias.trim()}`);
  if (ctx.role?.trim()) lines.push(`Role in the story: ${ctx.role.trim()}`);
  if (ctx.archetype?.trim()) lines.push(`Archetype: ${ctx.archetype.trim()}`);
  if (ctx.summary?.trim()) lines.push(`About them: ${ctx.summary.trim().slice(0, 400)}`);
  if (appearance.length) lines.push(`Appearance from lore: ${appearance.join('; ')}`);
  if (personality.length) lines.push(`Personality vibe: ${personality.join('; ')}`);
  if (career.length) lines.push(`Life context: ${career.join('; ')}`);
  if (ctx.loreSnippets.length) {
    lines.push(`Story details: ${ctx.loreSnippets.slice(0, 4).join('; ')}`);
  }

  return lines.join('\n');
}

async function uploadLoreAvatarPng(characterId: string, pngBytes: Buffer): Promise<string> {
  const path = `characters/${characterId}.png`;
  const { error } = await supabaseAdmin.storage.from('avatars').upload(path, pngBytes, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) throw error;
  return `${config.supabaseUrl}/storage/v1/object/public/avatars/${path}`;
}

export async function gatherLoreAvatarContext(
  userId: string,
  characterId: string
): Promise<LoreAvatarContext | null> {
  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, role, archetype, summary')
    .eq('user_id', userId)
    .eq('id', characterId)
    .maybeSingle();

  if (error || !character) return null;

  const [facts, profile] = await Promise.all([
    entityFactsService.getEntityFacts(userId, characterId, 'character'),
    compileCharacterLoreProfile(userId, characterId).catch(() => null),
  ]);

  const loreSnippets: string[] = [];
  if (profile) {
    for (const item of [...profile.skills, ...profile.hobbies, ...profile.interests].slice(0, 6)) {
      if (item.label?.trim()) loreSnippets.push(item.label.trim());
    }
    for (const snippet of profile.loreSnippets.slice(0, 4)) {
      if (snippet.label?.trim()) loreSnippets.push(snippet.label.trim());
    }
  }

  return {
    name: String(character.name ?? 'Unknown'),
    alias: character.alias as string | null,
    role: character.role as string | null,
    archetype: character.archetype as string | null,
    summary: character.summary as string | null,
    facts,
    loreSnippets,
  };
}

export type GenerateLoreAvatarResult =
  | { ok: true; avatarUrl: string; prompt: string; source: 'lore_generated'; cached?: boolean }
  | {
      ok: false;
      reason: 'disabled' | 'insufficient_lore' | 'generation_failed' | 'rate_limited';
      message: string;
      avatarUrl?: string;
      nextEligibleAt?: string;
    };

/**
 * Generate a lore-based portrait and persist to characters.avatar_url.
 * When disabled or lore is thin, returns a structured failure (caller may fall back to DiceBear).
 */
export async function generateLoreAvatar(
  userId: string,
  characterId: string,
  opts: { force?: boolean } = {}
): Promise<GenerateLoreAvatarResult> {
  if (!config.enableLoreAvatars) {
    return { ok: false, reason: 'disabled', message: 'Lore avatars are not enabled on this server.' };
  }
  if (!config.openAiKey) {
    return { ok: false, reason: 'generation_failed', message: 'OpenAI API key is not configured.' };
  }

  const ctx = await gatherLoreAvatarContext(userId, characterId);
  if (!ctx) {
    return { ok: false, reason: 'generation_failed', message: 'Character not found.' };
  }

  const { data: characterRow } = await supabaseAdmin
    .from('characters')
    .select('avatar_url, metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .maybeSingle();

  const metadata = (characterRow?.metadata as Record<string, unknown> | null) ?? {};
  const contextHash = hashLoreAvatarContext(ctx);
  const cadence = evaluateLoreAvatarCadence({
    avatarUrl: characterRow?.avatar_url as string | null,
    metadata,
    contextHash,
    force: opts.force,
  });

  if (cadence.action === 'skip') {
    const days = Math.ceil(LORE_AVATAR_COOLDOWN_MS / (24 * 60 * 60 * 1000));
    const message =
      cadence.reason === 'same_context'
        ? 'Portrait already matches this character’s current lore.'
        : `Lore portraits refresh at most once every ${days} days when their story context changes.${
            cadence.nextEligibleAt
              ? ` Next refresh after ${new Date(cadence.nextEligibleAt).toLocaleDateString()}.`
              : ''
          }`;

    logger.debug(
      { userId, characterId, reason: cadence.reason, contextHash },
      'Lore avatar generation skipped by cadence',
    );

    return {
      ok: false,
      reason: 'rate_limited',
      message,
      avatarUrl: cadence.avatarUrl,
      nextEligibleAt: cadence.nextEligibleAt,
    };
  }

  const prompt = buildLoreAvatarPrompt(ctx);
  if (!prompt && !opts.force) {
    return {
      ok: false,
      reason: 'insufficient_lore',
      message:
        'Not enough lore yet — mention how they look, their personality, or what they do in chat, then try again.',
    };
  }

  const finalPrompt =
    prompt ??
    `Portrait avatar for ${ctx.name}. Head-and-shoulders, warm illustrative style, neutral background. No text.`;

  try {
    const response = await openai.images.generate({
      model: config.avatarImageModel,
      prompt: finalPrompt,
      size: '1024x1024',
      response_format: 'b64_json',
      n: 1,
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      return { ok: false, reason: 'generation_failed', message: 'Image API returned no data.' };
    }

    const pngBytes = Buffer.from(b64, 'base64');
    const avatarUrl = await uploadLoreAvatarPng(characterId, pngBytes);

    const { data: existing } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();

    const nextMetadata = {
      ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
      avatar_source: 'lore_generated',
      avatar_prompt_preview: finalPrompt.slice(0, 280),
      avatar_generated_at: new Date().toISOString(),
      avatar_context_hash: contextHash,
    };

    const { error: updateError } = await supabaseAdmin
      .from('characters')
      .update({
        avatar_url: avatarUrl,
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', characterId)
      .eq('user_id', userId);

    if (updateError) {
      logger.warn({ updateError, characterId }, 'Lore avatar generated but DB update failed');
    }

    logger.info({ userId, characterId }, 'Lore avatar generated');
    return { ok: true, avatarUrl, prompt: finalPrompt, source: 'lore_generated' };
  } catch (err) {
    logger.warn({ err, userId, characterId }, 'Lore avatar generation failed');
    return {
      ok: false,
      reason: 'generation_failed',
      message: err instanceof Error ? err.message : 'Image generation failed.',
    };
  }
}

/** Assign DiceBear when lore portrait is unavailable or deferred. */
export async function ensureCharacterAvatarWithLoreFallback(
  userId: string,
  characterId: string,
  opts: { archetype?: string | null; role?: string | null } = {}
): Promise<string> {
  // Lore AI portraits intentionally off until ENABLE_LORE_AVATARS=true (cost control).
  if (config.enableLoreAvatars) {
    const result = await generateLoreAvatar(userId, characterId);
    if (result.ok) return result.avatarUrl;
  }
  return assignCharacterAvatar(characterId, opts);
}
