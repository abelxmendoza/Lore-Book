/**
 * Place and location category signals.
 */
import type { LexicalPlaceSignal, PlaceCategory } from './lexicalTypes';
import { padForScan, titleCase } from './lexicalNormalizer';

type PlacePattern = { category: PlaceCategory; cues: string[]; nameRe?: RegExp };

const PLACE_PATTERNS: PlacePattern[] = [
  {
    category: 'restaurant',
    cues: ['restaurant', 'diner', 'cafe', 'coffee shop', 'bistro'],
    nameRe: /\bat\s+([A-Z][\w'&.-]{2,40})\s+(?:restaurant|cafe|diner)\b/gi,
  },
  {
    category: 'bar',
    cues: ['bar', 'pub', 'tavern', 'brewery'],
    nameRe: /\bat\s+([A-Z][\w'&.-]{2,40})\s+(?:bar|pub)\b/gi,
  },
  {
    category: 'night_club',
    cues: ['nightclub', 'night club', 'club scene'],
  },
  {
    category: 'music_venue',
    cues: ['concert', 'venue', 'music hall', 'amphitheater', 'amphitheatre'],
    nameRe: /\bat\s+([A-Z][\w'&.-]{2,40})\s+(?:venue|theater|theatre)\b/gi,
  },
  {
    category: 'gym',
    cues: ['gym', 'fitness center', 'crossfit', 'weight room'],
    nameRe: /\bat\s+(?:the\s+)?([A-Z][\w'&.-]{2,40})\s+gym\b/gi,
  },
  {
    category: 'dojo',
    cues: ['dojo', 'martial arts school', 'academy'],
    nameRe: /\bat\s+([A-Z][\w'&.-]{2,40})\s+(?:dojo|academy)\b/gi,
  },
  {
    category: 'school',
    cues: ['school', 'university', 'college', 'campus', 'high school'],
    nameRe: /\bat\s+([A-Z][\w'&.-]{2,60})\s+(?:university|college|school)\b/gi,
  },
  {
    category: 'workplace',
    cues: ['office', 'workplace', 'warehouse', 'factory', 'headquarters'],
    nameRe: /\bat\s+([A-Z][\w'&.-]{2,60})\s+(?:office|hq|headquarters)\b/gi,
  },
  {
    category: 'home',
    cues: ['at home', 'my house', 'my apartment', 'our place', 'back home'],
  },
  {
    category: 'city',
    cues: ['city', 'downtown', 'metro area'],
    nameRe: /\bin\s+([A-Z][\w'&.-]{2,40})\b/g,
  },
  {
    category: 'neighborhood',
    cues: ['neighborhood', 'hood', 'district', 'block'],
  },
  {
    category: 'landmark',
    cues: ['landmark', 'monument', 'bridge', 'park'],
  },
  {
    category: 'event_space',
    cues: ['convention center', 'ballroom', 'event space', 'conference hall'],
  },
];

export function detectLexicalPlaces(text: string): LexicalPlaceSignal[] {
  const padded = padForScan(text);
  const places: LexicalPlaceSignal[] = [];
  const seen = new Set<string>();

  for (const pattern of PLACE_PATTERNS) {
    for (const cue of pattern.cues) {
      if (!padded.includes(` ${cue} `) && !padded.includes(cue)) continue;
      const key = `${pattern.category}:${cue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({
        name: titleCase(cue),
        category: pattern.category,
        cue,
        confidence: 0.7,
      });
    }

    if (pattern.nameRe) {
      pattern.nameRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.nameRe.exec(text)) !== null) {
        const name = m[1].trim();
        const key = `${pattern.category}:${name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        places.push({
          name: titleCase(name),
          category: pattern.category,
          cue: m[0],
          confidence: 0.82,
        });
      }
    }
  }

  return places;
}
