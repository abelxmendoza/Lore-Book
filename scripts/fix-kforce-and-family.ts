#!/usr/bin/env tsx
/**
 * One-time data correction for an account:
 *
 *  1. Create the "Kforce" staffing agency as a company organization and place
 *     Sam (recruiter) and Kelly (onboarding contact) inside it — instead of the
 *     mislabeled "Sam & Kelly" friend group.
 *  2. Link Kforce → Amazon (the agency placed/hired the user for the Amazon job).
 *  3. Reject the wrong Sam/Kelly + cross-domain group candidates.
 *  4. Build/ensure the user's family group and lift family members out of
 *     minor/background importance into the core circle.
 *
 * Dry-run by default. Pass --execute to write.
 *
 * Usage:
 *   npx tsx scripts/fix-kforce-and-family.ts --user <your-email>
 *   npx tsx scripts/fix-kforce-and-family.ts --user <your-email> --execute
 */

import { supabaseAdmin as supabase } from '../apps/server/src/services/supabaseClient';
import { organizationService } from '../apps/server/src/services/organizationService';
import { normalizeNameKey } from '../apps/server/src/utils/nameNormalization';

const EXECUTE = process.argv.includes('--execute');

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function log(...parts: unknown[]) {
  console.log(`${EXECUTE ? '[EXECUTE]' : '[DRY-RUN]'}`, ...parts);
}

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(candidate => candidate.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No auth user found for ${email}`);
  return user.id;
}

type CharRow = { id: string; name: string; alias: string[] | null; archetype: string | null; relationship_depth: string | null; importance_level: string | null };

async function loadCharacters(userId: string): Promise<CharRow[]> {
  const { data } = await supabase
    .from('characters')
    .select('id, name, alias, archetype, relationship_depth, importance_level')
    .eq('user_id', userId);
  return (data ?? []) as CharRow[];
}

function findChar(chars: CharRow[], wanted: string): CharRow | undefined {
  const key = normalizeNameKey(wanted);
  return chars.find(c =>
    normalizeNameKey(c.name) === key ||
    normalizeNameKey(c.name).split(' ').includes(key) ||
    (c.alias ?? []).some(a => normalizeNameKey(a) === key)
  );
}

async function ensureKforce(userId: string, chars: CharRow[]) {
  const sam = findChar(chars, 'Sam');
  const kelly = findChar(chars, 'Kelly');
  log('Kforce members →', `Sam=${sam?.id ?? 'MISSING'}`, `Kelly=${kelly?.id ?? 'MISSING'}`);

  // Existing Kforce?
  const { data: existing } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('user_id', userId)
    .or('name.ilike.%kforce%,name.ilike.%k-force%');
  let kforceId = (existing ?? [])[0]?.id as string | undefined;

  if (kforceId) {
    log('Kforce org already exists:', kforceId);
  } else {
    log('Will create Kforce organization (company, staffing agency).');
    if (EXECUTE) {
      const org = await organizationService.createOrganization(userId, {
        name: 'Kforce',
        aliases: ['K-force', 'KForce'],
        group_type: 'company',
        type: 'company',
        membership_model: 'strict',
        user_relationship: 'member',
        is_public_entity: false,
        description:
          'Staffing/recruiting agency that hired the user and is placing them in an Amazon job (expected start late June). Sam is the recruiter; Kelly handles onboarding/identity verification and paperwork.',
        status: 'active',
        metadata: {
          source: 'manual_correction',
          employer: true,
          placement: 'Amazon',
          notes: ['Background check + I-9 in progress', 'Identity verification call done with Kelly'],
        },
      });
      kforceId = org.id;
      log('Created Kforce:', kforceId);
    }
  }

  if (EXECUTE && kforceId) {
    const members = await organizationService.getMembers(kforceId);
    const have = new Set(members.map(m => normalizeNameKey(m.character_name)));
    const toAdd: Array<{ c?: CharRow; name: string; role: string }> = [
      { c: sam, name: sam?.name ?? 'Sam', role: 'Recruiter' },
      { c: kelly, name: kelly?.name ?? 'Kelly', role: 'Onboarding contact' },
    ];
    for (const m of toAdd) {
      if (have.has(normalizeNameKey(m.name))) { log('  member already present:', m.name); continue; }
      await organizationService.addMember(userId, kforceId, {
        character_id: m.c?.id,
        character_name: m.name,
        role: m.role,
        status: 'active',
        notes: 'Works for Kforce; user is being hired through them for the Amazon job.',
      });
      log('  added member:', m.name, `(${m.role})`);
    }
  } else {
    log('Would add members Sam (Recruiter) and Kelly (Onboarding contact).');
  }

  return kforceId;
}

async function ensureAmazonEmployer(userId: string): Promise<string | undefined> {
  const { data: amazonRows } = await supabase
    .from('organizations')
    .select('id, name, group_type, is_public_entity, user_relationship')
    .eq('user_id', userId)
    .ilike('name', '%amazon%');
  const amazon = (amazonRows ?? [])[0] as any;
  if (!amazon) { log('No Amazon org present yet.'); return undefined; }

  log(`Amazon org: "${amazon.name}" [${amazon.group_type}] public=${amazon.is_public_entity} rel=${amazon.user_relationship}`);
  const patch = {
    name: 'Amazon',
    group_type: 'company',
    type: 'company',
    is_public_entity: false,
    user_relationship: 'member',
    membership_model: 'strict',
    description: 'The company where the user is starting a job (placed/hired through the Kforce agency, expected start late June).',
    updated_at: new Date().toISOString(),
  };
  log(`  → rename to "Amazon", company/employer, user is a member (employee).`);
  if (EXECUTE) {
    await supabase.from('organizations').update(patch).eq('id', amazon.id).eq('user_id', userId);
  }
  return amazon.id;
}

async function linkKforceToAmazon(userId: string, kforceId: string | undefined, amazonId: string | undefined) {
  if (!kforceId) { log('Skip Kforce→Amazon link (no Kforce id in dry-run).'); return; }
  let resolvedAmazonId = amazonId;

  if (!resolvedAmazonId) {
    log('No Amazon org found; will create "Amazon" (company, employer).');
    if (EXECUTE) {
      const org = await organizationService.createOrganization(userId, {
        name: 'Amazon',
        group_type: 'company',
        type: 'company',
        membership_model: 'strict',
        user_relationship: 'member',
        is_public_entity: false,
        description: 'Company where the user is starting a job, placed through the Kforce agency.',
        status: 'active',
        metadata: { source: 'manual_correction', employer: true },
      });
      resolvedAmazonId = org.id;
    }
  }

  if (EXECUTE && resolvedAmazonId) {
    const existing = await organizationService.getRelationships(userId, kforceId);
    const already = existing.some(r =>
      (r.from_org_id === kforceId && r.to_org_id === resolvedAmazonId) ||
      (r.from_org_id === resolvedAmazonId && r.to_org_id === kforceId)
    );
    if (already) {
      log('Kforce↔Amazon relationship already exists.');
    } else {
      await organizationService.addRelationship(
        userId, kforceId, resolvedAmazonId, 'affiliated_with',
        'Kforce placed/hired the user for the Amazon job (expected start late June).'
      );
      log('Linked Kforce --affiliated_with--> Amazon.');
    }
  } else {
    log('Would link Kforce --affiliated_with--> Amazon.');
  }
}

async function rejectBadCandidates(userId: string) {
  const { data: candidates } = await supabase
    .from('group_candidates')
    .select('id, proposed_name, detected_members, suggested_group_type, status')
    .eq('user_id', userId)
    .eq('status', 'pending');

  const bad = (candidates ?? []).filter((c: any) => {
    const members = (c.detected_members ?? []).map((m: string) => m.toLowerCase());
    const hasSam = members.some((m: string) => m.includes('sam'));
    const hasKelly = members.some((m: string) => m.includes('kelly'));
    const hasJuan = members.some((m: string) => m.includes('juan'));
    // Wrong: Sam/Kelly in a non-company group, or Kelly grouped with family.
    if (hasSam && hasKelly && c.suggested_group_type !== 'company') return true;
    if (hasKelly && hasJuan) return true;
    return false;
  });

  log(`Bad pending candidates to reject: ${bad.length}`);
  for (const c of bad) {
    log('  •', c.proposed_name ?? '(unnamed)', '::', (c.detected_members ?? []).join(', '), `[${c.suggested_group_type}]`, c.id);
  }
  if (EXECUTE && bad.length > 0) {
    const { error } = await supabase
      .from('group_candidates')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .in('id', bad.map((c: any) => c.id))
      .eq('user_id', userId);
    if (error) throw error;
    log('  rejected.');
  }
}

async function ensureFamilyGroup(userId: string, chars: CharRow[]) {
  // Family = explicit family/kin archetype, OR a name the user addresses with a
  // kinship term at the START ("Tío Juan", "Tía Lourdes", "Abuela"). A kinship
  // word buried in a stage name ("Goth Tio", a club influencer) is NOT family.
  const NON_FAMILY_ARCHETYPES = new Set(['collaborator', 'romantic', 'colleague', 'mentor', 'friend', 'stranger', 'companion']);
  const kinshipStart = /^(?:my\s+)?(abuel[ao]|t[ií]o|t[ií]a|mam[aá]|pap[aá]|nana|nonn[ao]|grandma|grandpa|mom|dad|aunt|uncle)\b/i;
  const family = chars.filter(c => {
    const archetype = (c.archetype ?? '').toLowerCase();
    if (archetype === 'family' || archetype === 'kin') return true;
    if (NON_FAMILY_ARCHETYPES.has(archetype)) return false;
    return kinshipStart.test(c.name.trim());
  });
  log(`Family members detected: ${family.map(f => f.name).join(', ') || 'none'}`);

  // Lift family out of minor/background into the core circle.
  for (const f of family) {
    const patch = {
      relationship_depth: 'close',
      proximity_level: 'direct',
      has_met: true,
      importance_level: 'major',
      importance_score: 65,
      updated_at: new Date().toISOString(),
    };
    log(`  ${f.name}: ${f.importance_level}/${f.relationship_depth ?? 'null'} → major/close`);
    if (EXECUTE) {
      await supabase.from('characters').update(patch).eq('id', f.id).eq('user_id', userId);
    }
  }

  if (family.length < 2) { log('Not enough family for a group.'); return; }

  const { data: existing } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('user_id', userId)
    .or('name.ilike.%family%,group_type.eq.family');
  if ((existing ?? []).length > 0) {
    log('Family org already exists:', (existing ?? [])[0]?.name);
    return;
  }

  log('Will create "My Family" group with:', family.map(f => f.name).join(', '));
  if (EXECUTE) {
    const org = await organizationService.createOrganization(userId, {
      name: 'My Family',
      group_type: 'family',
      type: 'family',
      membership_model: 'strict',
      user_relationship: 'member',
      is_public_entity: false,
      description: 'The user\'s family — lifelong core-circle relationships.',
      status: 'active',
      metadata: { source: 'manual_correction' },
    });
    for (const f of family) {
      await organizationService.addMember(userId, org.id, {
        character_id: f.id,
        character_name: f.name,
        role: 'Family member',
        status: 'active',
      });
    }
    log('Created My Family:', org.id);
  }
}

async function main() {
  const email = arg('--user') ?? process.env.TARGET_USER_EMAIL ?? '';
  if (!email) { console.error('Required: --user <email> or TARGET_USER_EMAIL'); process.exit(1); }
  const userId = await resolveUserId(email);
  console.log(`\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} fix for ${email} (${userId})\n`);

  const chars = await loadCharacters(userId);

  console.log('── Kforce ───────────────────────────────');
  const kforceId = await ensureKforce(userId, chars);

  console.log('\n── Amazon (employer) ────────────────────');
  const amazonId = await ensureAmazonEmployer(userId);

  console.log('\n── Kforce → Amazon ──────────────────────');
  await linkKforceToAmazon(userId, kforceId, amazonId);

  console.log('\n── Bad group candidates ─────────────────');
  await rejectBadCandidates(userId);

  console.log('\n── Family ───────────────────────────────');
  await ensureFamilyGroup(userId, chars);

  console.log(`\nDone.${EXECUTE ? '' : ' (no writes — pass --execute to apply)'}`);
}

main().catch(error => {
  console.error('Fix failed:', error);
  process.exit(1);
});
