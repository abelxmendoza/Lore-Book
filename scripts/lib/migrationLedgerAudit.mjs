import { readdirSync } from 'node:fs';

const CANONICAL_VERSION = /^\d{14}$/;

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
