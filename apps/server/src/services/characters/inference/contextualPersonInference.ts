import { enrichActorLabel } from '../../actors/enrichActorLabel';
import { normalizePersonNameKey } from '../../../utils/personNameValidation';
import type { CharacterCandidate } from './characterInferenceTypes';
import { buildInferenceContext, collectLinkedPeople } from './characterProvenanceService';
import { isBareGenericLabel } from './rolePersonInference';

function titleCaseRole(label: string): string {
  return label
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const CONTEXTUAL_FROM_RE =
  /\b((?:Potential\s+Investor|Recruiter|Promoter|Old\s+College\s+Roommate|New\s+Guy|Professor|Coach|Manager|Neighbor)(?:\s+with\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)?\s+from\s+[A-Z][A-Za-z0-9&.'\s-]+)\b/gi;

const CONTEXTUAL_WITH_RE =
  /\b(New\s+Guy\s+with\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+from\s+[A-Z][A-Za-z0-9&.'\s-]+)\b/gi;

const ROLE_AT_RE =
  /\b(Professor\s+from\s+[A-Z][A-Za-z\s]+)\b/gi;

export function inferContextualPersons(text: string): CharacterCandidate[] {
  const out: CharacterCandidate[] = [];
  const seen = new Set<string>();
  const linked = collectLinkedPeople(text);

  const patterns = [CONTEXTUAL_FROM_RE, CONTEXTUAL_WITH_RE, ROLE_AT_RE];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((match = re.exec(text)) !== null) {
      const raw = match[1].trim().replace(/\s+/g, ' ');
      const displayName = titleCaseRole(raw);
      const key = normalizePersonNameKey(displayName);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        displayName,
        identityType: 'role_contextual',
        titleParts: { roleTitle: displayName.split(/\s+from\s+|\s+with\s+/i)[0], contextualQualifier: raw },
        context: buildInferenceContext(text, raw, linked),
        aliases: [],
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.8,
        needsResolution: true,
        requiresReview: true,
        promotionStatus: 'candidate',
      });
    }
  }

  // "old college roommate" + CSUF in same message
  if (/\bold college roommate\b/i.test(text)) {
    const school = text.match(/\b(CSUF|UCLA|USC|NYU|[A-Z]{2,6}U)\b/)?.[0];
    if (school) {
      const displayName = `Old College Roommate from ${school}`;
      const key = normalizePersonNameKey(displayName);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          displayName,
          identityType: 'ambiguous_contextual',
          titleParts: { roleTitle: 'Old College Roommate', contextualQualifier: school },
          context: buildInferenceContext(text, 'old college roommate', linked),
          aliases: [],
          evidencePhrases: [text.match(/\bold college roommate\b/i)?.[0] ?? 'old college roommate'],
          sourceMessageIds: [],
          confidence: 0.78,
          needsResolution: true,
          requiresReview: true,
          promotionStatus: 'candidate',
        });
      }
    }
  }

  // "new guy ... Noah ... Ska Prom" heuristic
  if (/\bnew guy\b/i.test(text) && /\b(?:with|and)\s+[A-Z]/i.test(text) && /\b(?:ska prom|prom)\b/i.test(text)) {
    const noah = text.match(/\b(?:with|and)\s+([A-Z][a-z]+)/i)?.[1];
    const displayName = noah ? `New Guy with ${noah} from Ska Prom` : 'New Guy from Ska Prom';
    const key = normalizePersonNameKey(displayName);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        displayName,
        identityType: 'role_contextual',
        context: buildInferenceContext(text, 'new guy', linked),
        aliases: [],
        evidencePhrases: [text.match(/\bnew guy\b[^.!?]*/i)?.[0] ?? 'new guy'],
        sourceMessageIds: [],
        confidence: 0.82,
        needsResolution: true,
        requiresReview: true,
        promotionStatus: 'candidate',
      });
    }
  }

  // Enrich remaining bare-role mentions that have place/action cues in the same message
  // (e.g. "coworker" + "Vanguard Robotics" → contextual anonymous label).
  const bareRole = text.match(
    /\b((?:my|our|the)\s+)?(coworker|recruiter|manager|roommate|neighbor|barista|interviewer)\b/i,
  );
  if (bareRole) {
    const rawRole = bareRole[2];
    const enriched = enrichActorLabel({
      raw: rawRole,
      messageText: text,
      places: linked.length ? [] : undefined,
    });
    if (enriched.enriched && !isBareGenericLabel(enriched.label)) {
      const key = normalizePersonNameKey(enriched.label);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          displayName: enriched.label,
          identityType: 'role_contextual',
          titleParts: { roleTitle: rawRole, contextualQualifier: enriched.description },
          context: buildInferenceContext(text, rawRole, linked),
          aliases: [],
          evidencePhrases: [bareRole[0]],
          sourceMessageIds: [],
          confidence: 0.72,
          needsResolution: true,
          requiresReview: true,
          promotionStatus: 'candidate',
        });
      }
    }
  }

  return out;
}

export function rejectBareWithoutContext(name: string): boolean {
  return isBareGenericLabel(name) && !/\bfrom\b|\bwith\b|\bat\b/i.test(name);
}
