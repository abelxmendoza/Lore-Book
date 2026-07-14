/**
 * Current role resolution — role title, employer, parent org, and tenure from
 * explicit statements only. Never invents an exact start date.
 */

import type { WorkContext, WorkContextInputs, WorkTenure } from './workContextTypes';

const ROLE_AT_ORG_RE =
  /^(.{2,80}?)\s+(?:at|@|for|with)\s+([A-ZÁÉÍÓÚÑ][\w&.'’ -]{1,60}?)(?:\s*[(（]([^)）]{1,60})[)）])?(?:\s*[,;—-]\s*(.{2,80}))?$/;

export function resolveCurrentRole(inputs: WorkContextInputs): Pick<
  WorkContext,
  'currentRole' | 'organization' | 'parentOrganization' | 'team'
> {
  const result: Pick<WorkContext, 'currentRole' | 'organization' | 'parentOrganization' | 'team'> = {};

  const phrase = inputs.employmentPhrase?.trim();
  if (phrase) {
    const m = phrase.match(ROLE_AT_ORG_RE);
    if (m) {
      result.currentRole = {
        title: m[1].trim(),
        status: 'current',
        confidence: 0.9,
        evidenceIds: [],
      };
      result.organization = { name: m[2].trim() };
      if (m[3]) result.parentOrganization = { name: m[3].trim() };
      if (m[4] && /team|group|department|lab/i.test(m[4])) result.team = { name: m[4].trim() };
    } else {
      result.currentRole = { title: phrase, status: 'current', confidence: 0.6, evidenceIds: [] };
    }
  }

  // Organization rows refine/backfill the phrase parse.
  for (const org of inputs.organizations) {
    if (org.isTeam || /team|squad|crew|department|lab$/i.test(org.name)) {
      if (!result.team) result.team = { id: org.id, name: org.name };
      if (org.parentName && !result.organization) result.organization = { name: org.parentName };
    } else if (!result.organization) {
      result.organization = { id: org.id, name: org.name };
      if (org.parentName) result.parentOrganization = { name: org.parentName };
    } else if (
      result.organization &&
      !result.organization.id &&
      org.name.toLowerCase() === result.organization.name.toLowerCase()
    ) {
      result.organization = { id: org.id, name: org.name };
      if (org.parentName && !result.parentOrganization) {
        result.parentOrganization = { name: org.parentName };
      }
    } else if (
      result.parentOrganization &&
      !result.parentOrganization.id &&
      org.name.toLowerCase() === result.parentOrganization.name.toLowerCase()
    ) {
      result.parentOrganization = { id: org.id, name: org.name };
    }
    if (!result.currentRole && org.userRole) {
      result.currentRole = { title: org.userRole, status: 'current', confidence: 0.7, evidenceIds: [] };
    }
  }

  return result;
}

const WEEK_ORDINAL_RE = /\b(?:it'?s\s+)?my\s+(\d{1,2})(?:st|nd|rd|th)?\s+week\b/i;
const MONTH_ORDINAL_RE = /\bmy\s+(\d{1,2})(?:st|nd|rd|th)?\s+month\b/i;

/**
 * "It's my 4th week here" said on date D → started 3–4 weeks before D.
 * Precision stays at 'week'; no exact start date is ever fabricated.
 */
export function inferTenure(statements: WorkContextInputs['tenureStatements']): WorkTenure | undefined {
  for (const s of statements ?? []) {
    const statedAt = new Date(s.statedAt);
    if (Number.isNaN(statedAt.getTime())) continue;

    const weekMatch = s.text.match(WEEK_ORDINAL_RE);
    if (weekMatch) {
      const nth = Number(weekMatch[1]);
      if (nth < 1 || nth > 52) continue;
      const latest = new Date(statedAt.getTime() - (nth - 1) * 7 * 86_400_000);
      const earliest = new Date(statedAt.getTime() - nth * 7 * 86_400_000);
      return {
        phrase: `${nth}th week — about ${nth >= 3 && nth <= 5 ? 'one month' : `${nth} weeks`} in`,
        inferredStartDateRange: {
          earliest: earliest.toISOString().slice(0, 10),
          latest: latest.toISOString().slice(0, 10),
        },
        precision: 'week',
        confidence: 0.8,
      };
    }

    const monthMatch = s.text.match(MONTH_ORDINAL_RE);
    if (monthMatch) {
      const nth = Number(monthMatch[1]);
      if (nth < 1 || nth > 24) continue;
      const latest = new Date(statedAt.getTime() - (nth - 1) * 30 * 86_400_000);
      const earliest = new Date(statedAt.getTime() - nth * 30 * 86_400_000);
      return {
        phrase: `${nth}th month`,
        inferredStartDateRange: {
          earliest: earliest.toISOString().slice(0, 10),
          latest: latest.toISOString().slice(0, 10),
        },
        precision: 'month',
        confidence: 0.7,
      };
    }
  }
  return undefined;
}
