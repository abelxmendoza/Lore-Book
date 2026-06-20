/**
 * Role extraction — "as a robot tech", "as an engineer", etc.
 * Review-first; never hard-confirms title without evidence.
 */
import { inferenceBase } from '../inferenceAssociationTypes';

const ROLE_RE = /\bas\s+(?:a|an)\s+([a-z][\w\s-]+?)(?:\s+with|\s*[,.]|$|\s+at\b|\s+for\b)/i;

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
  const m = ROLE_RE.exec(text);
  if (!m?.[1]) return null;
  const surface = m[1].trim();
  if (surface.length < 2) return null;
  return {
    surface,
    normalized: surface.toLowerCase(),
    displayTitle: expandRoleTitle(surface),
    confidence: 0.88,
    evidencePhrase: m[0],
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
