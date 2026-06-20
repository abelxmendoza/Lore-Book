/**
 * Builds meaningful contextual person reference titles when no legal name exists.
 * Reuses title-only guard — bare roles are rejected without disambiguating context.
 */

import { evaluateTitleOnlyPersonGuard, isMinimumPersonEntity } from '../lexical/intelligence/titleOnlyEntityGuard';
import type { ContextualReferenceInput, RankedContextSource } from './personDisplayTitleTypes';

const ROLE_ARTICLE_RE = /^(?:a|an|the|my|our|one of|some)\s+/i;

const CONTEXT_PATTERNS: Array<{
  kind: RankedContextSource['kind'];
  rank: number;
  re: RegExp;
  labelIndex: number;
}> = [
  { kind: 'organization', rank: 1, re: /\bfrom\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3})\b/, labelIndex: 1 },
  { kind: 'organization', rank: 1, re: /\bat\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3})\b/, labelIndex: 1 },
  { kind: 'organization', rank: 1, re: /\b(?:emailed me from|works? at|worked at)\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3})\b/i, labelIndex: 1 },
  { kind: 'event', rank: 2, re: /\b(?:at|from|during)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]+){0,4}(?:Prom|Party|Fest|Con|Show|Gig|Festival))\b/i, labelIndex: 1 },
  { kind: 'group', rank: 3, re: /\bfrom\s+(?:the\s+)?([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3}\s+(?:Class|Team|Band|Club|Squad))\b/i, labelIndex: 1 },
  { kind: 'group', rank: 3, re: /\bfrom\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,3}\s+team)\b/i, labelIndex: 1 },
  { kind: 'place', rank: 4, re: /\bat\s+(?:the\s+)?([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3})\b/, labelIndex: 1 },
  { kind: 'relationship_cluster', rank: 5, re: /\b([A-Z][\w'.-]+)'s\s+(?:friend|friends|cousin|coworker|colleague)\b/, labelIndex: 1 },
  { kind: 'time_period', rank: 6, re: /\bfrom\s+(middle school|high school|college|university|childhood)\b/i, labelIndex: 1 },
];

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeRolePhrase(role: string): string {
  return role.replace(ROLE_ARTICLE_RE, '').trim();
}

function cleanContextLabel(label: string): string {
  return label
    .trim()
    .replace(/^(?:my|our|the)\s+/i, '')
    .replace(/[,.]$/, '');
}

function capitalizeRole(role: string): string {
  const cleaned = normalizeRolePhrase(role);
  if (!cleaned) return '';
  return titleCaseWords(cleaned);
}

export function extractContextSources(text: string): RankedContextSource[] {
  const found: RankedContextSource[] = [];
  const seen = new Set<string>();

  for (const pattern of CONTEXT_PATTERNS) {
    pattern.re.lastIndex = 0;
    const m = pattern.re.exec(text);
    if (!m?.[pattern.labelIndex]) continue;
    const label = cleanContextLabel(m[pattern.labelIndex].trim());
    const key = `${pattern.kind}:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ kind: pattern.kind, label, rank: pattern.rank });
  }

  if (/\bAmazon\b/i.test(text) && !found.some((f) => /amazon/i.test(f.label))) {
    found.push({ kind: 'organization', label: 'Amazon', rank: 1 });
  }
  if (/\bAntler\b/i.test(text) && !found.some((f) => /antler/i.test(f.label))) {
    found.push({ kind: 'organization', label: 'Antler', rank: 1 });
  }

  return found.sort((a, b) => a.rank - b.rank);
}

export function pickBestContext(sources: RankedContextSource[]): RankedContextSource | null {
  if (sources.length === 0) return null;
  return [...sources].sort((a, b) => a.rank - b.rank)[0] ?? null;
}

/** Format: "Potential Investor from Antler" or org-first "Amazon Recruiter" */
export function formatContextualTitle(rolePhrase: string, context: RankedContextSource | null): string {
  const role = capitalizeRole(rolePhrase);
  if (!role) return '';

  if (!context) return role;

  if (context.kind === 'organization') {
    const roleTokens = role.split(/\s+/);
    const lastWord = roleTokens[roleTokens.length - 1]?.toLowerCase() ?? '';
    if (roleTokens.length === 1 && /recruiter|investor|manager|coach|engineer/i.test(lastWord)) {
      return titleCaseWords(`${context.label} ${roleTokens[0] ?? role}`);
    }
  }

  return `${role} from ${context.label}`;
}

export function buildContextualReferenceTitle(input: ContextualReferenceInput): {
  primaryTitle: string;
  contextualQualifier?: string;
  rejected: boolean;
  reason?: string;
} {
  const role = normalizeRolePhrase(input.rolePhrase);
  const guard = evaluateTitleOnlyPersonGuard(role);

  const sources = input.contextSources?.length
    ? [...input.contextSources].sort((a, b) => a.rank - b.rank)
    : extractContextSources(input.text);

  const best = pickBestContext(sources);

  if (guard.isTitleOnly && !best) {
    return {
      primaryTitle: role,
      rejected: true,
      reason: 'bare_title_without_context',
    };
  }

  if (isMinimumPersonEntity(role) && !guard.isTitleOnly) {
    return { primaryTitle: titleCaseWords(role), rejected: false };
  }

  const primaryTitle = formatContextualTitle(role, best);
  if (!primaryTitle || primaryTitle === capitalizeRole(role)) {
    if (guard.isTitleOnly && !best) {
      return { primaryTitle: role, rejected: true, reason: 'bare_title_without_context' };
    }
  }

  return {
    primaryTitle,
    contextualQualifier: best ? `from ${best.label}` : undefined,
    rejected: false,
  };
}

export function buildFunnyContextSubtitle(text: string, primaryTitle: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const snippets = [
    trimmed.match(/(?:who|that)\s+(.{8,80}?)(?:\.|,|$)/i)?.[1],
    trimmed.match(/(.{10,90}?)\s+at\s+[A-Z]/i)?.[1],
    trimmed.length <= 120 ? trimmed : trimmed.slice(0, 117) + '…',
  ].filter(Boolean) as string[];

  const best = snippets[0]?.trim();
  if (!best || best.toLowerCase() === primaryTitle.toLowerCase()) return undefined;
  return best.charAt(0).toUpperCase() + best.slice(1);
}
