/**
 * Applies place intelligence classifications to persisted location rows.
 */
import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { classifyPlace, canonicalVenueName, reviewPlaceDuplicateCompatibility } from './ontology/placeIntelligence';
import { getOntologySchemaState } from './ontology/ontologySchemaService';
import { supabaseAdmin } from './supabaseClient';

export type LocationNormalizationReport = {
  processed: number;
  roomsNested: number;
  eventsReclassified: number;
  possessivesLinked: number;
  venuesCanonicalized: number;
  householdsEnsured: number;
  skipped: number;
  schemaReady: boolean;
};

type LocationRow = {
  id: string;
  name: string;
  normalized_name?: string;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  parent_location_id?: string | null;
  associated_character_ids?: string[] | null;
  spatial_category?: string | null;
};

class LocationNormalizationService {
  private findHouseholdParent(rows: LocationRow[], classification: ReturnType<typeof classifyPlace>): LocationRow | undefined {
    const locatedIn = classification.locatedIn?.toLowerCase();
    const householdCandidates = rows.filter((r) => {
      const c = classifyPlace(r.name);
      return c.category === 'HOUSEHOLD' || c.category === 'PROPERTY' || /\b(family\s+home|household)\b/i.test(r.name);
    });

    if (locatedIn) {
      const inCity = householdCandidates.find((r) => r.name.toLowerCase().includes(locatedIn));
      if (inCity) return inCity;
    }

    return (
      householdCandidates.find((r) => /\bfamily\b/i.test(r.name)) ??
      householdCandidates.sort((a, b) => a.name.length - b.name.length)[0]
    );
  }

  private buildCharacterNameIndex(userId: string, characters: Array<{ id: string; name: string; alias?: string[] | null }>) {
    const index = new Map<string, string>();
    for (const ch of characters) {
      index.set(normalizeNameKey(ch.name), ch.id);
      for (const a of ch.alias ?? []) index.set(normalizeNameKey(a), ch.id);
    }
    return index;
  }

  async normalizeUserLocations(userId: string, opts: { dryRun?: boolean } = {}): Promise<LocationNormalizationReport> {
    const { dryRun = false } = opts;
    const schema = await getOntologySchemaState();

    const [{ data, error }, { data: characters }] = await Promise.all([
      supabaseAdmin
        .from('locations')
        .select('id, name, normalized_name, type, metadata, parent_location_id, associated_character_ids, spatial_category')
        .eq('user_id', userId),
      supabaseAdmin.from('characters').select('id, name, alias').eq('user_id', userId),
    ]);

    if (error) throw error;
    const rows = ([...(data ?? [])] as LocationRow[]).sort((a, b) => {
      const ca = classifyPlace(a.name);
      const cb = classifyPlace(b.name);
      if ((ca.category === 'HOUSEHOLD' || ca.category === 'PROPERTY') && cb.isRoom) return -1;
      if ((cb.category === 'HOUSEHOLD' || cb.category === 'PROPERTY') && ca.isRoom) return 1;
      return 0;
    });

    const charIndex = this.buildCharacterNameIndex(userId, characters ?? []);

    const report: LocationNormalizationReport = {
      processed: 0,
      roomsNested: 0,
      eventsReclassified: 0,
      possessivesLinked: 0,
      venuesCanonicalized: 0,
      householdsEnsured: 0,
      skipped: 0,
      schemaReady: schema.locations,
    };

    for (const row of rows) {
      const classification = classifyPlace(row.name);
      report.processed += 1;

      const meta = { ...(row.metadata ?? {}) } as Record<string, unknown>;
      meta.spatial_classification = {
        category: classification.category,
        subcategory: classification.subcategory,
        reason: classification.reason,
        confidence: classification.confidence,
      };
      meta.root_type = classification.rootType;
      meta.spatial_category = classification.category;
      meta.spatial_subcategory = classification.subcategory ?? null;

      const updates: Record<string, unknown> = { metadata: meta };

      if (schema.locations) {
        updates.root_type = classification.rootType;
        updates.spatial_category = classification.category;
        updates.spatial_subcategory = classification.subcategory ?? null;
      }

      if (classification.isEvent) {
        report.eventsReclassified += 1;
        meta.spatial_hidden = true;
        meta.linked_venue_name = classification.canonicalName;
        meta.spatial_relationship = 'HOSTED_AT';
      }

      if (classification.isRoom) {
        const parent = this.findHouseholdParent(rows, classification);
        if (parent && parent.id !== row.id) {
          if (schema.locations) updates.parent_location_id = parent.id;
          meta.parent_location_id = parent.id;
          meta.spatial_relationship = 'INSIDE';
          meta.parent_household_name = parent.name;
          report.roomsNested += 1;
        }
      }

      if (classification.category === 'HOUSEHOLD') report.householdsEnsured += 1;

      if (classification.possessive) {
        meta.possessive_owner = classification.possessive.ownerName;
        meta.possessive_place_part = classification.possessive.placePart;
        meta.spatial_relationship = classification.possessive.ownerIsKin ? 'LIVES_AT' : 'ASSOCIATED_WITH';
        report.possessivesLinked += 1;

        const ownerKey = normalizeNameKey(classification.possessive.ownerName);
        const charId = charIndex.get(ownerKey);
        if (charId) {
          const existing = row.associated_character_ids ?? [];
          if (!existing.includes(charId)) {
            if (schema.locations) updates.associated_character_ids = [...existing, charId];
            meta.associated_character_ids = [...existing, charId];
          }
        }
      }

      const canonical = canonicalVenueName(row.name);
      if (canonical !== row.name && classification.category === 'VENUE') {
        meta.canonical_venue_name = canonical;
        report.venuesCanonicalized += 1;
      }

      updates.metadata = meta;

      if (!dryRun) {
        const { error: updateError } = await supabaseAdmin
          .from('locations')
          .update(updates)
          .eq('id', row.id)
          .eq('user_id', userId);

        if (updateError) {
          const metaOnly = await supabaseAdmin
            .from('locations')
            .update({ metadata: meta })
            .eq('id', row.id)
            .eq('user_id', userId);
          if (metaOnly.error) {
            logger.warn({ updateError, locationId: row.id }, 'Location normalization update failed');
            report.skipped += 1;
          }
        }
      }
    }

    logger.info({ userId, report, dryRun }, 'Location normalization completed');
    return report;
  }

  async getMergeSuggestions(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, name, type, metadata, importance_score')
      .eq('user_id', userId);

    if (error) throw error;
    const rows = data ?? [];
    const suggestions: Array<{
      sourceId: string;
      targetId: string;
      sourceName: string;
      targetName: string;
      confidence: number;
      reason: string;
      evidence: string[];
      affectedMemories: number;
    }> = [];

    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        const pairKey = [a.id, b.id].sort().join(':');
        if (seen.has(pairKey)) continue;

        const canonicalMatch =
          normalizeNameKey(canonicalVenueName(a.name)) === normalizeNameKey(canonicalVenueName(b.name));
        const review = reviewPlaceDuplicateCompatibility(a.name, b.name);
        const confidence = canonicalMatch && review.canMerge ? Math.max(review.confidence, 0.9) : review.confidence;
        if (!review.canMerge || confidence < 0.65) continue;
        seen.add(pairKey);

        const target = (a.importance_score ?? 0) >= (b.importance_score ?? 0) ? a : b;
        const source = target.id === a.id ? b : a;

        suggestions.push({
          sourceId: source.id,
          targetId: target.id,
          sourceName: source.name,
          targetName: target.name,
          confidence,
          reason: review.reason,
          evidence: [
            `relationship: ${review.relationship}`,
            `canonical: "${classifyPlace(source.name).canonicalName}" → "${classifyPlace(target.name).canonicalName}"`,
            ...review.evidence,
          ],
          affectedMemories: 0,
        });
      }
    }

    return suggestions.sort((x, y) => y.confidence - x.confidence);
  }
}

export const locationNormalizationService = new LocationNormalizationService();
