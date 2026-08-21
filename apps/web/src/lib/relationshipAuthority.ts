/**
 * Client-side model for Character Connections.
 *
 * Canonical current/history come from characterQuery.sections.relationships
 * (server projectRelationship). This module never treats a raw
 * character_relationships cache row as autobiographical truth except as a
 * migrated baseline when the authority section is absent (demo / no history).
 */

import { isKinshipShapedRelationshipToYou } from './relationshipToYou';
import { isKinshipConnection } from './characterKinshipGroups';

export type RelationshipChangeKind = 'CREATED' | 'TRANSITIONED' | 'ENDED' | 'CORRECTED';

export type RelationshipAuthority =
  | 'USER_EXPLICIT'
  | 'USER_CONFIRMED'
  | 'MANUAL_OPERATOR'
  | 'IMPORTED_SOURCE'
  | 'SYSTEM_DERIVED'
  | 'MIGRATED';

export type RelationshipHistoryRow = {
  id: string;
  fromRelationshipType: string | null;
  fromStatus: string | null;
  toRelationshipType: string | null;
  toStatus: string | null;
  changedAt: string;
  recordedAt: string;
  validUntil: string | null;
  changeKind: RelationshipChangeKind;
  authority: RelationshipAuthority;
  evidenceIds: string[];
  confidence: number | null;
  relationshipId: string | null;
  correctsHistoryId: string | null;
};

export type CurrentRelationshipProjection = {
  type: string | null;
  status: string | null;
  authority: RelationshipAuthority;
  changedAt: string;
  confidence: number | null;
  evidenceIds: string[];
  isMigratedBaseline: boolean;
};

export type RelationshipProjection = {
  current: CurrentRelationshipProjection | null;
  history: RelationshipHistoryRow[];
  correctedAssertions: RelationshipHistoryRow[];
  unresolvedConflicts: string[];
};

export type RelationshipAuthorityDebug = {
  canonicalCharacterId: string;
  counterpartId: string;
  currentType: string | null;
  currentStatus: string | null;
  historyCount: number;
  latestTransition: RelationshipHistoryRow | null;
  latestUserCorrection: RelationshipHistoryRow | null;
  correctedStates: string[];
  authoritySource: RelationshipAuthority | null;
  legacyFallbackActive: boolean;
  unresolvedConflicts: string[];
};

const ENDED_STATUSES = new Set(['ended', 'inactive', 'former', 'closed']);

export function isRelationshipLinkUuid(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function humanizeRelationshipLabel(raw?: string | null): string {
  const value = String(raw ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!value) return '';
  return value.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalizeKey(raw?: string | null): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isEndedStatus(status?: string | null): boolean {
  return ENDED_STATUSES.has(normalizeKey(status));
}

export function isFamilyDimensionType(type?: string | null): boolean {
  if (!type) return false;
  if (isKinshipShapedRelationshipToYou(type)) return true;
  if (isKinshipConnection({ relationship_type: type })) return true;
  const stripped = String(type)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_of$/, '');
  return isKinshipShapedRelationshipToYou(stripped);
}

export function isSocialDimensionType(type?: string | null): boolean {
  if (!type) return false;
  return !isFamilyDimensionType(type);
}

/** User-facing current headline. Never "Friend · active" from a cache row. */
export function describeCurrentRelationship(projection: RelationshipProjection): {
  headline: string;
  typeLabel: string | null;
  statusLabel: string | null;
  isEnded: boolean;
  isCorrectedEmpty: boolean;
} {
  const current = projection.current;
  if (!current) {
    const hadCorrection = projection.correctedAssertions.length > 0;
    return {
      headline: hadCorrection ? 'Not friends' : 'Unknown',
      typeLabel: null,
      statusLabel: hadCorrection ? 'Corrected relationship' : null,
      isEnded: false,
      isCorrectedEmpty: hadCorrection,
    };
  }

  const typeKey = normalizeKey(current.type);
  const typeLabel = humanizeRelationshipLabel(current.type) || null;
  const ended = isEndedStatus(current.status);

  if (typeKey === 'estranged') {
    return {
      headline: 'Estranged',
      typeLabel,
      statusLabel: ended ? 'Ended' : humanizeRelationshipLabel(current.status) || null,
      isEnded: true,
      isCorrectedEmpty: false,
    };
  }

  if (ended) {
    return {
      headline: 'Ended',
      typeLabel,
      statusLabel: 'Ended',
      isEnded: true,
      isCorrectedEmpty: false,
    };
  }

  return {
    headline: typeLabel || humanizeRelationshipLabel(current.status) || 'Unknown',
    typeLabel,
    statusLabel: humanizeRelationshipLabel(current.status) || null,
    isEnded: false,
    isCorrectedEmpty: false,
  };
}

function describeHistoryRow(row: RelationshipHistoryRow): string | null {
  const typeKey = normalizeKey(row.toRelationshipType);
  if (typeKey === 'estranged') return 'Estranged';
  if (isEndedStatus(row.toStatus) && typeKey && typeKey !== 'estranged') {
    return humanizeRelationshipLabel(row.toRelationshipType) || 'Ended';
  }
  if (isEndedStatus(row.toStatus) && !row.toRelationshipType) return 'Ended';
  return humanizeRelationshipLabel(row.toRelationshipType) || null;
}

/**
 * User-facing "Previously" — grounded autobiographical states only.
 * Corrected/mistaken assertions never appear here.
 */
export function listPreviousGroundedStates(projection: RelationshipProjection): string[] {
  const current = describeCurrentRelationship(projection);
  const seen = new Set<string>();
  const previous: string[] = [];

  for (const row of projection.history) {
    const label = describeHistoryRow(row);
    if (!label) continue;
    if (label === current.headline) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    previous.push(label);
  }

  return previous;
}

export function listCorrectedAuditStates(projection: RelationshipProjection): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of projection.correctedAssertions) {
    const label =
      humanizeRelationshipLabel(row.toRelationshipType) ||
      humanizeRelationshipLabel(row.fromRelationshipType);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function latestTransition(projection: RelationshipProjection): RelationshipHistoryRow | null {
  if (projection.history.length === 0) return null;
  return projection.history[projection.history.length - 1] ?? null;
}

export function latestUserCorrection(projection: RelationshipProjection): RelationshipHistoryRow | null {
  const corrections = projection.history
    .filter((row) => row.changeKind === 'CORRECTED' && (row.authority === 'USER_EXPLICIT' || row.authority === 'USER_CONFIRMED'))
    .concat(
      // The CORRECTED ledger row itself may not be in user-facing history when
      // it is a pure retraction; look at recorded rows via correctedAssertions'
      // pairing is not available here, so also scan history.
      [],
    );
  if (corrections.length > 0) return corrections[corrections.length - 1] ?? null;
  return null;
}

export function buildRelationshipAuthorityDebug(
  canonicalCharacterId: string,
  counterpartId: string,
  projection: RelationshipProjection,
): RelationshipAuthorityDebug {
  const current = projection.current;
  return {
    canonicalCharacterId,
    counterpartId,
    currentType: current?.type ?? null,
    currentStatus: current?.status ?? null,
    historyCount: projection.history.length,
    latestTransition: latestTransition(projection),
    latestUserCorrection: latestUserCorrection(projection),
    correctedStates: listCorrectedAuditStates(projection),
    authoritySource: current?.authority ?? null,
    legacyFallbackActive: Boolean(current?.isMigratedBaseline),
    unresolvedConflicts: projection.unresolvedConflicts,
  };
}

/**
 * Chat working-memory uses these same current fields. Modal Current must
 * derive from them — never from a parallel cache read.
 */
export function chatCurrentRelationshipFields(projection: RelationshipProjection): {
  type: string | null;
  status: string | null;
} {
  return {
    type: projection.current?.type ?? null,
    status: projection.current?.status ?? null,
  };
}

/** Mirrors workingMemoryAssembler: `${type}${status ? `, ${status}` : ''}`. */
export function formatChatRelationshipRecall(projection: RelationshipProjection): string | null {
  const current = projection.current;
  if (!current?.type && !current?.status) return null;
  const type = current.type ?? '';
  return current.status ? `${type}${type ? ', ' : ''}${current.status}` : type;
}

export function projectionFromLegacyCache(input: {
  relationship_type?: string | null;
  status?: string | null;
  updated_at?: string | null;
}): RelationshipProjection {
  const type = input.relationship_type ?? null;
  const status = input.status ?? null;
  if (!type && !status) {
    return { current: null, history: [], correctedAssertions: [], unresolvedConflicts: [] };
  }
  return {
    current: {
      type,
      status,
      authority: 'MIGRATED',
      changedAt: input.updated_at || new Date(0).toISOString(),
      confidence: null,
      evidenceIds: [],
      isMigratedBaseline: true,
    },
    history: [],
    correctedAssertions: [],
    unresolvedConflicts: [],
  };
}

export function shouldShowRelationshipDebug(): boolean {
  try {
    return globalThis.localStorage?.getItem('lk:debug-relationships') === '1';
  } catch {
    return false;
  }
}

export type CacheRelationshipEdge = {
  id?: string | null;
  character_id?: string | null;
  character_name?: string | null;
  relationship_type: string;
  status?: string | null;
  summary?: string | null;
  closeness_score?: number | null;
};

export type PartitionedConnections<T extends CacheRelationshipEdge> = {
  social: Array<{ edge: T; projection: RelationshipProjection }>;
  family: T[];
};

/**
 * Family-tree / kinship edges stay structurally distinct. Social/personal
 * history uses the authority projection. A family cousin is not also rendered
 * as social "stranger" unless the projection actually asserts a social state.
 */
export function partitionConnectionsByDimension<T extends CacheRelationshipEdge>(
  edges: T[],
  projections: Record<string, RelationshipProjection> | null | undefined,
): PartitionedConnections<T> {
  const social: Array<{ edge: T; projection: RelationshipProjection }> = [];
  const family: T[] = [];

  for (const edge of edges) {
    const counterpartId = edge.character_id ?? '';
    const authority = counterpartId && projections ? projections[counterpartId] : undefined;
    const projection = authority ?? projectionFromLegacyCache(edge);
    const familyTyped = isFamilyDimensionType(edge.relationship_type) || isFamilyDimensionType(projection.current?.type);
    const socialHistory = projection.history.some((row) => isSocialDimensionType(row.toRelationshipType));
    const socialCurrent = isSocialDimensionType(projection.current?.type);

    if (familyTyped && !socialCurrent && !socialHistory) {
      family.push(edge);
      continue;
    }

    if (socialCurrent || socialHistory || (!familyTyped && (projection.current || edge.relationship_type))) {
      social.push({ edge, projection });
      continue;
    }

    if (familyTyped) family.push(edge);
  }

  return { social, family };
}
