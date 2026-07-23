/**
 * Lightweight hierarchy hints (room → household, venue area → venue).
 * Full nesting still lives in locationNormalizationService; this only advises cognition.
 */

export function suggestPlaceParentHint(name: string): { parentHint?: string; relation?: 'room_of' | 'area_of' } | null {
  const text = (name ?? '').trim();
  if (!text) return null;

  const room = text.match(/^(?:the\s+)?(.+?)\s+(?:at|in)\s+(.+)$/i);
  if (room?.[1] && room?.[2] && /^(?:kitchen|bedroom|bathroom|garage|pit|stage|dance\s*floor|parking\s+lot)$/i.test(room[1])) {
    return {
      parentHint: room[2].trim(),
      relation: /pit|stage|dance|parking/i.test(room[1]) ? 'area_of' : 'room_of',
    };
  }
  return null;
}
