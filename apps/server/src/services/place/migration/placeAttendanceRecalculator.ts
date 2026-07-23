/**
 * Attendance belongs to events; place attendance is only when an event is hosted at the place.
 */

import type { PlaceEvidenceCounts } from './placeMigrationTypes';

export type AttendanceEvidenceItem = {
  text: string;
  eventName?: string;
  placeName?: string;
  sourceId?: string;
};

/**
 * Count explicit event-attendance statements that locate the user at a place.
 * "I attended Anime Expo" is event attendance — not a Place visit for AX-as-place.
 */
export function recalculatePlaceAttendance(
  placeName: string,
  evidence: AttendanceEvidenceItem[],
): Pick<PlaceEvidenceCounts, 'attendanceAtPlaceCount'> {
  let attendanceAtPlaceCount = 0;
  const place = placeName.trim().toLowerCase();

  for (const item of evidence) {
    const text = (item.text ?? '').toLowerCase();
    if (!text) continue;

    const namesPlace = place && text.includes(place);
    const attended = /\b(?:attended|went to|at)\b/.test(text)
      && /\b(?:expo|convention|festival|afters|afterparty|show|concert|prom)\b/.test(text);

    if (namesPlace && attended) {
      attendanceAtPlaceCount += 1;
    }
  }

  return { attendanceAtPlaceCount };
}

/**
 * Event-only attendance (place record is actually an event).
 */
export function isEventAttendanceOnly(text: string): boolean {
  return /\b(?:attended|went to)\b/i.test(text)
    && /\b(?:expo|convention|festival|afters|code red|anime expo|\bax\b)\b/i.test(text)
    && !/\b(?:convention center|venue|club|park|university)\b/i.test(text);
}
