/**
 * Team roster resolution — who is on the user's team, with work-safe
 * relationship types. A person only gets a leadership label from explicit
 * role evidence; nobody ever defaults to romantic/family/friend.
 */

import type { WorkContextInputs, WorkPerson, WorkRelationship } from './workContextTypes';

const FORBIDDEN_DEFAULTS_RE =
  /\b(romantic|crush|girlfriend|boyfriend|lover|dating|family|mother|father|sibling|cousin|friend)\b/i;

function relationshipFromEvidence(roleEvidence: string | null | undefined): {
  relationship: WorkRelationship;
  attendancePattern?: string;
  confidence: number;
} {
  const text = (roleEvidence ?? '').toLowerCase();

  let relationship: WorkRelationship = 'coworker';
  let confidence = 0.6;
  if (/\bmanager\b|\bboss\b/.test(text)) {
    relationship = 'manager';
    confidence = 0.85;
  } else if (/lead\s+engineer/.test(text)) {
    relationship = 'lead_engineer';
    confidence = 0.85;
  } else if (/lead\s+dev(eloper)?/.test(text)) {
    relationship = 'lead_developer';
    confidence = 0.85;
  } else if (/\b(on[- ]?site\s+lead|team\s+lead|main\s+lead)\b/.test(text)) {
    relationship = 'team_lead';
    confidence = 0.85;
  } else if (/\b(veteran|long[- ]tenured|early days|from the beginning)\b/.test(text)) {
    relationship = 'veteran_team_member';
    confidence = 0.7;
  } else if (!text.trim()) {
    relationship = 'coworker';
    confidence = 0.55;
  }

  let attendancePattern: string | undefined;
  const attendance = (roleEvidence ?? '').match(
    /((?:usually |main |not )?on[- ]?site[^.;,]*|when [A-ZÁÉÍÓÚÑ][\w'’-]+ is (?:absent|not there|out)[^.;,]*|not (?:there|around|in) (?:as )?often[^.;,]*)/i,
  );
  if (attendance) attendancePattern = attendance[1].trim();

  return { relationship, attendancePattern, confidence };
}

export function resolveTeamRoster(inputs: WorkContextInputs): {
  managers: WorkPerson[];
  leads: WorkPerson[];
  coworkers: WorkPerson[];
  warnings: string[];
} {
  const managers: WorkPerson[] = [];
  const leads: WorkPerson[] = [];
  const coworkers: WorkPerson[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const person of inputs.workPeople) {
    const key = person.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    // Relationship type safety: a stored romantic/family type is NOT work
    // evidence — surface a warning instead of silently importing it.
    if (person.storedRelationshipType && FORBIDDEN_DEFAULTS_RE.test(person.storedRelationshipType)) {
      warnings.push(
        `"${person.name}" carries non-work relationship type "${person.storedRelationshipType}" — kept out of the work roster until work evidence exists.`,
      );
      continue;
    }

    const { relationship, attendancePattern, confidence } = relationshipFromEvidence(person.roleEvidence);
    const entry: WorkPerson = {
      personId: person.personId,
      displayName: person.name.trim(),
      relationship,
      attendancePattern,
      confidence,
      evidenceIds: person.evidenceIds ?? [],
    };

    if (relationship === 'manager') managers.push(entry);
    else if (relationship === 'team_lead' || relationship === 'lead_engineer' || relationship === 'lead_developer') {
      leads.push(entry);
    } else coworkers.push(entry);
  }

  return { managers, leads, coworkers, warnings };
}

/** Everyone on the roster, for display. */
export function rosterNames(roster: { managers: WorkPerson[]; leads: WorkPerson[]; coworkers: WorkPerson[] }): string[] {
  return [...roster.managers, ...roster.leads, ...roster.coworkers].map((p) => p.displayName);
}
