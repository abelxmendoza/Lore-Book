/**
 * High-level ontology audit over existing location rows.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { reclassifyPlaceRecord } from './placeRecordReclassifier';
import type { PlaceMigrationPlanItem } from './placeMigrationTypes';

export type AuditLocationRow = {
  id: string;
  name: string;
  type?: string | null;
  aliases?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Classify every existing place without writing.
 */
export function auditPlaceOntology(
  rows: AuditLocationRow[],
  evidenceById: Map<string, string> = new Map(),
): PlaceMigrationPlanItem[] {
  const knownPlaceIdsByName = new Map<string, string>();
  for (const row of rows) {
    knownPlaceIdsByName.set(normalizeNameKey(row.name), row.id);
  }

  const knownPlaceNames = rows.map((r) => r.name);

  return rows.map((row) =>
    reclassifyPlaceRecord({
      placeId: row.id,
      name: row.name,
      type: row.type,
      aliases: row.aliases,
      metadata: row.metadata,
      evidenceText: evidenceById.get(row.id) ?? '',
      knownPlaceNames,
      knownPlaceIdsByName,
    }),
  );
}
