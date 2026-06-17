#!/usr/bin/env tsx
/**
 * Create detected groups from a LOCAL config file (never commit real personal lore).
 *
 * Usage:
 *   npx tsx scripts/create-detected-groups.ts \
 *     --user <email> \
 *     --groups-file .private/seeds/detected-groups.json \
 *     [--execute]
 *
 * Copy scripts/seeds/detected-groups.example.json to .private/seeds/ and customize locally.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'crypto';

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
import { organizationService } from '../apps/server/src/services/organizationService';
import { characterConnectionService } from '../apps/server/src/services/characterConnectionService';
import { normalizeNameKey } from '../apps/server/src/utils/nameNormalization';
import { assertSafeForSyntheticData } from '../apps/server/src/lib/founderGuard';

const EXECUTE = process.argv.includes('--execute');
const log = (...p: unknown[]) => console.log(EXECUTE ? '[EXECUTE]' : '[DRY-RUN]', ...p);

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type GroupMemberSpec = { wanted: string; role: string };
type EnsureCharacterSpec = { name: string; archetype: string; relType: string; role: string };
type GroupSpec = {
  name: string;
  group_type: string;
  membership_model: string;
  user_relationship: string;
  description: string;
  aliases?: string[];
  members?: GroupMemberSpec[];
  ensureCharacters?: EnsureCharacterSpec[];
};

type DetectedGroupsConfig = {
  groups: GroupSpec[];
};

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const u = data.users.find(c => c.email?.toLowerCase() === email.toLowerCase());
  if (!u) throw new Error(`No user for ${email}`);
  return u.id;
}

type CharRow = { id: string; name: string; alias: string[] | null };

function resolve(chars: CharRow[], wanted: string): CharRow | undefined {
  const key = normalizeNameKey(wanted);
  const exact = chars.find(c =>
    normalizeNameKey(c.name) === key || (c.alias ?? []).some(a => normalizeNameKey(a) === key)
  );
  if (exact) return exact;
  return chars.find(c =>
    normalizeNameKey(c.name).includes(key) || (c.alias ?? []).some(a => normalizeNameKey(a).includes(key))
  );
}

async function ensureCharacter(userId: string, spec: EnsureCharacterSpec): Promise<string | undefined> {
  const { data: existing } = await supabase
    .from('characters').select('id, name').eq('user_id', userId);
  const found = (existing ?? []).find((c: any) => normalizeNameKey(c.name) === normalizeNameKey(spec.name));
  if (found) { log(`  character exists: ${spec.name} (${found.id})`); return found.id; }

  log(`  will create character: ${spec.name} [${spec.archetype}]`);
  if (!EXECUTE) return undefined;

  const id = randomUUID();
  const [firstName, ...rest] = spec.name.replace(/^t[ií]a?\s+/i, '').split(' ');
  const { error } = await supabase.from('characters').insert({
    id,
    user_id: userId,
    name: spec.name,
    alias: [],
    status: 'active',
    tags: [],
    first_name: firstName || null,
    last_name: rest.join(' ') || null,
    archetype: spec.archetype,
    role: spec.role,
    importance_level: 'major',
    importance_score: 65,
    relationship_depth: 'close',
    proximity_level: 'direct',
    has_met: true,
    likelihood_to_meet: 'likely',
    metadata: {
      relationship_type: spec.relType,
      relationship_categories: [spec.relType],
      generated_by: 'manual_correction',
      generated_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) { console.error('  insert failed:', error.message); return undefined; }
  log(`  created character: ${spec.name} (${id})`);
  return id;
}

async function orgExists(userId: string, name: string): Promise<boolean> {
  const { data } = await supabase
    .from('organizations').select('id').eq('user_id', userId).ilike('name', name).limit(1);
  return Boolean((data ?? []).length);
}

async function createGroup(
  userId: string,
  chars: CharRow[],
  spec: GroupSpec,
  ensuredIds: Map<string, string>
) {
  if (await orgExists(userId, spec.name)) { log(`Group already exists: ${spec.name}`); return; }

  const members = (spec.members ?? [])
    .map(m => {
      const c = resolve(chars, m.wanted);
      if (!c) log(`  (!) not found: ${m.wanted}`);
      return c ? { character_id: c.id, character_name: c.name, role: m.role } : null;
    })
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  for (const ec of spec.ensureCharacters ?? []) {
    const id = ensuredIds.get(ec.name);
    if (id) {
      members.push({ character_id: id, character_name: ec.name, role: ec.role });
    }
  }

  log(`Will create group "${spec.name}" with: ${members.map(m => m.character_name).join(', ') || '(no members)'}`);
  if (!EXECUTE) return;

  const org = await organizationService.createOrganization(userId, {
    name: spec.name,
    aliases: spec.aliases ?? [],
    group_type: spec.group_type as any,
    type: 'other',
    membership_model: spec.membership_model as any,
    user_relationship: spec.user_relationship as any,
    is_public_entity: false,
    description: spec.description,
    status: 'active',
    metadata: { source: 'manual_correction', detected_from: 'groups_file' },
  });
  for (const m of members) {
    await organizationService.addMember(userId, org.id, {
      character_id: m.character_id,
      character_name: m.character_name,
      role: m.role,
      status: 'active',
    });
  }
  const ids = members.map(m => m.character_id).filter((x): x is string => Boolean(x));
  if (ids.length >= 2) await characterConnectionService.recordCoMention(userId, ids);
  log(`Created "${spec.name}" (${org.id}) with ${members.length} members`);
}

async function main() {
  const email = arg('--user') ?? process.env.TARGET_USER_EMAIL ?? '';
  const groupsFile = arg('--groups-file') ?? process.env.DETECTED_GROUPS_FILE ?? '';
  if (!email) { console.error('Required: --user <email> or TARGET_USER_EMAIL'); process.exit(1); }
  if (!groupsFile) {
    console.error('Required: --groups-file <path> or DETECTED_GROUPS_FILE');
    console.error('Example: --groups-file .private/seeds/detected-groups.json');
    process.exit(1);
  }

  const absPath = resolve(groupsFile);
  if (!existsSync(absPath)) {
    console.error(`Groups file not found: ${absPath}`);
    console.error('Copy scripts/seeds/detected-groups.example.json to .private/seeds/ and customize.');
    process.exit(1);
  }

  const config: DetectedGroupsConfig = JSON.parse(readFileSync(absPath, 'utf8'));
  const userId = await resolveUserId(email);
  assertSafeForSyntheticData(userId, email, 'detected groups creation');

  console.log(`\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} group creation for ${email} (${userId})\n`);

  const { data } = await supabase.from('characters').select('id, name, alias').eq('user_id', userId);
  const chars = (data ?? []) as CharRow[];
  const ensuredIds = new Map<string, string>();

  for (const group of config.groups) {
    console.log(`\n── ${group.name} ──`);
    for (const ec of group.ensureCharacters ?? []) {
      const id = await ensureCharacter(userId, ec);
      if (id) ensuredIds.set(ec.name, id);
    }
    await createGroup(userId, chars, group, ensuredIds);
  }

  console.log(`\nDone.${EXECUTE ? '' : ' (no writes — pass --execute to apply)'}`);
}

main().catch(e => { console.error('Failed:', e); process.exit(1); });
