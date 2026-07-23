/**
 * Phase 1 — Location Domain Audit.
 * Classifies every location row and reports duplicates, orphans, rooms, events, possessives.
 */

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import {
  detectCompoundPlaceNames,
  stripVenueAliasTail,
} from './locations/placePresenceSemantics';
import { classifyPlace, reviewPlaceDuplicateCompatibility, type PlaceClass } from './ontology/placeIntelligence';
import { supabaseAdmin } from './supabaseClient';

function isMissingTable(error?: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === 'PGRST205' ||
        error.code === '42P01' ||
        (typeof error.message === 'string' &&
          (error.message.includes('schema cache') ||
            error.message.includes('Could not find the table') ||
            error.message.includes('does not exist'))))
  );
}

const EMPTY_BY_CATEGORY: Record<PlaceClass, number> = {
  HOUSEHOLD: 0, ROOM: 0, PROPERTY: 0, VENUE: 0, BUSINESS: 0,
  CITY: 0, REGION: 0, EVENT_LOCATION: 0, LANDMARK: 0, UNKNOWN: 0,
};

export type LocationAuditEntry = {
  id: string;
  name: string;
  storedType?: string | null;
  classification: PlaceClass;
  rootType: 'PLACE' | 'EVENT';
  subcategory?: string;
  isRoom: boolean;
  isEvent: boolean;
  possessiveOwner?: string;
  parentLocationId?: string | null;
  confidence: number;
  reason: string;
};

export type LocationDomainAudit = {
  userId: string;
  locationCount: number;
  byCategory: Record<PlaceClass, number>;
  duplicates: Array<{
    names: string[];
    ids: string[];
    confidence: number;
    reason: string;
  }>;
  mergeSuggestions: Array<{
    sourceName: string;
    targetName: string;
    sourceId: string;
    targetId: string;
    confidence: number;
    reason: string;
    evidence: string[];
  }>;
  orphans: Array<{ id: string; name: string; reason: string }>;
  households: string[];
  rooms: string[];
  eventLike: string[];
  possessiveLocations: Array<{ name: string; owner: string; placePart: string }>;
  topLevelViolations: Array<{ id: string; name: string; issue: string }>;
  /** Cards that encode two venues and should be split before merge/review. */
  compoundSplits: Array<{ id: string; name: string; parts: string[]; reason: string }>;
  /** Alias tails / family-home labels that should fold into an existing canon card. */
  aliasCleanup: Array<{
    sourceId: string;
    sourceName: string;
    suggestedCanonical: string;
    targetId?: string;
    reason: string;
  }>;
};

type LocationRow = {
  id: string;
  name: string;
  type?: string | null;
  parent_location_id?: string | null;
  root_type?: string | null;
  spatial_category?: string | null;
};

class LocationDomainAuditService {
  private emptyAudit(userId: string): LocationDomainAudit {
    return {
      userId,
      locationCount: 0,
      byCategory: { ...EMPTY_BY_CATEGORY },
      duplicates: [],
      mergeSuggestions: [],
      orphans: [],
      households: [],
      rooms: [],
      eventLike: [],
      possessiveLocations: [],
      topLevelViolations: [],
      compoundSplits: [],
      aliasCleanup: [],
    };
  }

  async audit(userId: string): Promise<LocationDomainAudit> {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, name, type, parent_location_id, root_type, spatial_category, metadata')
      .eq('user_id', userId)
      .order('name');

    if (error) {
      if (isMissingTable(error)) {
        logger.debug({ userId, code: error.code }, 'locations table unavailable for domain audit');
        return this.emptyAudit(userId);
      }
      throw error;
    }
    const rows = (data ?? []) as LocationRow[];

    const byCategory: Record<PlaceClass, number> = { ...EMPTY_BY_CATEGORY };

    const entries: LocationAuditEntry[] = [];
    const households: string[] = [];
    const rooms: string[] = [];
    const eventLike: string[] = [];
    const possessiveLocations: Array<{ name: string; owner: string; placePart: string }> = [];
    const topLevelViolations: Array<{ id: string; name: string; issue: string }> = [];

    for (const row of rows) {
      const c = classifyPlace(row.name);
      const category = (row.spatial_category as PlaceClass) ?? c.category;
      byCategory[category] = (byCategory[category] ?? 0) + 1;

      entries.push({
        id: row.id,
        name: row.name,
        storedType: row.type,
        classification: category,
        rootType: (row.root_type as 'PLACE' | 'EVENT') ?? c.rootType,
        subcategory: c.subcategory,
        isRoom: c.isRoom || category === 'ROOM',
        isEvent: c.isEvent || c.rootType === 'EVENT',
        possessiveOwner: c.possessive?.ownerName,
        parentLocationId: row.parent_location_id,
        confidence: c.confidence,
        reason: c.reason,
      });

      if (category === 'HOUSEHOLD' || category === 'PROPERTY') households.push(row.name);
      if (c.isRoom || category === 'ROOM') rooms.push(row.name);
      if (c.isEvent || c.rootType === 'EVENT') eventLike.push(row.name);
      if (c.possessive) {
        possessiveLocations.push({ name: row.name, owner: c.possessive.ownerName, placePart: c.possessive.placePart });
      }
      if ((c.isRoom || c.isEvent) && !row.parent_location_id) {
        topLevelViolations.push({
          id: row.id,
          name: row.name,
          issue: c.isEvent ? 'event promoted to top-level place' : 'room without parent household',
        });
      }
    }

    const duplicates: LocationDomainAudit['duplicates'] = [];
    const mergeSuggestions: LocationDomainAudit['mergeSuggestions'] = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const left = rows[i];
        const right = rows[j];
        const pairKey = [left.id, right.id].sort().join(':');
        if (seenPairs.has(pairKey)) continue;

        const leftKey = normalizeNameKey(left.name);
        const rightKey = normalizeNameKey(right.name);
        const review = reviewPlaceDuplicateCompatibility(left.name, right.name);
        const exact = leftKey === rightKey;

        if (exact || review.canMerge) {
          seenPairs.add(pairKey);
          const evidence = [
            exact ? 'normalized name match' : `relationship ${review.relationship}`,
            exact ? 'exact duplicate' : `compatibility ${review.reason}`,
            `canonical: "${classifyPlace(left.name).canonicalName}" vs "${classifyPlace(right.name).canonicalName}"`,
            ...review.evidence,
          ];
          const reason = exact ? 'exact duplicate' : review.reason;

          duplicates.push({ names: [left.name, right.name], ids: [left.id, right.id], confidence: exact ? 1 : review.confidence, reason });
          mergeSuggestions.push({
            sourceName: left.name,
            targetName: right.name,
            sourceId: left.id,
            targetId: right.id,
            confidence: exact ? 1 : review.confidence,
            reason,
            evidence,
          });
        }
      }
    }

    const orphans = rows
      .filter((row) => {
        const c = classifyPlace(row.name);
        return (c.isRoom || c.category === 'ROOM') && !row.parent_location_id;
      })
      .map((row) => ({ id: row.id, name: row.name, reason: 'room without parent_location_id' }));

    const byNormalized = new Map(rows.map((row) => [normalizeNameKey(row.name), row]));
    const compoundSplits: LocationDomainAudit['compoundSplits'] = [];
    const aliasCleanup: LocationDomainAudit['aliasCleanup'] = [];

    for (const row of rows) {
      const parts = detectCompoundPlaceNames(row.name);
      if (parts) {
        compoundSplits.push({
          id: row.id,
          name: row.name,
          parts,
          reason: 'compound_two_venues',
        });
      }

      const stripped = stripVenueAliasTail(row.name);
      if (stripped) {
        const target = byNormalized.get(normalizeNameKey(stripped));
        aliasCleanup.push({
          sourceId: row.id,
          sourceName: row.name,
          suggestedCanonical: stripped,
          targetId: target?.id,
          reason: 'venue_alias_tail',
        });
        if (target && target.id !== row.id) {
          mergeSuggestions.push({
            sourceName: row.name,
            targetName: target.name,
            sourceId: row.id,
            targetId: target.id,
            confidence: 0.92,
            reason: 'venue alias tail',
            evidence: [`"${row.name}" is an alias form of "${target.name}"`],
          });
        }
      }

      // "X Family Home" → household of same city/family when an exact shorter household exists.
      const familyHome = row.name.match(/^(.+?)\s+family\s+home$/i);
      if (familyHome?.[1]) {
        const cityKey = normalizeNameKey(familyHome[1]);
        // Prefer an existing household that shares the city token or a known residence alias pattern.
        const householdTarget = rows.find(
          (candidate) =>
            candidate.id !== row.id &&
            /\b(?:house|home)\b/i.test(candidate.name) &&
            normalizeNameKey(candidate.name).includes(cityKey),
        );
        if (householdTarget) {
          aliasCleanup.push({
            sourceId: row.id,
            sourceName: row.name,
            suggestedCanonical: householdTarget.name,
            targetId: householdTarget.id,
            reason: 'family_home_alias',
          });
          mergeSuggestions.push({
            sourceName: row.name,
            targetName: householdTarget.name,
            sourceId: row.id,
            targetId: householdTarget.id,
            confidence: 0.8,
            reason: 'family home alias of household',
            evidence: [`"${row.name}" likely aliases household "${householdTarget.name}"`],
          });
        }
      }
    }

    return {
      userId,
      locationCount: rows.length,
      byCategory,
      duplicates,
      mergeSuggestions: mergeSuggestions.sort((a, b) => b.confidence - a.confidence),
      orphans,
      households,
      rooms,
      eventLike,
      possessiveLocations,
      topLevelViolations,
      compoundSplits,
      aliasCleanup,
    };
  }

  toMarkdown(audit: LocationDomainAudit): string {
    const lines: string[] = [
      '# Location Domain Audit',
      '',
      `Generated for user \`${audit.userId}\`.`,
      '',
      '## Summary',
      '',
      `- **Location count:** ${audit.locationCount}`,
      `- **Households:** ${audit.households.length}`,
      `- **Rooms:** ${audit.rooms.length}`,
      `- **Event-like locations:** ${audit.eventLike.length}`,
      `- **Possessive locations:** ${audit.possessiveLocations.length}`,
      `- **Duplicate pairs:** ${audit.duplicates.length}`,
      `- **Orphan rooms:** ${audit.orphans.length}`,
      `- **Top-level violations:** ${audit.topLevelViolations.length}`,
      '',
      '## Classification breakdown',
      '',
      '| Category | Count |',
      '| --- | --- |',
      ...Object.entries(audit.byCategory).map(([k, v]) => `| ${k} | ${v} |`),
      '',
    ];

    if (audit.mergeSuggestions.length > 0) {
      lines.push('## Suggested merges', '');
      for (const s of audit.mergeSuggestions.slice(0, 30)) {
        lines.push(`- **${s.sourceName}** ↔ **${s.targetName}** (${(s.confidence * 100).toFixed(0)}% — ${s.reason})`);
        for (const e of s.evidence) lines.push(`  - ${e}`);
      }
      lines.push('');
    }

    if (audit.possessiveLocations.length > 0) {
      lines.push('## Possessive locations (person + place fused)', '');
      for (const p of audit.possessiveLocations) {
        lines.push(`- **${p.name}** → owner \`${p.owner}\`, place part \`${p.placePart}\``);
      }
      lines.push('');
    }

    if (audit.topLevelViolations.length > 0) {
      lines.push('## Top-level violations', '');
      for (const v of audit.topLevelViolations) {
        lines.push(`- **${v.name}** — ${v.issue}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

export const locationDomainAuditService = new LocationDomainAuditService();
