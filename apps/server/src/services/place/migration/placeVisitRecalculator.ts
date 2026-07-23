/**
 * Rebuild visit / mention counts exclusively from explicit spatial evidence.
 */

import { classifyPlaceMentionContext } from '../placeContextClassifier';
import { classifyPlacePresence } from '../../locations/placePresenceSemantics';
import { emptyEvidenceCounts, type PlaceEvidenceCounts } from './placeMigrationTypes';

export type VisitEvidenceItem = {
  text: string;
  sourceId?: string;
  source?: string | null;
  hasCoordinates?: boolean;
};

/**
 * Aggregate evidence texts into PlaceEvidenceCounts.
 * Mentions never become visits; third-party education/work statements stay non-visits for the user.
 */
export function recalculatePlaceVisits(
  placeName: string,
  evidence: VisitEvidenceItem[],
  aliases: string[] = [],
): PlaceEvidenceCounts {
  const counts = emptyEvidenceCounts();
  const names = [placeName, ...aliases].map((n) => n.trim()).filter(Boolean);
  const sourceIds = new Set<string>();

  for (const item of evidence) {
    const text = (item.text ?? '').trim();
    if (!text) continue;
    if (item.sourceId) sourceIds.add(item.sourceId);

    let matched = false;
    for (const name of names) {
      const lower = text.toLowerCase();
      if (!lower.includes(name.toLowerCase()) && !aliases.some((a) => lower.includes(a.toLowerCase()))) {
        continue;
      }
      matched = true;

      const context = classifyPlaceMentionContext(name, text, aliases);
      const presence = classifyPlacePresence(name, text, {
        source: item.source,
        hasCoordinates: item.hasCoordinates,
      });

      counts.mentionCount += 1;

      if (context === 'PLANNED_TO_VISIT') {
        counts.plannedVisitCount += 1;
        break;
      }
      if (context === 'HYPOTHETICAL') {
        counts.hypotheticalCount += 1;
        break;
      }
      if (context === 'LIVED_AT' || context === 'GREW_UP_IN') {
        counts.residenceCount += 1;
        // Residence is not the same as a casual visit count, but implies presence.
        break;
      }
      if (context === 'WORKED_AT') {
        counts.workplaceCount += 1;
        break;
      }
      if (context === 'ATTENDED' || presence === 'attendance') {
        // Event attendance at/near a place — counted separately from place visits.
        counts.attendanceAtPlaceCount += 1;
        break;
      }

      const userVisit =
        context === 'VISITED'
        || context === 'TRAVELED_TO'
        || presence === 'visit';

      // Reject third-party education/origin as user visits.
      if (/\b(?:graduated from|attended|studied at|came from|works? in|worked in)\b/i.test(text)
        && !/\b(?:i|we)\b/i.test(text)) {
        break;
      }

      if (userVisit) {
        counts.explicitVisitCount += 1;
      }
      break;
    }

    if (!matched && item.hasCoordinates) {
      // Coordinate-linked memory without name still may count as a visit for the attached place.
      counts.mentionCount += 1;
      counts.explicitVisitCount += 1;
    }
  }

  counts.uniqueSourceCount = sourceIds.size || (evidence.length > 0 ? evidence.length : 0);
  return counts;
}

/**
 * Deduplicate visit increments that share the same source timestamp / id.
 * One physical visit may arrive via entity extractor + registry writer.
 */
export function dedupeVisitEvidence(evidence: VisitEvidenceItem[]): VisitEvidenceItem[] {
  const seen = new Set<string>();
  const out: VisitEvidenceItem[] = [];
  for (const item of evidence) {
    const key = [
      item.sourceId ?? '',
      (item.text ?? '').trim().toLowerCase().slice(0, 160),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
