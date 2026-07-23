import { classifyPlacePresence } from '../locations/placePresenceSemantics';
import { classifyPlaceMentionContext } from './placeContextClassifier';
import type { PlaceMentionContext, PlaceVisitInference } from './placeTypes';

/**
 * Mention ≠ visit. Only first-person presence language (or GPS) increments visits.
 * Education/work third-party statements stay at visitCount 0.
 */
export function inferPlaceVisitSignals(
  placeName: string,
  evidenceText = '',
  opts?: { hasCoordinates?: boolean; source?: string | null },
): PlaceVisitInference {
  const context = classifyPlaceMentionContext(placeName, evidenceText);
  const presence = classifyPlacePresence(placeName, evidenceText, {
    source: opts?.source,
    hasCoordinates: opts?.hasCoordinates,
  });

  const userVisited =
    context === 'VISITED'
    || context === 'TRAVELED_TO'
    || context === 'LIVED_AT'
    || (presence === 'visit' && !isThirdPartyOnly(context));

  return {
    mentionCount: 1,
    visitCount: userVisited ? 1 : 0,
    attendanceCount: context === 'ATTENDED' || presence === 'attendance' ? 1 : 0,
    referenceCount: context === 'REFERENCED' || context === 'MENTIONED' ? 1 : 0,
    userVisited,
    context,
  };
}

function isThirdPartyOnly(context: PlaceMentionContext): boolean {
  return context === 'REFERENCED' || context === 'ATTENDED' || context === 'WORKED_AT';
}
