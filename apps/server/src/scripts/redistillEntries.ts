/**
 * MEMORY QUALITY BACKFILL — Re-distill low-quality journal entries
 *
 * Updates all journal entries created with the old rule_based pipeline
 * (raw transcript dumps) by running LLM distillation in-place.
 *
 * Safe: updates existing entries, does not delete or duplicate.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/redistillEntries.ts
 */

import crypto from 'crypto';
import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

const META_PATTERNS = [
  /\bdo you remember\b/i,
  /\bcan you remember\b/i,
  /\bwill you remember\b/i,
  /\bdid you save\b/i,
  /\bcan you recall\b/i,
  /\bwill this update\b/i,
  /\bremember this conversation\b/i,
  /\bcharacter card\b/i,
  /\blocation card\b/i,
  /\btesting (the |this |)app\b/i,
  /\btesting (for |)new changes\b/i,
  /\bwhat do you (know about me|remember about me)\b/i,
  /\bdo you know who i am\b/i,
  /\blore ?books? (not working|is broken)\b/i,
];

function isMetaMessage(content: string): boolean {
  return META_PATTERNS.some(p => p.test(content));
}

async function distill(userMessages: string[]): Promise<{
  distilled: string;
  title: string;
  tags: string[];
  mood: string | null;
  emotionalIntensity: number;
} | null> {
  const lifeMessages = userMessages.filter(m => !isMetaMessage(m));
  if (lifeMessages.length === 0) return null;

  const userText = lifeMessages.join('\n\n').slice(0, 6000);

  const completion = await openai.chat.completions.create({
    model: config.defaultModel,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a memory distillation engine for a personal memoir app.

Convert raw user messages into a clean, factual journal memory.

RULES:
- Write in third person ("User went...", "User mentioned...")
- Only record facts explicitly stated — never invent or embellish
- Be specific: keep real names, places, amounts, timeframes when stated
- 2–5 sentences. No more.
- If messages contain NO life events, return "distilled": "EMPTY"

Also return:
- title: 5–10 word headline
- tags: 3–7 lowercase semantic tags
- mood: one-word emotion or null
- emotionalIntensity: 0.0–1.0

Respond in JSON: {"distilled":"...","title":"...","tags":[...],"mood":"..."|null,"emotionalIntensity":0.0}`,
      },
      { role: 'user', content: userText },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as {
    distilled?: string;
    title?: string;
    tags?: string[];
    mood?: string | null;
    emotionalIntensity?: number;
  };

  if (!parsed.distilled || parsed.distilled.trim() === 'EMPTY') return null;

  return {
    distilled: parsed.distilled.trim(),
    title: (parsed.title ?? '').trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : ['memory'],
    mood: parsed.mood ?? null,
    emotionalIntensity: typeof parsed.emotionalIntensity === 'number' ? parsed.emotionalIntensity : 0,
  };
}

async function run() {
  logger.info('=== RE-DISTILLATION BACKFILL START ===');

  // Fetch all old rule_based entries
  const { data: oldEntries, error } = await supabaseAdmin
    .from('journal_entries')
    .select('id, content, metadata, user_id')
    .or("metadata->>'extractionMethod'.is.null,metadata->>'extractionMethod'.eq.rule_based");

  if (error) {
    logger.error({ error }, 'Failed to fetch old entries');
    process.exit(1);
  }

  logger.info({ count: oldEntries?.length ?? 0 }, 'Found old entries to re-distill');

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of oldEntries ?? []) {
    try {
      const sessionId = (entry.metadata as any)?.sessionId as string | undefined;

      // Get session messages
      let userMessages: string[] = [];
      if (sessionId) {
        const { data: session } = await supabaseAdmin
          .from('conversation_sessions')
          .select('metadata')
          .eq('id', sessionId)
          .single();

        const rawMsgs = (session?.metadata as any)?.messages as any[] | undefined;
        if (rawMsgs) {
          userMessages = rawMsgs
            .filter((m: any) => m.role === 'user' && !m.isSystemMessage && typeof m.content === 'string')
            .map((m: any) => m.content.trim())
            .filter((c: string) => c.length > 5);
        }
      }

      // Fall back to the raw content if no session found
      if (userMessages.length === 0 && entry.content) {
        userMessages = entry.content
          .split('\n\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 10);
      }

      if (userMessages.length === 0) {
        logger.info({ entryId: entry.id }, 'No messages — skipping');
        skipped++;
        continue;
      }

      const result = await distill(userMessages);
      if (!result) {
        logger.info({ entryId: entry.id }, 'All meta — skipping');
        skipped++;
        continue;
      }

      const contentHash = crypto
        .createHash('sha256')
        .update(userMessages.join('|'))
        .digest('hex')
        .slice(0, 16);

      const { error: updateError } = await supabaseAdmin
        .from('journal_entries')
        .update({
          content: result.distilled,
          summary: result.title || null,
          mood: result.mood,
          tags: result.tags,
          emotional_intensity: result.emotionalIntensity,
          metadata: {
            ...(entry.metadata as Record<string, unknown>),
            extractionMethod: 'llm_distillation',
            contentHash,
            redistilledAt: new Date().toISOString(),
          },
        })
        .eq('id', entry.id);

      if (updateError) {
        logger.error({ error: updateError, entryId: entry.id }, 'Failed to update entry');
        failed++;
      } else {
        logger.info(
          { entryId: entry.id, title: result.title, mood: result.mood, tags: result.tags },
          'Re-distilled entry'
        );
        updated++;
      }

      // Throttle — avoid hammering OpenAI
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      logger.error({ err, entryId: entry.id }, 'Error processing entry');
      failed++;
    }
  }

  logger.info({ updated, skipped, failed }, '=== RE-DISTILLATION BACKFILL COMPLETE ===');
}

run().catch(err => {
  logger.error({ err }, 'Backfill crashed');
  process.exit(1);
});
