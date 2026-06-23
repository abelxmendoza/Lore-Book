import { normalizeNameKey } from '../../../utils/nameNormalization';

const ALIASES = new Map<string, string>([
  ['la', 'los angeles'],
  ['l.a.', 'los angeles'],
  ['dtla', 'downtown la'],
  ['downtown los angeles', 'downtown la'],
  ['csuf', 'california state university fullerton'],
  ['california state university, fullerton', 'california state university fullerton'],
]);

export function canonicalPlaceKey(value: string): string {
  const key = normalizeNameKey(value)
    .replace(/[’‘]/g, "'")
    .replace(/[.,]/g, '')
    .replace(/\b(?:here|there)\s+at\s+/g, '')
    .replace(/^(?:my|our|the)\s+/g, '')
    .replace(/\bmoms\b/g, "mom's")
    .replace(/\babuelas\b/g, "abuela's")
    .replace(/\btias\b/g, "tia's")
    .replace(/\btios\b/g, "tio's")
    .replace(/\s+/g, ' ')
    .trim();

  const possessive = key.match(/^(.+?)'?s\s+(house|home|apartment|condo|casa|place)$/);
  const normalizedResidence = possessive
    ? `${possessive[1].trim()}'s ${possessive[2] === 'home' || possessive[2] === 'casa' ? 'house' : possessive[2]}`
    : key;

  return ALIASES.get(normalizedResidence) ?? normalizedResidence;
}

export function samePlaceName(a: string, b: string): boolean {
  return canonicalPlaceKey(a) === canonicalPlaceKey(b);
}
