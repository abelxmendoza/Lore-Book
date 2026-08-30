import { readdirSync } from 'node:fs';

const CANONICAL_VERSION = /^\d{14}$/;

/**
 * Production `schema_migrations` versions that the repo must match exactly.
 * Same-name/different-timestamp rows are historical drift; these entries are
 * the closed production history after a migration was applied under a later
 * timestamp than the original local filename.
 */
export const PRODUCTION_LEDGER_CANON = {
  drop_character_timeline_events: '20260821194550',
  revoke_anon_security_definer_rpcs: '20260820003718',
  harden_export_views_and_epiphany_insert: '20260820015515',
};

/**
 * Extra production `schema_migrations.version` values that GitHub Preview
 * compares against filenames. These are deployment-time aliases of the
 * canonical files above; they are not a second SQL payload.
 *
 * GitHub's Supabase App check fails with "Remote migration versions not found
 * in local migrations directory" unless a local `supabase/migrations/<version>_*.sql`
 * file exists for every remote version. Do not replay the canonical SQL under
 * these timestamps. Do not `migration repair` or `db push` to silence the check.
 */
export const PRODUCTION_LEDGER_VERSION_ALIASES = {
  revoke_anon_security_definer_rpcs: '20260822184817',
  harden_export_views_and_epiphany_insert: '20260822184825',
};

export function parseLocalMigrationFilename(filename) {
  const match = filename.match(/^(\d+)_?(.*)\.sql$/i);
  if (!match) return null;
  return {
    version: match[1],
    name: match[2] || match[1],
    filename,
  };
}

export function readLocalMigrations(directory) {
  return readdirSync(directory)
    .filter((filename) => filename.endsWith('.sql'))
    .map(parseLocalMigrationFilename)
    .filter(Boolean)
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

function normalizeRemoteRow(row) {
  const version = String(row?.version ?? '').trim();
  const name = String(row?.name ?? '').trim();
  return { version, name };
}

export function auditMigrationLedger(localRows, remoteRows) {
  const local = localRows.map((row) => ({ ...row }));
  const remote = remoteRows.map(normalizeRemoteRow);
  const localByVersion = new Map();
  const localByName = new Map();
  for (const row of local) {
    localByVersion.set(row.version, [...(localByVersion.get(row.version) ?? []), row]);
    if (row.name) localByName.set(row.name, [...(localByName.get(row.name) ?? []), row]);
  }
  const remoteVersions = new Set(remote.map((row) => row.version));
  const matchedLocalFiles = new Set();

  const exact = [];
  const retimestamped = [];
  const malformedRemote = [];
  const ambiguousMappings = [];
  const remoteOnly = [];

  for (const row of remote) {
    if (!CANONICAL_VERSION.test(row.version)) {
      const baseVersion = row.version.match(/^(\d{14})_/)?.[1] ?? null;
      malformedRemote.push({
        ...row,
        baseVersion,
        duplicatesCanonicalVersion: Boolean(baseVersion && remoteVersions.has(baseVersion)),
      });
      continue;
    }

    const versionCandidates = localByVersion.get(row.version) ?? [];
    const versionMatch = row.name
      ? versionCandidates.find((candidate) => candidate.name === row.name)
      : versionCandidates.length === 1
        ? versionCandidates[0]
        : null;
    if (versionMatch) {
      matchedLocalFiles.add(versionMatch.filename);
      exact.push({ remote: row, local: versionMatch });
      continue;
    }

    const nameCandidates = row.name ? (localByName.get(row.name) ?? []) : [];
    if (nameCandidates.length === 1) {
      const nameMatch = nameCandidates[0];
      matchedLocalFiles.add(nameMatch.filename);
      retimestamped.push({ remote: row, local: nameMatch });
      continue;
    }

    if (versionCandidates.length > 1 || nameCandidates.length > 1) {
      ambiguousMappings.push({
        remote: row,
        candidates: [...new Set([...versionCandidates, ...nameCandidates])],
      });
      continue;
    }

    remoteOnly.push(row);
  }

  const localOnly = local.filter((row) => !matchedLocalFiles.has(row.filename));

  return {
    exact,
    retimestamped,
    malformedRemote,
    ambiguousMappings,
    remoteOnly,
    localOnly,
    safeForAutomaticPush:
      retimestamped.length === 0 &&
      malformedRemote.length === 0 &&
      ambiguousMappings.length === 0 &&
      remoteOnly.length === 0,
  };
}
