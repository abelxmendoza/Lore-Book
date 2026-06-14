#!/usr/bin/env tsx
/**
 * Create the groups detected by reading the user's full chat threads:
 *   1. Los Goths — the latino goth-club scene (existing character cards).
 *   2. Tía Grace's Household — cousins/aunt the user visits (creates the
 *      missing Tía Grace / Jerry / James character cards first).
 *   3. Clever Programmer Bootcamp — the coding bootcamp run by Rafeh Qazi.
 *
 * Also records co-mention connections so the people network is wired up.
 *
 * Dry-run by default; pass --execute to write.
 *   npx tsx scripts/create-detected-groups.ts --user abelxmendoza@gmail.com [--execute]
 */

import { randomUUID } from 'crypto';
import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
import { organizationService } from '../apps/server/src/services/organizationService';
import { characterConnectionService } from '../apps/server/src/services/characterConnectionService';
import { normalizeNameKey } from '../apps/server/src/utils/nameNormalization';

const EXECUTE = process.argv.includes('--execute');
const log = (...p: unknown[]) => console.log(EXECUTE ? '[EXECUTE]' : '[DRY-RUN]', ...p);

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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
  // 1. Exact match on name or alias (safest).
  const exact = chars.find(c =>
    normalizeNameKey(c.name) === key || (c.alias ?? []).some(a => normalizeNameKey(a) === key)
  );
  if (exact) return exact;
  // 2. The stored name/alias CONTAINS the full wanted phrase (e.g. "Hell Fairy"
  //    inside "Hell Fairy from the Underground Scene"). Never the reverse — a
  //    short stored name must not swallow a different wanted name.
  return chars.find(c =>
    normalizeNameKey(c.name).includes(key) || (c.alias ?? []).some(a => normalizeNameKey(a).includes(key))
  );
}

async function ensureCharacter(userId: string, name: string, opts: { archetype: string; relType: string; role: string }): Promise<string | undefined> {
  const { data: existing } = await supabase
    .from('characters').select('id, name').eq('user_id', userId);
  const found = (existing ?? []).find((c: any) => normalizeNameKey(c.name) === normalizeNameKey(name));
  if (found) { log(`  character exists: ${name} (${found.id})`); return found.id; }

  log(`  will create character: ${name} [${opts.archetype}]`);
  if (!EXECUTE) return undefined;

  const id = randomUUID();
  const [firstName, ...rest] = name.replace(/^t[ií]a?\s+/i, '').split(' ');
  const { error } = await supabase.from('characters').insert({
    id,
    user_id: userId,
    name,
    alias: [],
    status: 'active',
    tags: [],
    first_name: firstName || null,
    last_name: rest.join(' ') || null,
    archetype: opts.archetype,
    role: opts.role,
    importance_level: 'major',
    importance_score: 65,
    relationship_depth: 'close',
    proximity_level: 'direct',
    has_met: true,
    likelihood_to_meet: 'likely',
    metadata: {
      relationship_type: opts.relType,
      relationship_categories: [opts.relType],
      generated_by: 'manual_correction',
      generated_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) { console.error('  insert failed:', error.message); return undefined; }
  log(`  created character: ${name} (${id})`);
  return id;
}

async function orgExists(userId: string, name: string): Promise<boolean> {
  const { data } = await supabase
    .from('organizations').select('id').eq('user_id', userId).ilike('name', name).limit(1);
  return Boolean((data ?? []).length);
}

async function createGroup(
  userId: string,
  spec: {
    name: string;
    group_type: any;
    membership_model: any;
    user_relationship: any;
    description: string;
    members: Array<{ character_id?: string; character_name: string; role: string }>;
    aliases?: string[];
  }
) {
  if (await orgExists(userId, spec.name)) { log(`Group already exists: ${spec.name}`); return; }
  log(`Will create group "${spec.name}" [${spec.group_type}] with: ${spec.members.map(m => m.character_name).join(', ')}`);
  if (!EXECUTE) return;

  const org = await organizationService.createOrganization(userId, {
    name: spec.name,
    aliases: spec.aliases ?? [],
    group_type: spec.group_type,
    type: 'other',
    membership_model: spec.membership_model,
    user_relationship: spec.user_relationship,
    is_public_entity: false,
    description: spec.description,
    status: 'active',
    metadata: { source: 'manual_correction', detected_from: 'chat_threads' },
  });
  for (const m of spec.members) {
    await organizationService.addMember(userId, org.id, {
      character_id: m.character_id,
      character_name: m.character_name,
      role: m.role,
      status: 'active',
    });
  }
  const ids = spec.members.map(m => m.character_id).filter((x): x is string => Boolean(x));
  if (ids.length >= 2) await characterConnectionService.recordCoMention(userId, ids);
  log(`Created "${spec.name}" (${org.id}) with ${spec.members.length} members`);
}

async function main() {
  const email = arg('--user') ?? 'abelxmendoza@gmail.com';
  const userId = await resolveUserId(email);
  console.log(`\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} group creation for ${email} (${userId})\n`);

  const { data } = await supabase.from('characters').select('id, name, alias').eq('user_id', userId);
  const chars = (data ?? []) as CharRow[];

  // ── 1. Los Goths (goth scene) ────────────────────────────────────────────
  console.log('── Los Goths ────────────────────────────');
  const goth = [
    { wanted: 'Goth Tio', role: 'Scene organizer (puts on goth nights)' },
    { wanted: 'Oscuri.dad', role: 'Scene organizer / DJ' },
    { wanted: 'Hell Fairy', role: 'Performer' },
    { wanted: 'Mr. Chino', role: 'DJ' },
    { wanted: 'Baby Bats', role: 'Goth makeup artist' },
    { wanted: 'Andrew', role: 'Club connection' },
  ];
  const gothMembers = goth
    .map(g => { const c = resolve(chars, g.wanted); if (!c) log(`  (!) not found: ${g.wanted}`); return c ? { character_id: c.id, character_name: c.name, role: g.role } : null; })
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  await createGroup(userId, {
    name: 'Los Goths',
    group_type: 'scene',
    membership_model: 'fuzzy',
    user_relationship: 'member',
    description: 'The latino goth-club scene the user is part of — goth nights at Club Metro and First Street Pool & Billiards, putting on rising events in the LA latino goth community.',
    aliases: ['Latino Goth Scene'],
    members: gothMembers,
  });

  // ── 2. Tía Grace's Household (cousins) ─────────────────────────────────────
  console.log('\n── Tía Grace\'s Household ─────────────────');
  const grace = await ensureCharacter(userId, 'Tía Grace', { archetype: 'family', relType: 'family', role: 'Aunt' });
  const jerry = await ensureCharacter(userId, 'Jerry', { archetype: 'family', relType: 'family', role: 'Cousin' });
  const james = await ensureCharacter(userId, 'James', { archetype: 'family', relType: 'family', role: 'Cousin' });
  const household = [
    grace && { character_id: grace, character_name: 'Tía Grace', role: 'Aunt (head of household)' },
    jerry && { character_id: jerry, character_name: 'Jerry', role: 'Cousin' },
    james && { character_id: james, character_name: 'James', role: 'Cousin' },
  ].filter((m): m is NonNullable<typeof m> => Boolean(m));
  await createGroup(userId, {
    name: "Tía Grace's Household",
    group_type: 'family',
    membership_model: 'strict',
    user_relationship: 'member',
    description: "The user's extended family at Tía Grace's house — cousins Jerry and James. The user visits and stays over (e.g. Memorial Day weekend), codes, and hangs out there.",
    members: household,
  });

  // ── 3. Clever Programmer Bootcamp ──────────────────────────────────────────
  console.log('\n── Clever Programmer Bootcamp ────────────');
  const rafeh = resolve(chars, 'Rafeh Qazi');
  if (!rafeh) log('  (!) Rafeh Qazi not found');
  await createGroup(userId, {
    name: 'Clever Programmer Bootcamp',
    group_type: 'institution',
    membership_model: 'fuzzy',
    user_relationship: 'alumnus',
    description: 'The coding bootcamp (run by YouTuber Rafeh Qazi) that taught the user front-end development and marketing. ~$15k, helped them become a confident builder (and build Lorebook).',
    members: rafeh ? [{ character_id: rafeh.id, character_name: rafeh.name, role: 'Teacher / Founder (Rafeh Qazi)' }] : [],
  });

  console.log(`\nDone.${EXECUTE ? '' : ' (no writes — pass --execute to apply)'}`);
}

main().catch(e => { console.error('Failed:', e); process.exit(1); });
