import type { OrganizationInferenceContext } from './organizationInferenceTypes';

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function buildOrganizationContext(
  text: string,
  span: string,
  partial: OrganizationInferenceContext = {},
): OrganizationInferenceContext {
  return {
    ...partial,
    placeContext: partial.placeContext ?? extractPlaceContext(text),
    worksiteContext: partial.worksiteContext ?? extractWorksiteContext(text, span),
    projectContext: partial.projectContext ?? extractProjectContext(text),
    personContext: partial.personContext ?? extractPersonContext(text),
    timeContext: partial.timeContext ?? extractTimeContext(text),
    roleToUser:
      partial.roleToUser && partial.roleToUser !== 'unknown'
        ? partial.roleToUser
        : inferRoleToUser(text, span),
  };
}

function extractPlaceContext(text: string): string | undefined {
  const m = text.match(/\b(?:in|at|near)\s+([A-Z][A-Za-z\s'.-]+?)(?:\s+in\s+[A-Z][a-z]+)?\b/);
  return m?.[1]?.trim();
}

function extractWorksiteContext(text: string, span: string): string | undefined {
  const chain = text.match(
    new RegExp(`\\b(?:worked|working|deployed|stationed)\\s+at\\s+${escapeRe(span)}\\s+at\\s+([^,.]+)`, 'i'),
  );
  return chain?.[1]?.trim();
}

function extractProjectContext(text: string): string | undefined {
  const m = text.match(/\b(?:building|working on|developing)\s+(LoreBook|Omega-1|Omega)\b/i);
  return m?.[1];
}

function extractPersonContext(text: string): string | undefined {
  const m = text.match(/\b(?:with|from|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  return m?.[1]?.trim();
}

function extractTimeContext(text: string): string | undefined {
  const m = text.match(
    /\b(?:yesterday|last\s+\w+|since\s+\w+|in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i,
  );
  return m?.[0]?.trim();
}

function inferRoleToUser(text: string, span: string): OrganizationInferenceContext['roleToUser'] {
  if (/\b(?:worked|working|hired|interview|offer|onboard|job|employer)\b/i.test(text)) return 'employer';
  if (/\b(?:went to|graduated|class at|enrolled|student at)\b/i.test(text)) return 'school';
  if (/\b(?:investor|funding|accelerator|vc)\b/i.test(text)) return 'investor';
  if (/\b(?:client|customer)\b/i.test(text)) return 'client';
  if (/\b(?:bootcamp|program)\b/i.test(text) && new RegExp(escapeRe(span), 'i').test(text)) return 'program';
  if (/\b(?:api|platform|deploy|hosting|database|auth)\b/i.test(text)) return 'tool_provider';
  return 'unknown';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hasProvenance(candidate: {
  sourceMessageIds: string[];
  evidencePhrases: string[];
  context: OrganizationInferenceContext;
}): boolean {
  return (
    candidate.sourceMessageIds.length > 0 &&
    candidate.evidencePhrases.length > 0 &&
    Boolean(
      candidate.context.roleToUser && candidate.context.roleToUser !== 'unknown'
        ? true
        : candidate.context.placeContext ||
            candidate.context.worksiteContext ||
            candidate.context.personContext ||
            candidate.context.timeContext,
    )
  );
}
