/**
 * Role extraction — "as a robot tech", "as an engineer", etc.
 * Review-first; never hard-confirms title without evidence.
 */
import { inferenceBase } from '../inferenceAssociationTypes';

// Word-bounded role titles only (no nested \s* lazy quantifiers — CodeQL js/polynomial-redos).
const ROLE_WORD = String.raw`[A-Za-z][A-Za-z0-9&'-]{0,24}`;
const ROLE_PHRASE = String.raw`${ROLE_WORD}(?:\s+${ROLE_WORD}){0,5}`;
const ROLE_RE = new RegExp(
  String.raw`\b(?:(?:working|currently working|now working)\s+(?:as|at)\s+(?:a|an)\s+(${ROLE_PHRASE})|my\s+role\s+is\s+(${ROLE_PHRASE})|I['’]m\s+(?:a|an)\s+(${ROLE_PHRASE}))\b`,
  'i',
);

// "worked at X as a robot tech with Gary" — word-count bounded capture.
const AS_A_ROLE_RE = new RegExp(
  String.raw`\bas\s+(?:a|an)\s+(${ROLE_WORD}(?:\s+${ROLE_WORD}){0,5})(?=\s+(?:with|at|for|in|on)\b|[.,;!?]|\s*$)`,
  'i',
);

export interface ExtractedRole {
  surface: string;
  normalized: string;
  displayTitle: string;
  confidence: number;
  evidencePhrase: string;
  requiresReview: true;
}

function titleCaseRole(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Expand common shorthand titles for display (not canonical truth). */
function expandRoleTitle(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === 'robot tech') return 'Robot Technician';
  if (t === 'tech') return 'Technician';
  if (/engineer/i.test(t)) return titleCaseRole(raw);
  return titleCaseRole(raw);
}

export function extractRoleFromText(text: string): ExtractedRole | null {
  const m = ROLE_RE.exec(text) ?? AS_A_ROLE_RE.exec(text);
  let surface = (m?.[1] || m?.[2] || m?.[3] || '').trim();
  if (!surface || surface.length < 3) {
    // Fallback direct title detection for known good titles
    const direct = text.match(/\b(Quality Assurance Technician|QA Technician|Robot Technician)\b/i);
    if (direct) surface = direct[1];
    else return null;
  }

  return {
    surface,
    normalized: surface.toLowerCase(),
    displayTitle: expandRoleTitle(surface),
    confidence: 0.87,
    evidencePhrase: m?.[0] || surface,
    requiresReview: true,
  };
}

export function buildRoleCandidate(
  text: string,
  messageId: string
): { role: ExtractedRole | null; skillCandidates: string[] } {
  const role = extractRoleFromText(text);
  const skillCandidates: string[] = [];
  if (role) {
    if (/robot/i.test(role.surface)) skillCandidates.push('robotics');
    if (/tech/i.test(role.surface)) skillCandidates.push('technical operations');
    if (/engineer/i.test(role.surface)) skillCandidates.push('engineering');
  }
  return { role, skillCandidates };
}

export function roleInferenceBase(messageId: string, evidence: string[], confidence: number) {
  return inferenceBase(messageId, evidence, confidence, 'role_from_as_a_pattern', true);
}
