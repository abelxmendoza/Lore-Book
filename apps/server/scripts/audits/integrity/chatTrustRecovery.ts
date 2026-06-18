#!/usr/bin/env tsx
/**
 * Chat Trust Recovery Audit — orphan messages, missing assistants, entity analytics in prompt.
 *
 * Run:
 *   npx tsx apps/server/scripts/chatTrustRecoveryAudit.ts
 */
import { supabaseAdmin } from '../../../src/services/supabaseClient';
import { threadRecoveryService } from '../../../src/services/conversationCentered/threadRecoveryService';
import { countMissingAssistantTurns } from '../../../src/services/conversationCentered/threadDurabilityChecks';
import { loadEntityAnalyticsForContext } from '../../../src/services/chat/entityAnalyticsLoader';
import { pct, resolveFounderId } from '../../lib/auditCommon';

export async function runChatTrustRecoveryAudit(): Promise<void> {
  const userId = await resolveFounderId();
  console.log('\n=== Chat Trust Recovery Audit ===\n');
  console.log(`User: ${userId}\n`);

  const health = await threadRecoveryService.getThreadHealth(userId);

  const { data: messages } = await supabaseAdmin
    .from('chat_messages')
    .select('session_id, role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const rows = messages ?? [];
  const userCount = rows.filter((m) => m.role === 'user').length;
  const assistantCount = rows.filter((m) => m.role === 'assistant').length;
  const orphanUsers = countMissingAssistantTurns(rows);

  console.log('--- Phase 3: Orphan / durability metrics ---');
  console.log(`Threads:                    ${health.thread_count}`);
  console.log(`Threads with messages:      ${health.conversation_count}`);
  console.log(`Total user messages:        ${userCount}`);
  console.log(`Total assistant messages:   ${assistantCount}`);
  console.log(`Orphan user turns (no reply): ${orphanUsers}`);
  console.log(`Missing assistant ratio:    ${pct(orphanUsers, userCount)}`);
  console.log(`Orphaned messages (no session): ${health.orphaned_messages}`);
  console.log(`Empty threads:              ${health.empty_threads}`);
  console.log(`Ordering conflicts:         ${health.ordering_conflicts}`);

  console.log('\n--- Phase 1/5: Entity analytics in streaming prompt ---');
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (character) {
    const bundle = await loadEntityAnalyticsForContext(userId, {
      type: 'CHARACTER',
      id: character.id,
    });
    const hasAnalytics = bundle.entityAnalytics != null;
    const analyticsKeys = bundle.entityAnalytics ? Object.keys(bundle.entityAnalytics) : [];
    console.log(`Sample character:           ${character.name} (${character.id})`);
    console.log(`entityAnalytics loaded:     ${hasAnalytics}`);
    console.log(`analytics keys:             ${analyticsKeys.slice(0, 12).join(', ') || '(none)'}`);
    console.log(`analyticsGate.allowed:      ${bundle.analyticsGate?.allowed ?? 'n/a'}`);
    console.log(`entityConfidence:           ${bundle.entityConfidence ?? 'n/a'}`);

    const textureMarkers = ['closeness', 'trust', 'sentiment', 'relationship', 'importance'];
    const analyticsJson = JSON.stringify(bundle.entityAnalytics ?? {}).toLowerCase();
    const found = textureMarkers.filter((m) => analyticsJson.includes(m));
    console.log(`Relationship texture in analytics: ${found.join(', ') || '(none detected)'}`);
  } else {
    console.log('No characters found — skip entity analytics prompt check');
  }

  console.log('\n=== Audit complete ===\n');
}
