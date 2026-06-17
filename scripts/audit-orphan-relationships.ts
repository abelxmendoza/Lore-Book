#!/usr/bin/env npx tsx
/**
 * Audit character_relationships rows whose source/target no longer exist in characters.
 * Dry-run only — prints remediation candidates; does not delete.
 *
 * Usage:
 *   npx tsx scripts/audit-orphan-relationships.ts [--user email@example.com]
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(): void {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function resolveUserIds(): Promise<string[]> {
  const explicit = arg('--user');
  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');

  if (explicit) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === explicit.toLowerCase());
    if (!user) throw new Error(`No user for ${explicit}`);
    return [user.id];
  }

  const ownerId = process.env.OWNER_USER_ID || process.env.FOUNDER_USER_ID;
  if (ownerId) return [ownerId];

  const ownerEmail =
    process.env.OWNER_EMAIL || process.env.FOUNDER_EMAIL || process.env.ADMIN_EMAIL;
  if (ownerEmail) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase());
    if (!user) throw new Error(`No user for ${ownerEmail}`);
    return [user.id];
  }

  // All users with relationships
  const { data: edges, error } = await supabaseAdmin
    .from('character_relationships')
    .select('user_id');
  if (error) throw error;
  return [...new Set((edges ?? []).map((e) => e.user_id as string))];
}

type OrphanEdge = {
  id: string;
  user_id: string;
  source_character_id: string;
  target_character_id: string;
  relationship_type: string;
  status: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  sourceMissing: boolean;
  targetMissing: boolean;
  sourceRemap?: { id: string; name: string; reason: string };
  targetRemap?: { id: string; name: string; reason: string };
};

async function auditUser(userId: string): Promise<{
  userId: string;
  validCharacterCount: number;
  totalEdges: number;
  orphans: OrphanEdge[];
  ghostIdsReferencedInMetadata: string[];
}> {
  const { supabaseAdmin } = await import('../apps/server/src/services/supabaseClient');

  const { data: characters, error: charErr } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata')
    .eq('user_id', userId);
  if (charErr) throw charErr;

  const charById = new Map((characters ?? []).map((c) => [c.id, c]));
  const charByName = new Map<string, { id: string; name: string }[]>();
  for (const c of characters ?? []) {
    const key = String(c.name ?? '').trim().toLowerCase();
    if (!key) continue;
    const list = charByName.get(key) ?? [];
    list.push({ id: c.id, name: c.name });
    charByName.set(key, list);
  }

  const { data: edges, error: edgeErr } = await supabaseAdmin
    .from('character_relationships')
    .select('id, user_id, source_character_id, target_character_id, relationship_type, status, created_at, metadata')
    .eq('user_id', userId);
  if (edgeErr) throw edgeErr;

  const orphans: OrphanEdge[] = [];

  for (const edge of edges ?? []) {
    const sourceMissing = !charById.has(edge.source_character_id);
    const targetMissing = !charById.has(edge.target_character_id);
    if (!sourceMissing && !targetMissing) continue;

    const row: OrphanEdge = {
      id: edge.id,
      user_id: edge.user_id,
      source_character_id: edge.source_character_id,
      target_character_id: edge.target_character_id,
      relationship_type: edge.relationship_type,
      status: edge.status,
      created_at: edge.created_at,
      metadata: (edge.metadata as Record<string, unknown> | null) ?? null,
      sourceMissing,
      targetMissing,
    };

    // Check omega_entities for missing IDs (might be mistaken omega id)
    const missingIds = [
      ...(sourceMissing ? [edge.source_character_id] : []),
      ...(targetMissing ? [edge.target_character_id] : []),
    ];
    if (missingIds.length) {
      const { data: omega } = await supabaseAdmin
        .from('omega_entities')
        .select('id, primary_name, entity_kind')
        .eq('user_id', userId)
        .in('id', missingIds);
      for (const o of omega ?? []) {
        const nameKey = String(o.primary_name ?? '').trim().toLowerCase();
        const candidates = charByName.get(nameKey) ?? [];
        const remap = candidates.length === 1 ? candidates[0] : undefined;
        if (o.id === edge.source_character_id && remap) {
          row.sourceRemap = { ...remap, reason: `omega_entity name match: ${o.primary_name}` };
        }
        if (o.id === edge.target_character_id && remap) {
          row.targetRemap = { ...remap, reason: `omega_entity name match: ${o.primary_name}` };
        }
      }
    }

    // metadata may store character names from merge
    const metaName =
      (row.metadata?.source_name as string) ||
      (row.metadata?.target_name as string) ||
      (row.metadata?.character_name as string);
    if (metaName) {
      const candidates = charByName.get(metaName.trim().toLowerCase()) ?? [];
      if (candidates.length === 1) {
        if (sourceMissing && !row.sourceRemap) {
          row.sourceRemap = { ...candidates[0], reason: `metadata name: ${metaName}` };
        }
        if (targetMissing && !row.targetRemap) {
          row.targetRemap = { ...candidates[0], reason: `metadata name: ${metaName}` };
        }
      }
    }

    orphans.push(row);
  }

  // Ghost IDs: referenced in relationship metadata but not in characters
  const ghostIds = new Set<string>();
  for (const edge of edges ?? []) {
    const meta = (edge.metadata as Record<string, unknown> | null) ?? {};
    for (const key of ['merged_from', 'canonical_id', 'duplicate_id', 'source_character_id', 'target_character_id']) {
      const v = meta[key];
      if (typeof v === 'string' && !charById.has(v)) ghostIds.add(v);
    }
    if (Array.isArray(meta.merged_from)) {
      for (const id of meta.merged_from) {
        if (typeof id === 'string' && !charById.has(id)) ghostIds.add(id);
      }
    }
  }

  return {
    userId,
    validCharacterCount: characters?.length ?? 0,
    totalEdges: edges?.length ?? 0,
    orphans,
    ghostIdsReferencedInMetadata: [...ghostIds],
  };
}

async function main(): Promise<void> {
  const userIds = await resolveUserIds();
  const reports = [];

  for (const userId of userIds) {
    reports.push(await auditUser(userId));
  }

  const summary = {
    usersAudited: reports.length,
    totalOrphans: reports.reduce((s, r) => s + r.orphans.length, 0),
    remappable: reports.reduce(
      (s, r) =>
        s +
        r.orphans.filter(
          (o) =>
            (!o.sourceMissing || o.sourceRemap) && (!o.targetMissing || o.targetRemap) && (o.sourceRemap || o.targetRemap)
        ).length,
      0
    ),
    safeToDelete: reports.reduce(
      (s, r) =>
        s +
        r.orphans.filter((o) => {
          const srcOk = !o.sourceMissing || !!o.sourceRemap;
          const tgtOk = !o.targetMissing || !!o.targetRemap;
          return !(srcOk && tgtOk && (o.sourceRemap || o.targetRemap || (!o.sourceMissing && !o.targetMissing)));
        }).length,
      0
    ),
    reports: reports.map((r) => ({
      userId: r.userId.slice(0, 8) + '…',
      validCharacters: r.validCharacterCount,
      totalEdges: r.totalEdges,
      orphanCount: r.orphans.length,
      ghostIdsInMetadata: r.ghostIdsReferencedInMetadata.length,
      orphans: r.orphans.map((o) => ({
        id: o.id,
        type: o.relationship_type,
        status: o.status,
        source: {
          id: o.source_character_id,
          missing: o.sourceMissing,
          remap: o.sourceRemap ?? null,
        },
        target: {
          id: o.target_character_id,
          missing: o.targetMissing,
          remap: o.targetRemap ?? null,
        },
        action:
          o.sourceMissing && o.targetMissing && !o.sourceRemap && !o.targetRemap
            ? 'DELETE (both ends missing, no remap)'
            : o.sourceMissing && !o.sourceRemap
              ? 'DELETE (source missing, no remap)'
              : o.targetMissing && !o.targetRemap
                ? 'DELETE (target missing, no remap)'
                : o.sourceRemap || o.targetRemap
                  ? 'REMAP candidate (review first)'
                  : 'REVIEW',
      })),
      ghostIds: r.ghostIdsReferencedInMetadata.slice(0, 20),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
