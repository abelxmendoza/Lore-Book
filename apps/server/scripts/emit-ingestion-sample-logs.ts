#!/usr/bin/env tsx
/**
 * Run 3 real ingestion pipeline passes and emit structured ingestion.cost logs.
 *
 * Usage (capture JSON logs):
 *   LOG_PRETTY=false npx tsx scripts/emit-ingestion-sample-logs.ts 2>&1 | tee logs/ingestion-sample.log
 *   npm run cost:ingestion -- logs/ingestion-sample.log
 *
 * Requires Supabase service role (from root .env). Uses LOREKEEPER_TEST_USER_ID when
 * set; otherwise the dev stub id after ensuring it exists in auth.users.
 */
import { randomUUID } from 'crypto';

import { supabaseAdmin } from '../src/services/supabaseClient';
import { conversationIngestionPipeline } from '../src/services/conversationCentered/ingestionPipeline';
import { logger } from '../src/logger';

const DEV_USER_ID = '00000000-0000-0000-0000-000000000000';

const MESSAGES = [
  'Had coffee with Riley Chen today. She is my college roommate and just started a marine biology job in San Diego.',
  'Riley called tonight — she is nervous about her first deep-sea research dive next month.',
  'Thinking about visiting Riley in San Diego this summer to see the lab where she works.',
];

async function ensureDevUser(): Promise<string> {
  const configured = process.env.LOREKEEPER_TEST_USER_ID?.trim();
  if (configured) return configured;

  const { data: existing, error: lookupErr } = await supabaseAdmin.auth.admin.getUserById(DEV_USER_ID);
  if (!lookupErr && existing?.user?.id) {
    return DEV_USER_ID;
  }

  logger.info({ userId: DEV_USER_ID }, 'Creating dev auth user for ingestion sample capture');
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    id: DEV_USER_ID,
    email: 'dev@example.com',
    email_confirm: true,
    user_metadata: { ingestion_sample: true },
  });

  if (createErr) {
    // Fall back to any existing project user.
    const { data: listed, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (listErr || !listed?.users?.length) {
      throw new Error(
        `Could not create dev user (${createErr.message}) and no auth users found. ` +
          'Set LOREKEEPER_TEST_USER_ID or run scripts/create-dev-user-simple.sql in Supabase.',
      );
    }
    const fallbackId = listed.users[0].id;
    logger.warn({ fallbackId }, 'Using first auth user for ingestion sample');
    return fallbackId;
  }

  return created.user?.id ?? DEV_USER_ID;
}

async function ingestOne(userId: string, content: string, index: number) {
  const threadId = randomUUID();
  const now = new Date().toISOString();

  const { error: threadErr } = await supabaseAdmin.from('conversation_sessions').insert({
    id: threadId,
    user_id: userId,
    title: `Ingestion sample ${index + 1}`,
    started_at: now,
    created_at: now,
    updated_at: now,
    metadata: { ingestion_sample: true },
  });
  if (threadErr) throw new Error(`conversation_sessions insert failed: ${threadErr.message}`);

  const { data: msg, error: msgErr } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      user_id: userId,
      session_id: threadId,
      role: 'user',
      content,
      metadata: { ingestion_sample: true },
    })
    .select('id')
    .single();

  if (msgErr || !msg?.id) {
    throw new Error(`chat_messages insert failed: ${msgErr?.message ?? 'no id'}`);
  }

  logger.info({ userId, threadId, messageId: msg.id, index }, 'ingestion.sample.start');
  await conversationIngestionPipeline.ingestFromChatMessage(userId, msg.id, threadId, []);
  logger.info({ userId, messageId: msg.id }, 'ingestion.sample.done');
}

async function main() {
  const userId = await ensureDevUser();
  logger.info({ userId, count: MESSAGES.length }, 'ingestion.sample.begin');

  for (let i = 0; i < MESSAGES.length; i += 1) {
    await ingestOne(userId, MESSAGES[i], i);
  }

  logger.info({ userId }, 'ingestion.sample.complete');
}

main().catch((err) => {
  logger.error({ err }, 'ingestion.sample.failed');
  process.exit(1);
});
