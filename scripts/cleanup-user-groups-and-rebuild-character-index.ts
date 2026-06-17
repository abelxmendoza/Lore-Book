#!/usr/bin/env tsx
/**
 * Clean bad group/org detections for one account and rebuild the character
 * identity index from existing Character Book cards.
 *
 * Dry-run by default.
 *
 * Usage:
 *   npx tsx scripts/cleanup-user-groups-and-rebuild-character-index.ts --user <your-email>
 *   npx tsx scripts/cleanup-user-groups-and-rebuild-character-index.ts --user <your-email> --execute
 *   npx tsx scripts/cleanup-user-groups-and-rebuild-character-index.ts --user <your-email> --execute --delete-organizations
 */

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
import { normalizeNameKey } from '../apps/server/src/utils/nameNormalization';

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(candidate => candidate.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user found for ${email}`);
  return user.id;
}

async function safeSelect(table: string, userId: string, columns = '*') {
  const { data, error } = await supabase.from(table).select(columns).eq('user_id', userId);
  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) return [];
    throw error;
  }
  return data ?? [];
}

async function cleanupGroups(userId: string, execute: boolean, deleteOrganizations: boolean) {
  const [organizations, candidates] = await Promise.all([
    safeSelect(
      'organizations',
      userId,
      'id, name, type, group_type, member_count, usage_count, created_at, updated_at'
    ),
    safeSelect(
      'group_candidates',
      userId,
      'id, proposed_name, detected_members, status, confidence, occurrence_count, created_at, updated_at'
    ),
  ]);

  console.log(`\nGroups / organizations for user ${userId}`);
  console.log(`- organizations matched: ${organizations.length}`);
  for (const org of organizations as any[]) {
    console.log(`  • ${org.name} [${org.group_type ?? org.type ?? 'unknown'}] ${org.id}`);
  }
  console.log(`- group candidates matched: ${candidates.length}`);
  for (const candidate of candidates as any[]) {
    console.log(`  • ${candidate.proposed_name ?? '(unnamed)'} :: ${(candidate.detected_members ?? []).join(', ')} [${candidate.status}] ${candidate.id}`);
  }

  if (!execute) return { organizations: organizations.length, candidates: candidates.length };

  if (candidates.length > 0) {
    const ids = candidates.map((candidate: any) => candidate.id);
    const { error } = await supabase
      .from('group_candidates')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', ids);
    if (error) throw error;
  }

  if (deleteOrganizations && organizations.length > 0) {
    const ids = organizations.map((org: any) => org.id);
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('user_id', userId)
      .in('id', ids);
    if (error) throw error;
  }

  return { organizations: organizations.length, candidates: candidates.length };
}

async function rebuildCharacterIdentityIndex(userId: string, execute: boolean) {
  const characters = await safeSelect('characters', userId, 'id, name, alias, metadata, status, updated_at');
  const rows = (characters as any[]).flatMap(character => {
    const aliases = Array.isArray(character.alias) ? character.alias : [];
    const mentionCount = Number(character.metadata?.mention_count);
    const evidenceCount = Number.isFinite(mentionCount) && mentionCount > 0 ? Math.floor(mentionCount) : 1;
    const primaryKey = normalizeNameKey(character.name);
    const mentions = [
      {
        user_id: userId,
        character_id: character.id,
        mention: character.name,
        mention_key: primaryKey,
        source: 'primary_name',
        confidence: 1,
        evidence_count: evidenceCount,
        metadata: {},
      },
      ...aliases
        .map(alias => String(alias).trim())
        .filter(alias => alias.length > 0 && normalizeNameKey(alias) !== primaryKey)
        .map(alias => ({
          user_id: userId,
          character_id: character.id,
          mention: alias,
          mention_key: normalizeNameKey(alias),
          source: 'alias',
          confidence: 0.95,
          evidence_count: evidenceCount,
          metadata: {},
        })),
    ];

    const seen = new Set<string>();
    return mentions.filter(row => {
      const key = `${row.character_id}:${row.mention_key}`;
      if (!row.mention_key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  console.log(`\nCharacter cards matched: ${characters.length}`);
  for (const character of characters as any[]) {
    console.log(`  • ${character.name} (${character.id}) aliases=${(character.alias ?? []).join(', ') || 'none'}`);
  }
  console.log(`Character identity index rows to upsert: ${rows.length}`);

  if (!execute || rows.length === 0) return { characters: characters.length, indexRows: rows.length };

  const deleteResult = await supabase
    .from('character_identity_index')
    .delete()
    .eq('user_id', userId)
    .in('source', ['primary_name', 'alias']);
  if (deleteResult.error) {
    if (deleteResult.error.code === '42P01' || /does not exist/i.test(deleteResult.error.message)) {
      throw new Error('character_identity_index table does not exist. Apply migration 20260614024919_character_identity_registry_index.sql first.');
    }
    throw deleteResult.error;
  }

  const { error } = await supabase
    .from('character_identity_index')
    .upsert(rows, { onConflict: 'user_id,character_id,mention_key' });
  if (error) throw error;

  return { characters: characters.length, indexRows: rows.length };
}

async function main() {
  const email = arg('--user');
  const execute = process.argv.includes('--execute');
  const deleteOrganizations = process.argv.includes('--delete-organizations');

  if (!email) {
    console.error('Usage: cleanup-user-groups-and-rebuild-character-index.ts --user <email> [--execute] [--delete-organizations]');
    process.exit(1);
  }

  const userId = await resolveUserId(email);
  console.log(`${execute ? 'EXECUTING' : 'DRY RUN'} for ${email} (${userId})`);
  if (execute && !deleteOrganizations) {
    console.log('Note: candidates will be rejected; organizations will be listed but not deleted without --delete-organizations.');
  }

  const groupSummary = await cleanupGroups(userId, execute, deleteOrganizations);
  const indexSummary = await rebuildCharacterIdentityIndex(userId, execute);

  console.log('\nSummary');
  console.log(`- candidates ${execute ? 'rejected' : 'matched'}: ${groupSummary.candidates}`);
  console.log(`- organizations ${execute && deleteOrganizations ? 'deleted' : 'matched'}: ${groupSummary.organizations}`);
  console.log(`- characters indexed from cards: ${indexSummary.characters}`);
  console.log(`- identity index rows ${execute ? 'upserted' : 'planned'}: ${indexSummary.indexRows}`);
}

main().catch(error => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
